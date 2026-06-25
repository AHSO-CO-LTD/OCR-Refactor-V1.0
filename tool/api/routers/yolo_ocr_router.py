"""
yolo_ocr_router — thuật toán yolo_ocr: cả kiểu A (độc lập) lẫn kiểu B (ký sinh camera).
Dùng CHUNG một instance (YoloOcrService): load 1 lần, A và B đều xài.

A — độc lập (ảnh do client gửi):
    GET  /AI/yolo_ocr/status
    POST /AI/yolo_ocr/load_model     {model_path, conf?, iou?, row_threshold?}
    POST /AI/yolo_ocr/config         {conf?, iou?, row_threshold?}
    POST /AI/yolo_ocr/predict        file (multipart) hoặc raw binary → rows
    WS   /AI/yolo_ocr/predict        gửi ảnh binary liên tục → {success, rows}

B — ký sinh stream camera (lấy frame từ camera, dùng model đã load ở A):
    POST /camera/{id}/AI/yolo_ocr/start
    POST /camera/{id}/AI/yolo_ocr/stop
    WS   /camera/{id}/AI/yolo_ocr/results   → {seq, success, rows} liên tục
"""

from __future__ import annotations

import logging
import base64
import time
from typing import Any, Dict, List, Optional, Union

import cv2
import numpy as np
from fastapi import APIRouter, File, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from core.tools.base import ToolError

router = APIRouter()
logger = logging.getLogger(__name__)

DETECTOR_NAME = "AI/yolo_ocr"


class LoadModelRequest(BaseModel):
    model_path: str = Field(..., description="Đường dẫn .pt trên máy server")
    conf: Optional[float] = Field(None, description="Ngưỡng chấp nhận (mặc định 0.5)")
    iou: Optional[float] = Field(None, description="Ngưỡng khử trùng lặp (mặc định 0.5)")
    row_threshold: Optional[int] = Field(None, description="Sai số pixel gom hàng (mặc định 20)")


class ConfigRequest(BaseModel):
    conf: Optional[float] = None
    iou: Optional[float] = None
    row_threshold: Optional[int] = None


class Roi(BaseModel):
    """Một vùng — dùng (x,y,w,h) HOẶC (x1,y1,x2,y2). to_box() chuẩn hoá về (x,y,w,h)."""

    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    x1: Optional[int] = None
    y1: Optional[int] = None
    x2: Optional[int] = None
    y2: Optional[int] = None

    def to_box(self):
        if None not in (self.x, self.y, self.w, self.h):
            return (int(self.x), int(self.y), int(self.w), int(self.h))
        if None not in (self.x1, self.y1, self.x2, self.y2):
            return (int(self.x1), int(self.y1), int(self.x2 - self.x1), int(self.y2 - self.y1))
        raise ToolError("ROI phải có đủ (x,y,w,h) hoặc (x1,y1,x2,y2)")


class DetectStartRequest(BaseModel):
    """Tham số bật B. rois: 1 ROI hoặc list ROI; bỏ trống = detect toàn frame."""

    rois: Optional[Union[Roi, List[Roi]]] = None


class OCRRoiRequestItem(BaseModel):
    label: Optional[str] = None
    x: int
    y: int
    width: int
    height: int
    rotation: float = 0.0
    rotate_clockwise: bool = False


class OCRRoisRequest(BaseModel):
    model_path: Optional[str] = None
    image_base64: Optional[str] = None
    grab_from_camera: bool = False
    roi_list: List[OCRRoiRequestItem] = Field(default_factory=list)
    acceptance_threshold_ocr: Optional[float] = None
    duplication_threshold_ocr: Optional[float] = None
    row_threshold: Optional[int] = None
    encode_format: str = ".jpg"
    jpeg_quality: int = 95


def _decode(data: bytes) -> Optional[np.ndarray]:
    if not data:
        return None
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def _decode_base64_image(value: str) -> Optional[np.ndarray]:
    if "," in value and value.strip().lower().startswith("data:"):
        value = value.split(",", 1)[1]
    return _decode(base64.b64decode(value))


