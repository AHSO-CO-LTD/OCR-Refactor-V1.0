import time
from typing import Any, Dict, List, Optional

from tool.app.schemas.ocr import OCRROIResult, OCRROIsRequest
from tool.app.services.camera_service import CameraService
from tool.app.services.image_codec import decode_base64_image
from tool.app.services.ocr_service import OCRService


class ROIOCRService:
    def __init__(self, camera: CameraService, ocr: OCRService):
        self.camera = camera
        self.ocr = ocr

    def read_rois(self, request: OCRROIsRequest) -> Dict[str, Any]:
        started = time.time()
        if request.model_path:
            self.ocr.load_model(request.model_path)

        image = self._get_source_image(request)
        image_height, image_width = image.shape[:2]
        overrides = {
            "acceptance_threshold_ocr": request.acceptance_threshold_ocr,
            "duplication_threshold_ocr": request.duplication_threshold_ocr,
            "row_threshold": request.row_threshold,
        }

        results: List[OCRROIResult] = []
        for index, roi in enumerate(request.roi_list):
            error = self._validate_roi_bounds(
                x=roi.x,
                y=roi.y,
                width=roi.width,
                height=roi.height,
                image_width=image_width,
                image_height=image_height,
            )
            text = ""

            if error is None:
                crop = image[roi.y : roi.y + roi.height, roi.x : roi.x + roi.width]
                if crop is None or crop.size == 0:
                    error = "ROI crop is empty"
                else:
                    if roi.rotate_clockwise:
                        import cv2

                        crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
                    ocr_result = self.ocr.predict_encoded_bytes(
                        crop,
                        overrides=overrides,
                        encode_format=request.encode_format,
                        jpeg_quality=request.jpeg_quality,
                    )
                    text = ocr_result.get("text") or ""
                    error = ocr_result.get("error")

            results.append(
                OCRROIResult(
                    index=index,
                    label=roi.label,
                    text=text,
                    x=roi.x,
                    y=roi.y,
                    width=roi.width,
                    height=roi.height,
                    error=error,
                )
            )

        return {
            "success": True,
            "image_width": image_width,
            "image_height": image_height,
            "cycle_time_ms": (time.time() - started) * 1000,
            "results": results,
        }

    def _get_source_image(self, request: OCRROIsRequest):
        if request.image_base64:
            return decode_base64_image(request.image_base64)
        if request.grab_from_camera:
            return self.camera.grab_frame().image
        raise ValueError("Either image_base64 or grab_from_camera=true is required")

    def _validate_roi_bounds(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        image_width: int,
        image_height: int,
    ) -> Optional[str]:
        if x + width > image_width:
            return f"ROI exceeds image width: x={x}, width={width}, image_width={image_width}"
        if y + height > image_height:
            return f"ROI exceeds image height: y={y}, height={height}, image_height={image_height}"
        return None
