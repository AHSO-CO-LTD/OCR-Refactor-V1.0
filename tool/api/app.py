"""
app — khởi tạo FastAPI cho API thiết bị (camera + vision).

Vòng đời:
  startup : gắn event loop, nạp driver (tự đăng ký registry), tạo CameraManager + VisionService
  shutdown: đóng camera + vision

App KHÔNG cần PyQt: pypylon (camera) và ultralytics.YOLO (vision) đều không yêu cầu
QApplication — đây là lợi ích của việc bỏ Deep_Learning_Tool.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

# Đảm bảo thư mục gốc project nằm trên sys.path để import core/ drivers/ api/.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import load_config
from core.logging_setup import setup_logging
from api.services.camera_service import CameraManager
from api.services.yolo_ocr_service import YoloOcrService

LOG_DIR = os.path.join(_PROJECT_ROOT, "logs")
setup_logging(LOG_DIR)
logger = logging.getLogger("api")

config = load_config(os.path.join(_PROJECT_ROOT, "config.json"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Khởi động Device API...")

    # Nạp driver để chúng tự đăng ký vào registry.
    import drivers.camera  # noqa: F401
    import drivers.AI  # noqa: F401

    manager = CameraManager()
    manager.set_loop(asyncio.get_running_loop())
    app.state.camera_manager = manager
    app.state.yolo_ocr_service = YoloOcrService()
    app.state.config = config

    from core.registry import cameras, ai
    logger.info("Sẵn sàng. camera=%s ai=%s", cameras.names(), ai.names())

    try:
        yield
    finally:
        logger.info("Tắt Device API, đóng tài nguyên...")
        manager.close_all()
        app.state.yolo_ocr_service.close()


app = FastAPI(
    title="Device API",
    description="API điều khiển camera / PLC / vision (frontend-agnostic)",
    version="0.1.0",
    docs_url="/tool/docs",
    redoc_url="/tool/redoc",
    openapi_url="/tool/openapi.json",
    lifespan=lifespan,
)

# CORS mở cho dev (cho phép mọi frontend gọi tới; siết lại khi lên production).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# UI test dùng chung: mỗi phần (camera/plc/vision/pipeline) là 1 file html trong
# thư mục static/. Thêm phần mới = thêm file, không sửa app.py. Mở /ui/.
_STATIC_DIR = os.path.join(_PROJECT_ROOT, "static")
os.makedirs(_STATIC_DIR, exist_ok=True)
app.mount("/ui", StaticFiles(directory=_STATIC_DIR, html=True), name="ui")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error", "detail": str(exc)},
    )


@app.get("/")
async def root():
    return {"service": "Device API", "version": "0.1.0", "status": "running"}


@app.get("/tool/v1/health")
async def tool_health(request: Request):
    cameras = request.app.state.camera_manager.list()
    yolo_status = request.app.state.yolo_ocr_service.status()
    camera_connected = len(cameras) > 0

    return {
        "service": "Device API",
        "version": "0.1.0",
        "status": "running",
        "camera_connected": camera_connected,
        "plc_connected": False,
        "ocr_model_loaded": bool(yolo_status.get("model_loaded")),
        "details": {
            "camera": {
                "connected": camera_connected,
                "active": cameras[0] if cameras else None,
                "count": len(cameras),
            },
            "ocr": yolo_status,
        },
    }


from api.routers import camera_router, yolo_ocr_router  # noqa: E402

app.include_router(camera_router.router, prefix="/tool/v1", tags=["camera"])
app.include_router(yolo_ocr_router.router, prefix="/tool/v1", tags=["AI:yolo_ocr"])
