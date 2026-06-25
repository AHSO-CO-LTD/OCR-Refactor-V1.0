from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from tool.app.services.runtime import ocr_service

router = APIRouter(prefix="/ai/ocr_ai", tags=["legacy-ocr"])


@router.post("/load_model")
def load_ocr_model(model_path: str):
    try:
        ocr_service.load_model(model_path)
        return {"success": True, "message": f"Model loaded from {model_path}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@router.post("/input_config")
def input_ocr_config(
    acceptance_threshold_ocr: float = 0.5,
    duplication_threshold_ocr: float = 0.5,
    row_threshold: int = 20,
):
    try:
        ocr_service.configure(
            acceptance_threshold_ocr=acceptance_threshold_ocr,
            duplication_threshold_ocr=duplication_threshold_ocr,
            row_threshold=row_threshold,
        )
        return {"success": True, "message": "OCR configuration updated"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@router.get("/ws")
def websocket_ocr_info():
    return {
        "success": True,
        "type": "websocket",
        "path": "/api/v1/ai/ocr_ai/ws",
        "url_example": "ws://localhost:8000/api/v1/ai/ocr_ai/ws",
        "input": "Send image bytes as a binary WebSocket message",
        "output": "OCR result JSON",
    }


@router.websocket("/ws")
async def websocket_ocr(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive()
            if "bytes" not in data:
                await websocket.send_json({"success": False, "error": "Send binary image bytes"})
                continue

            import cv2
            import numpy as np

            image = cv2.imdecode(np.frombuffer(data["bytes"], np.uint8), cv2.IMREAD_COLOR)
            if image is None or image.size == 0:
                await websocket.send_json({"success": False, "error": "Invalid image bytes"})
                continue

            await websocket.send_json(ocr_service.predict_image(image))
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await websocket.send_json({"success": False, "error": str(exc)})
