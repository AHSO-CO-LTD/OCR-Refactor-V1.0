from tool.app.services.camera_service import CameraService
from tool.app.services.ocr_service import OCRService
from tool.app.services.plc_service import PLCService
from tool.app.services.roi_ocr_service import ROIOCRService


camera_service = CameraService()
plc_service = PLCService()
ocr_service = OCRService()
roi_ocr_service = ROIOCRService(camera=camera_service, ocr=ocr_service)
