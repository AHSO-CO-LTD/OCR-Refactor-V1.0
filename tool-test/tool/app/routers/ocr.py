from typing import Optional

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)

from tool.app.schemas.common import SuccessResponse
from tool.app.schemas.ocr import (
    OCRConfigRequest,
    OCRLoadModelRequest,
    OCRPredictRequest,
    OCRROIsRequest,
    OCRROIsResponse,
)
from tool.app.services.runtime import ocr_service, roi_ocr_service

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.get("/status")
def status():
    return {"success": True, "data": ocr_service.status()}


@router.post("/load-model", response_model=SuccessResponse)
def load_model(payload: OCRLoadModelRequest):
    try:
        return SuccessResponse(data=ocr_service.load_model(payload.model_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/config", response_model=SuccessResponse)
def configure(payload: OCRConfigRequest):
    try:
        return SuccessResponse(data=ocr_service.configure(**payload.model_dump()))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predict")
def predict(payload: OCRPredictRequest):
    try:
        overrides = {
            "acceptance_threshold_ocr": payload.acceptance_threshold_ocr,
            "duplication_threshold_ocr": payload.duplication_threshold_ocr,
            "row_threshold": payload.row_threshold,
        }
        return ocr_service.predict_base64(payload.image_base64, overrides=overrides)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/rois", response_model=OCRROIsResponse)
def predict_rois(payload: OCRROIsRequest):
    try:
        return roi_ocr_service.read_rois(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predict-file")
async def predict_file(
    image: UploadFile = File(...),
    acceptance_threshold_ocr: Optional[float] = Form(default=None),
    duplication_threshold_ocr: Optional[float] = Form(default=None),
    row_threshold: Optional[int] = Form(default=None),
):
    try:
        import cv2
        import numpy as np

        content = await image.read()
        decoded = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
        if decoded is None or decoded.size == 0:
            raise ValueError("Uploaded file could not be decoded as an image")
        overrides = {
            "acceptance_threshold_ocr": acceptance_threshold_ocr,
            "duplication_threshold_ocr": duplication_threshold_ocr,
            "row_threshold": row_threshold,
        }
        return ocr_service.predict_image(decoded, overrides=overrides)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.websocket("/ws")
async def predict_ws(websocket: WebSocket):
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
