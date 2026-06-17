from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    success: bool = False
    error: str


class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "ok"
    data: Optional[Dict[str, Any]] = None


class RuntimeStatus(BaseModel):
    service: str
    version: str
    camera_connected: bool
    plc_connected: bool
    ocr_model_loaded: bool
    details: Dict[str, Any] = Field(default_factory=dict)
