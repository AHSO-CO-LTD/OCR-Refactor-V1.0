from fastapi import APIRouter

from tool.app.core.config import get_config
from tool.app.schemas.common import RuntimeStatus
from tool.app.services.runtime import camera_service, ocr_service, plc_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=RuntimeStatus)
def health_check():
    config = get_config()
    return RuntimeStatus(
        service=config.app_name,
        version=config.version,
        camera_connected=camera_service.connected,
        plc_connected=plc_service.connected,
        ocr_model_loaded=ocr_service.model_loaded,
        details={
            "camera": camera_service.status(),
            "plc": plc_service.status(),
            "ocr": ocr_service.status(),
        },
    )
