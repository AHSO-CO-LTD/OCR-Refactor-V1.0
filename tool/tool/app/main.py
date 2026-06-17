import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from tool.app.core.config import get_config
from tool.app.routers import camera, health, legacy_ocr, ocr, plc

config = get_config()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(config.logs_dir / "device_tool.log"),
        logging.StreamHandler(),
    ],
)

app = FastAPI(
    title=config.app_name,
    description="Local FastAPI service for camera, PLC, and OCR runtime.",
    version=config.version,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.getLogger(__name__).error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error", "detail": str(exc)},
    )


@app.get("/")
def root():
    return {
        "service": config.app_name,
        "version": config.version,
        "status": "running",
    }


app.include_router(health.router, prefix="/api/v1")
app.include_router(camera.router, prefix="/api/v1")
app.include_router(plc.router, prefix="/api/v1")
app.include_router(ocr.router, prefix="/api/v1")
app.include_router(legacy_ocr.router, prefix="/api/v1")
