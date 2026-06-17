import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect

from tool.app.schemas.camera import (
    CameraConnectRequest,
    CameraDevice,
    CameraSettingsRequest,
    GrabImageRequest,
    GrabImageResponse,
)
from tool.app.schemas.common import SuccessResponse
from tool.app.services.image_codec import media_type_for_format
from tool.app.services.runtime import camera_service

router = APIRouter(prefix="/camera", tags=["camera"])


@router.get("/status")
def status():
    return {"success": True, "data": camera_service.status()}


@router.get("/devices", response_model=List[CameraDevice])
def list_devices():
    try:
        return camera_service.list_devices()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/connect", response_model=SuccessResponse)
def connect_camera(payload: CameraConnectRequest):
    try:
        return SuccessResponse(data=camera_service.connect(**payload.model_dump()))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/disconnect", response_model=SuccessResponse)
def disconnect_camera():
    return SuccessResponse(data=camera_service.disconnect())


@router.post("/settings", response_model=SuccessResponse)
def update_settings(payload: CameraSettingsRequest):
    try:
        return SuccessResponse(data=camera_service.configure(**payload.model_dump()))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/grab", response_model=GrabImageResponse)
def grab_image(payload: GrabImageRequest):
    try:
        return camera_service.grab(**payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/grab/raw")
def grab_raw_image(payload: GrabImageRequest):
    try:
        content, capture_time_ms = camera_service.grab_bytes(**payload.model_dump())
        headers = {"X-Capture-Time-Ms": f"{capture_time_ms:.3f}"}
        return Response(
            content=content,
            media_type=media_type_for_format(payload.encode_format),
            headers=headers,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.websocket("/stream")
async def stream_camera(websocket: WebSocket):
    await websocket.accept()
    fps = _clamp_float(websocket.query_params.get("fps"), 1.0, 20.0, 8.0)
    jpeg_quality = int(
        _clamp_float(websocket.query_params.get("jpeg_quality"), 1.0, 100.0, 80.0)
    )
    frame_delay = 1.0 / fps

    try:
        while True:
            content, _capture_time_ms = await asyncio.to_thread(
                camera_service.grab_bytes,
                ".jpg",
                jpeg_quality,
            )
            await websocket.send_bytes(content)
            await asyncio.sleep(frame_delay)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"success": False, "error": str(exc)})
        await websocket.close(code=1011)


def _clamp_float(
    value: Optional[str],
    min_value: float,
    max_value: float,
    default: float,
):
    if value is None:
        return default

    try:
        parsed = float(value)
    except ValueError:
        return default

    return min(max(parsed, min_value), max_value)
