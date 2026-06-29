"""
camera_router — REST điều khiển + WebSocket live stream cho camera.

Client tự chọn driver qua request (đổi camera = đổi `driver`, server không sửa):
    POST /tool/v1/camera/connect  {"driver": "basler", "params": {"interface": "GigE"}}

REST:
    GET  /camera/drivers              liệt kê driver đã đăng ký
    POST /camera/connect              mở camera, trả tool_id + trạng thái
    GET  /camera/list                 danh sách camera đang mở
    GET  /camera/{id}/status          trạng thái 1 camera
    GET  /camera/{id}/info            thông tin nhận dạng (model, serial)
    GET  /camera/{id}/max             giá trị Max của 1 tham số (?feature=Width)
    GET  /camera/{id}/ranges          {min,max,inc,value} các tham số settable
    GET  /camera/{id}/debug_info      chẩn đoán debug (fps trần, băng thông)
    POST /camera/{id}/param           đổi exposure/roi lúc chạy
    GET  /camera/{id}/grab            chụp 1 frame -> ảnh JPEG
    POST /camera/{id}/disconnect      đóng camera
WebSocket:
    WS   /camera/{id}/stream          live stream frame JPEG (binary)

Lưu ý: detect (B) ký sinh stream camera nằm ở router của TỪNG thuật toán,
vd /camera/{id}/AI/yolo_ocr/start|stop + WS .../results (xem yolo_ocr_router).
"""

from __future__ import annotations

import logging
import base64
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from core.registry import cameras
from core.tools.base import ToolError

router = APIRouter()
logger = logging.getLogger(__name__)
ACTIVE_CAMERA_ID = "active-camera"


# -- Schemas ---------------------------------------------------------------
class CameraConnectParams(BaseModel):
    """Tham số mở camera. extra=allow → driver đặc thù có thể nhận thêm khoá khác."""

    model_config = ConfigDict(extra="allow")

    interface: str = Field("GigE", description="Loại kết nối: GigE / USB / CXP")
    serial: Optional[str] = Field(None, description="Chọn theo serial; trống = camera đầu")
    exposure: int = Field(3000, description="Thời gian phơi sáng (µs)")
    jpeg_quality: int = Field(80, description="Chất lượng JPEG khi stream/grab (1-100)")


class ConnectRequest(BaseModel):
    driver: str = Field("basler", description="Tên driver đã đăng ký")
    params: CameraConnectParams = Field(default_factory=CameraConnectParams)
    id: Optional[str] = Field(None, description="Tự đặt tool_id; bỏ trống sẽ tự sinh")


class ParamRequest(BaseModel):
    exposure: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    offset_x: Optional[int] = None
    offset_y: Optional[int] = None
    roi: Optional[Tuple[int, int, int, int]] = Field(
        None, description="(x, y, w, h) — đặt cả 4 cùng lúc, thay cho width/height/offset"
    )


def _device_info(device, index: int) -> Dict[str, Any]:
    def safe(method_name: str):
        try:
            return getattr(device, method_name)()
        except Exception:
            return None

    model_name = safe("GetModelName")
    serial_number = safe("GetSerialNumber")
    friendly_name = safe("GetFriendlyName") or " ".join(
        str(value) for value in [model_name, serial_number] if value
    )
    return {
        "index": index,
        "friendly_name": friendly_name,
        "model_name": model_name,
        "serial_number": serial_number,
        "device_class": safe("GetDeviceClass"),
    }


def _list_basler_devices() -> List[Dict[str, Any]]:
    from pypylon import pylon

    devices = pylon.TlFactory.GetInstance().EnumerateDevices()
    return [_device_info(device, index) for index, device in enumerate(devices)]


def _active_session(manager):
    sessions = manager.list()
    if not sessions:
        raise ToolError("Camera is not connected")
    active = next(
        (item for item in sessions if item.get("id") == ACTIVE_CAMERA_ID),
        sessions[0],
    )
    return manager.get(active["id"])


def _camera_status_payload(session) -> Dict[str, Any]:
    status = session.status()
    try:
        info = session.tool.info()
    except Exception:
        info = {}
    geometry = status.get("geometry") or {}
    device_name = " ".join(
        str(value)
        for value in [info.get("model"), info.get("serial")]
        if value
    )

    return {
        "connected": True,
        "is_grabbing": status.get("state") == "running",
        "has_last_frame": True,
        "active_device_index": None,
        "active_device": {
            "friendly_name": device_name or info.get("model"),
            "model_name": info.get("model"),
            "serial_number": info.get("serial"),
            "device_class": "Basler",
        },
        "device_name": device_name,
        "fps": status.get("fps"),
        "exposure": status.get("exposure"),
        "geometry": geometry,
        "image_width": geometry.get("width"),
        "image_height": geometry.get("height"),
        "offset_x": geometry.get("offset_x"),
        "offset_y": geometry.get("offset_y"),
    }


