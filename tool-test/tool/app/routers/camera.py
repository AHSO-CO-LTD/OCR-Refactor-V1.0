import asyncio
import time
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


@router.get("/frame-rate")
def frame_rate():
    try:
        return {"success": True, "data": camera_service.frame_rate_status()}
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
    jpeg_quality = int(
        _clamp_float(websocket.query_params.get("jpeg_quality"), 1.0, 100.0, 70.0)
    )
    max_width = int(
        _clamp_float(websocket.query_params.get("max_width"), 320.0, 4096.0, 1600.0)
    )
    debug_timing = websocket.query_params.get("debug_timing") == "1"

    try:
        frame_id = 0
        tool_frame_times = []
        frame_rate = camera_service.frame_rate_status()
        frame_rate_checked_at = time.monotonic()
        while True:
            frame_id += 1
            frame_started_at = time.monotonic()
            content, timing = await asyncio.to_thread(
                camera_service.grab_stream_bytes,
                ".jpg",
                jpeg_quality,
                max_width,
            )
            if time.monotonic() - frame_rate_checked_at >= 1:
                frame_rate = camera_service.frame_rate_status()
                frame_rate_checked_at = time.monotonic()
            before_send_at = time.time()
            await websocket.send_json(
                {
                    "type": "frame_meta",
                    "frame_id": frame_id,
                    **timing,
                    "sent_at_ms": time.time() * 1000,
                    "stream_fps": frame_rate.get("camera_resulting_fps"),
                    "requested_fps": None,
                    "camera_resulting_fps": frame_rate.get("camera_resulting_fps"),
                    "camera_max_fps": frame_rate.get("camera_max_fps"),
                    "camera_configured_fps": frame_rate.get("configured_fps"),
                    "jpeg_quality": jpeg_quality,
                    "max_width": max_width,
                }
            )
            await websocket.send_bytes(content)
            if debug_timing:
                send_time_ms = (time.time() - before_send_at) * 1000
                frame_loop_ms = (time.monotonic() - frame_started_at) * 1000
                frame_completed_at = time.monotonic()
                tool_frame_times = [
                    timestamp
                    for timestamp in tool_frame_times
                    if frame_completed_at - timestamp <= 1
                ]
                tool_frame_times.append(frame_completed_at)
                await websocket.send_json(
                    {
                        "type": "frame_done",
                        "frame_id": frame_id,
                        "send_time_ms": send_time_ms,
                        "frame_loop_time_ms": frame_loop_ms,
                        "tool_fps": len(tool_frame_times),
                    }
                )
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"success": False, "error": str(exc)})
        await websocket.close(code=1011)


def _clamp_float(
    value: Optional[str],
    min_value: float,
    max_value: Optional[float],
    default: float,
):
    if value is None:
        return default

    try:
        parsed = float(value)
    except ValueError:
        return default

    parsed = max(parsed, min_value)

    if max_value is not None:
        parsed = min(parsed, max_value)

    return parsed
