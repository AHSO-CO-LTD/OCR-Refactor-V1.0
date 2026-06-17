from typing import Optional

from pydantic import BaseModel, Field


class CameraConnectRequest(BaseModel):
    device_index: int = Field(default=0, ge=0)
    exposure: Optional[int] = Field(default=None, ge=1)
    offset_x: Optional[int] = Field(default=None, ge=0)
    offset_y: Optional[int] = Field(default=None, ge=0)
    width: Optional[int] = Field(default=None, ge=1)
    height: Optional[int] = Field(default=None, ge=1)


class CameraSettingsRequest(BaseModel):
    exposure: Optional[int] = Field(default=None, ge=1)
    offset_x: Optional[int] = Field(default=None, ge=0)
    offset_y: Optional[int] = Field(default=None, ge=0)
    width: Optional[int] = Field(default=None, ge=1)
    height: Optional[int] = Field(default=None, ge=1)


class GrabImageRequest(BaseModel):
    encode_format: str = Field(default=".jpg", pattern=r"^\.(jpg|jpeg|png|bmp)$")
    jpeg_quality: int = Field(default=95, ge=1, le=100)


class GrabImageResponse(BaseModel):
    success: bool
    width: int
    height: int
    channels: int
    capture_time_ms: float
    image_base64: str
    encode_format: str


class CameraDevice(BaseModel):
    index: int
    friendly_name: str
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    device_class: Optional[str] = None