def _normalize_compat_connect(body: Dict[str, Any]) -> Dict[str, Any]:
    if "driver" in body or "params" in body or "id" in body:
        params = dict(body.get("params") or {})
        return {
            "driver": body.get("driver") or "basler",
            "id": body.get("id"),
            "params": params,
            "compat": False,
        }

    params: Dict[str, Any] = {}
    for source, target in (
        ("exposure", "exposure"),
        ("width", "width"),
        ("height", "height"),
        ("offset_x", "offset_x"),
        ("offset_y", "offset_y"),
        ("jpeg_quality", "jpeg_quality"),
    ):
        if body.get(source) is not None:
            params[target] = body[source]

    device_index = body.get("device_index")
    if device_index is not None:
        devices = _list_basler_devices()
        try:
            device = devices[int(device_index)]
        except (IndexError, TypeError, ValueError) as exc:
            raise ToolError(f"Camera device_index {device_index} is out of range") from exc
        if device.get("serial_number"):
            params["serial"] = device["serial_number"]

    return {
        "driver": "basler",
        "id": ACTIVE_CAMERA_ID,
        "params": params,
        "compat": True,
    }


# -- REST ------------------------------------------------------------------
@router.get("/camera/drivers")
async def list_drivers() -> Dict[str, List[str]]:
    return {"drivers": cameras.names()}


@router.get("/camera/devices")
async def list_camera_devices() -> List[Dict[str, Any]]:
    return _list_basler_devices()