def _grab_active_camera_frame(request: Request) -> np.ndarray:
    from api.routers.camera_router import _active_session

    session = _active_session(request.app.state.camera_manager)
    frame = session.tool.grab()
    if frame is None:
        raise ToolError("Could not grab camera frame")
    return frame


# ── A: độc lập ────────────────────────────────────────────────────────────
@router.get("/AI/yolo_ocr/status")
async def status(request: Request) -> Dict[str, Any]:
    return {"success": True, "status": request.app.state.yolo_ocr_service.status()}


@router.get("/ocr/status")
async def compat_ocr_status(request: Request) -> Dict[str, Any]:
    return {"success": True, "status": request.app.state.yolo_ocr_service.status()}


@router.post("/AI/yolo_ocr/load_model")
async def load_model(request: Request, body: LoadModelRequest) -> Dict[str, Any]:
    service = request.app.state.yolo_ocr_service
    try:
        st = await run_in_threadpool(
            service.load_model, body.model_path, body.conf, body.iou, body.row_threshold
        )
        return {"success": True, "status": st}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.post("/ocr/load-model")
async def compat_load_model(request: Request, body: LoadModelRequest) -> Dict[str, Any]:
    return await load_model(request, body)


@router.post("/AI/yolo_ocr/config")
async def set_config(request: Request, body: ConfigRequest) -> Dict[str, Any]:
    service = request.app.state.yolo_ocr_service
    try:
        st = service.configure(conf=body.conf, iou=body.iou, row_threshold=body.row_threshold)
        return {"success": True, "status": st}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.post("/ocr/config")
async def compat_config(request: Request, body: ConfigRequest) -> Dict[str, Any]:
    return await set_config(request, body)


@router.post("/ocr/rois")
async def ocr_rois(request: Request, body: OCRRoisRequest) -> Dict[str, Any]:
    started_at = time.time()
    service = request.app.state.yolo_ocr_service

    try:
        if body.model_path:
            await run_in_threadpool(
                service.load_model,
                body.model_path,
                body.acceptance_threshold_ocr,
                body.duplication_threshold_ocr,
                body.row_threshold,
            )
        elif body.acceptance_threshold_ocr is not None or body.duplication_threshold_ocr is not None or body.row_threshold is not None:
            service.configure(
                conf=body.acceptance_threshold_ocr,
                iou=body.duplication_threshold_ocr,
                row_threshold=body.row_threshold,
            )

        if body.grab_from_camera:
            image = await run_in_threadpool(_grab_active_camera_frame, request)
        elif body.image_base64:
            image = _decode_base64_image(body.image_base64)
        else:
            return {
                "success": False,
                "image_width": 0,
                "image_height": 0,
                "cycle_time_ms": 0,
                "results": [],
                "error": "image_base64 is required when grab_from_camera is false",
            }

        if image is None:
            raise ToolError("Could not decode source image")

        image_height, image_width = image.shape[:2]
        results = []
        for index, roi in enumerate(body.roi_list):
            x0 = max(0, roi.x)
            y0 = max(0, roi.y)
            x1 = min(image_width, roi.x + roi.width)
            y1 = min(image_height, roi.y + roi.height)

            if x1 <= x0 or y1 <= y0:
                results.append(
                    {
                        "index": index,
                        "label": roi.label,
                        "text": "",
                        "x": roi.x,
                        "y": roi.y,
                        "width": roi.width,
                        "height": roi.height,
                        "error": "ROI is outside the image",
                    }
                )
                continue

            if roi.rotation:
                cx = roi.x + roi.width / 2
                cy = roi.y + roi.height / 2
                matrix = cv2.getRotationMatrix2D((float(cx), float(cy)), float(roi.rotation), 1.0)
                rotated_full = cv2.warpAffine(
                    image,
                    matrix,
                    (image_width, image_height),
                    flags=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_REPLICATE,
                )
                crop = rotated_full[y0:y1, x0:x1]
            else:
                crop = image[y0:y1, x0:x1]

            if roi.rotate_clockwise and not roi.rotation:
                crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)

            prediction = await run_in_threadpool(service.predict, crop)
            rows = prediction.get("rows") or []
            results.append(
                {
                    "index": index,
                    "label": roi.label,
                    "text": " ".join(str(row) for row in rows),
                    "x": roi.x,
                    "y": roi.y,
                    "width": roi.width,
                    "height": roi.height,
                    "error": None if prediction.get("success") else prediction.get("error", "OCR failed"),
                }
            )

        return {
            "success": True,
            "image_width": image_width,
            "image_height": image_height,
            "cycle_time_ms": round((time.time() - started_at) * 1000, 3),
            "results": results,
            "error": None,
        }
    except ToolError as e:
        return {
            "success": False,
            "image_width": 0,
            "image_height": 0,
            "cycle_time_ms": round((time.time() - started_at) * 1000, 3),
            "results": [],
            "error": str(e),
        }


