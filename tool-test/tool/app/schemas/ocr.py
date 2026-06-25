from typing import List, Optional

from pydantic import BaseModel, Field


class OCRLoadModelRequest(BaseModel):
    model_path: str = Field(min_length=1)


class OCRConfigRequest(BaseModel):
    acceptance_threshold_ocr: float = Field(default=0.5, ge=0, le=1)
    duplication_threshold_ocr: float = Field(default=0.5, ge=0, le=1)
    row_threshold: int = Field(default=20, ge=0)


class OCRPredictRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    acceptance_threshold_ocr: Optional[float] = Field(default=None, ge=0, le=1)
    duplication_threshold_ocr: Optional[float] = Field(default=None, ge=0, le=1)
    row_threshold: Optional[int] = Field(default=None, ge=0)


class OCRPredictResponse(BaseModel):
    success: bool
    text: Optional[str] = None
    error: Optional[str] = None


class OCRROI(BaseModel):
    label: Optional[str] = None
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    rotate_clockwise: bool = True


class OCRROIsRequest(BaseModel):
    model_path: Optional[str] = None
    roi_list: List[OCRROI] = Field(min_length=1)
    image_base64: Optional[str] = None
    grab_from_camera: bool = True
    encode_format: str = Field(default=".jpg", pattern=r"^\.(jpg|jpeg|png|bmp)$")
    jpeg_quality: int = Field(default=95, ge=1, le=100)
    acceptance_threshold_ocr: Optional[float] = Field(default=None, ge=0, le=1)
    duplication_threshold_ocr: Optional[float] = Field(default=None, ge=0, le=1)
    row_threshold: Optional[int] = Field(default=None, ge=0)


class OCRROIResult(BaseModel):
    index: int
    label: Optional[str] = None
    text: str
    x: int
    y: int
    width: int
    height: int
    error: Optional[str] = None


class OCRROIsResponse(BaseModel):
    success: bool
    image_width: int
    image_height: int
    cycle_time_ms: float
    results: List[OCRROIResult]
    error: Optional[str] = None