@router.get("/camera/status")
async def active_camera_status(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        data = _camera_status_payload(session)
    except ToolError:
        data = {
            "connected": False,
            "is_grabbing": False,
            "has_last_frame": False,
            "active_device_index": None,
            "active_device": None,
            "device_name": None,
        }

    try:
        devices = _list_basler_devices()
        data.update(
            {
                "available_device_count": len(devices),
                "available_devices": devices,
                "device_scan_error": None,
            }
        )
    except Exception as exc:
        data.update(
            {
                "available_device_count": None,
                "available_devices": [],
                "device_scan_error": str(exc),
            }
        )

    return {"success": True, "data": data}


@router.post("/camera/connect")
async def connect_camera(request: Request, body: Dict[str, Any]) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        normalized = _normalize_compat_connect(body)
        if normalized["compat"]:
            try:
                existing = manager.get(normalized["id"])
                existing.tool.set_param(**normalized["params"])
                return {"success": True, **existing.status()}
            except ToolError:
                pass
        session = manager.connect(
            normalized["driver"],
            normalized["params"],
            normalized["id"],
        )
        return {"success": True, **session.status()}
    except (ToolError, KeyError) as e:
        return {"success": False, "error": str(e)}


@router.post("/camera/settings")
async def active_camera_settings(request: Request, body: ParamRequest) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    params = {
        k: v
        for k, v in {
            "exposure": body.exposure,
            "width": body.width,
            "height": body.height,
            "offset_x": body.offset_x,
            "offset_y": body.offset_y,
            "roi": body.roi,
        }.items()
        if v is not None
    }
    try:
        session = _active_session(manager)
        session.tool.set_param(**params)
        return {"success": True, "applied": params, "status": session.tool.status()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.post("/camera/grab")
async def active_camera_grab(request: Request, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        jpeg = session.grab_jpeg()
        if jpeg is None:
            return {"success": False, "error": "Could not grab camera frame"}
        return {
            "success": True,
            "width": session.status().get("geometry", {}).get("width", 0),
            "height": session.status().get("geometry", {}).get("height", 0),
            "channels": 3,
            "capture_time_ms": 0,
            "image_base64": base64.b64encode(jpeg).decode("ascii"),
            "encode_format": (body or {}).get("encode_format", ".jpg"),
        }
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/frame-rate")
async def active_camera_frame_rate(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        status = session.status()
        try:
            diagnostics = session.tool.diagnostics()
        except Exception:
            diagnostics = {}
        fps = (
            diagnostics.get("resulting_fps")
            or diagnostics.get("acquisition_fps")
            or status.get("fps")
            or 0
        )
        return {
            "success": True,
            "data": {
                "connected": True,
                "requested_stream_fps": None,
                "configured_fps": diagnostics.get("acquisition_fps"),
                "camera_resulting_fps": fps,
                "camera_max_fps": fps,
                "effective_stream_fps": fps,
                "writable": False,
                "error": None,
                "source": {
                    "status": status,
                    "diagnostics": diagnostics,
                },
            },
        }
    except ToolError as e:
        return {
            "success": True,
            "data": {
                "connected": False,
                "requested_stream_fps": None,
                "configured_fps": None,
                "camera_resulting_fps": None,
                "camera_max_fps": None,
                "effective_stream_fps": None,
                "writable": False,
                "error": str(e),
                "source": None,
            },
        }


@router.get("/camera/ranges")
async def active_camera_ranges(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        return {"success": True, "ranges": session.tool.get_ranges()}
    except ToolError as e:
        return {"success": False, "error": str(e), "ranges": {}}


@router.get("/camera/debug-info")
async def active_camera_debug_info(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        return {"success": True, "diagnostics": session.tool.diagnostics()}
    except ToolError as e:
        return {"success": False, "error": str(e), "diagnostics": {}}


@router.post("/camera/disconnect")
async def active_camera_disconnect(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        session = _active_session(manager)
        manager.disconnect(session.tool.tool_id)
        return {"success": True}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/list")
async def list_cameras(request: Request) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    return {"success": True, "cameras": manager.list()}


@router.get("/camera/{cam_id}/status")
async def camera_status(request: Request, cam_id: str) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        return {"success": True, **manager.get(cam_id).status()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/{cam_id}/info")
async def camera_info(request: Request, cam_id: str) -> Dict[str, Any]:
    """Thông tin nhận dạng camera (model, serial, vendor)."""
    manager = request.app.state.camera_manager
    try:
        return {"success": True, "info": manager.get(cam_id).tool.info()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/{cam_id}/max")
async def camera_max(request: Request, cam_id: str, feature: str) -> Dict[str, Any]:
    """Giá trị Max cho phép của một tham số (vd ?feature=Width / Height / ExposureTimeAbs)."""
    manager = request.app.state.camera_manager
    try:
        return {"success": True, "feature": feature, "max": manager.get(cam_id).tool.get_max_value(feature)}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/{cam_id}/ranges")
async def camera_ranges(request: Request, cam_id: str) -> Dict[str, Any]:
    """Range {min,max,inc,value} của width/height/offset_x/offset_y/exposure để validate."""
    manager = request.app.state.camera_manager
    try:
        return {"success": True, "ranges": manager.get(cam_id).tool.get_ranges()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/{cam_id}/debug_info")
async def camera_debug_info(request: Request, cam_id: str) -> Dict[str, Any]:
    """Chẩn đoán (debug): trần fps phần cứng, băng thông, packet size..."""
    manager = request.app.state.camera_manager
    try:
        return {"success": True, "diagnostics": manager.get(cam_id).tool.diagnostics()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.post("/camera/{cam_id}/param")
async def set_param(request: Request, cam_id: str, body: ParamRequest) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    params: Dict[str, Any] = {
        k: v
        for k, v in {
            "exposure": body.exposure,
            "width": body.width,
            "height": body.height,
            "offset_x": body.offset_x,
            "offset_y": body.offset_y,
            "roi": body.roi,
        }.items()
        if v is not None
    }
    try:
        session = manager.get(cam_id)
        session.tool.set_param(**params)
        return {"success": True, "applied": params, "status": session.tool.status()}
    except ToolError as e:
        return {"success": False, "error": str(e)}


@router.get("/camera/{cam_id}/grab")
async def grab_frame(request: Request, cam_id: str) -> Response:
    manager = request.app.state.camera_manager
    try:
        jpeg = manager.get(cam_id).grab_jpeg()
    except ToolError as e:
        return Response(content=str(e), status_code=400, media_type="text/plain")
    if jpeg is None:
        return Response(content="Không lấy được frame", status_code=503, media_type="text/plain")
    return Response(content=jpeg, media_type="image/jpeg")


@router.post("/camera/{cam_id}/disconnect")
async def disconnect_camera(request: Request, cam_id: str) -> Dict[str, Any]:
    manager = request.app.state.camera_manager
    try:
        manager.disconnect(cam_id)
        return {"success": True}
    except ToolError as e:
        return {"success": False, "error": str(e)}


# -- WebSocket -------------------------------------------------------------
@router.websocket("/camera/stream")
async def active_camera_stream(websocket: WebSocket) -> None:
    manager = websocket.app.state.camera_manager
    try:
        session = _active_session(manager)
        cam_id = session.tool.tool_id
    except ToolError as e:
        await websocket.accept()
        await websocket.close(code=1008, reason=str(e))
        return

    await camera_stream(websocket, cam_id)


@router.websocket("/camera/{cam_id}/stream")
async def camera_stream(websocket: WebSocket, cam_id: str) -> None:
    await websocket.accept()
    manager = websocket.app.state.camera_manager

    try:
        session = manager.get(cam_id)
    except ToolError as e:
        await websocket.close(code=1008, reason=str(e))
        return

    if session.frames_channel.has_consumer():
        await websocket.close(code=1008, reason="Camera đã có client đang xem")
        return

    queue = session.frames_channel.open()
    session.start_frames()
    logger.info("[stream:%s] client connected", cam_id)

    try:
        while True:
            frame = await queue.get()
            await websocket.send_bytes(frame)
    except (WebSocketDisconnect, RuntimeError):
        logger.info("[stream:%s] client disconnected", cam_id)
    except Exception as e:
        logger.error("[stream:%s] lỗi: %s", cam_id, e)
    finally:
        session.frames_channel.close()
        session.stop_frames()