@router.post("/AI/yolo_ocr/predict")
async def predict(
    request: Request,
    file: UploadFile = File(None),
    debug_image: bool = False,
) -> Dict[str, Any]:
    """Predict 1 ảnh — nhận file (multipart) HOẶC raw binary trong body."""
    service = request.app.state.yolo_ocr_service
    data = await file.read() if file is not None else await request.body()
    img = _decode(data)
    if img is None:
        return {"success": False, "error": "Không decode được ảnh"}
    try:
        return await run_in_threadpool(service.predict, img, debug_image)
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.websocket("/AI/yolo_ocr/predict")
async def predict_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    service = websocket.app.state.yolo_ocr_service
    logger.info("[yolo_ocr predict WS] connected")
    try:
        while True:
            data = await websocket.receive_bytes()
            img = _decode(data)
            if img is None:
                await websocket.send_json({"success": False, "error": "decode lỗi"})
                continue
            try:
                result = await run_in_threadpool(service.predict, img)
            except ToolError as e:
                result = {"success": False, "error": str(e)}
            await websocket.send_json(result)
    except (WebSocketDisconnect, RuntimeError):
        logger.info("[yolo_ocr predict WS] disconnected")
    except Exception as e:
        logger.error("[yolo_ocr predict WS] lỗi: %s", e)


# ── B: ký sinh stream camera ──────────────────────────────────────────────
@router.post("/camera/{cam_id}/AI/yolo_ocr/start")
async def detect_start(
    request: Request, cam_id: str, body: Optional[DetectStartRequest] = None
) -> Dict[str, Any]:
    """
    Gắn yolo_ocr (đã load ở A) vào stream camera. Chưa load model → lỗi.
    body.rois (tuỳ chọn): 1 ROI hoặc list ROI → infer lần lượt từng vùng; bỏ trống
    → infer toàn frame.
    """
    manager = request.app.state.camera_manager
    service = request.app.state.yolo_ocr_service
    try:
        detector = service.detector()  # raise nếu chưa load
        rois = None
        if body is not None and body.rois is not None:
            items = body.rois if isinstance(body.rois, list) else [body.rois]
            rois = [r.to_box() for r in items]
        manager.get(cam_id).start_detector(detector, DETECTOR_NAME, rois)
        return {"success": True, "rois": rois}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.post("/camera/{cam_id}/AI/yolo_ocr/stop")
async def detect_stop(request: Request, cam_id: str) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        manager.get(cam_id).stop_detector()
        return {"success": True}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.websocket("/camera/{cam_id}/AI/yolo_ocr/results")
async def detect_results(websocket: WebSocket, cam_id: str) -> None:
    await websocket.accept()
    manager = websocket.app.state.camera_manager
    try:
        session = manager.get(cam_id)
    except ToolError as e:
        await websocket.close(code=1008, reason=str(e))
        return
    if session.results_channel.has_consumer():
        await websocket.close(code=1008, reason="Đã có client nhận kết quả")
        return

    queue = session.results_channel.open()
    logger.info("[yolo_ocr results:%s] connected", cam_id)
    try:
        while True:
            await websocket.send_json(await queue.get())
    except (WebSocketDisconnect, RuntimeError):
        logger.info("[yolo_ocr results:%s] disconnected", cam_id)
    except Exception as e:
        logger.error("[yolo_ocr results:%s] lỗi: %s", cam_id, e)
    finally:
        session.results_channel.close()
