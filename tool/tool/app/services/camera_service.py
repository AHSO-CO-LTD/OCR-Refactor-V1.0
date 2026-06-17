import threading
import time
from dataclasses import dataclass
from typing import Optional

from tool.app.services.image_codec import encode_image_base64, encode_image_bytes


@dataclass
class CameraFrame:
    image: object
    capture_time_ms: float


class CameraService:
    def __init__(self):
        self._lock = threading.Lock()
        self._camera = None
        self._converter = None
        self._last_frame: Optional[CameraFrame] = None
        self._device_index: Optional[int] = None
        self._device_info: Optional[dict] = None

    @property
    def connected(self) -> bool:
        return bool(self._camera is not None and self._camera.IsOpen())

    def status(self) -> dict:
        data = {
            "connected": self.connected,
            "is_grabbing": bool(
                self._camera is not None
                and self._camera.IsOpen()
                and self._camera.IsGrabbing()
            ),
            "has_last_frame": self._last_frame is not None,
            "active_device_index": self._device_index,
            "active_device": self._device_info,
        }

        try:
            devices = self.list_devices()
            data.update(
                {
                    "available_device_count": len(devices),
                    "available_devices": devices,
                    "device_scan_error": None,
                }
            )
        except Exception as exc:
            data.update(
                {
                    "available_device_count": None,
                    "available_devices": [],
                    "device_scan_error": str(exc),
                }
            )
        return data

    def list_devices(self) -> list:
        from pypylon import pylon

        devices = pylon.TlFactory.GetInstance().EnumerateDevices()
        result = []
        for index, device in enumerate(devices):
            result.append(
                {
                    "index": index,
                    "friendly_name": self._safe_device_value(device, "GetFriendlyName"),
                    "model_name": self._safe_device_value(device, "GetModelName"),
                    "serial_number": self._safe_device_value(device, "GetSerialNumber"),
                    "device_class": self._safe_device_value(device, "GetDeviceClass"),
                }
            )
        return result

    def connect(
        self,
        device_index: int = 0,
        exposure: Optional[int] = None,
        offset_x: Optional[int] = None,
        offset_y: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> dict:
        from pypylon import pylon

        with self._lock:
            if self.connected:
                return self.status()

            factory = pylon.TlFactory.GetInstance()
            devices = factory.EnumerateDevices()
            if len(devices) == 0:
                raise RuntimeError("No camera found")
            if device_index >= len(devices):
                raise ValueError(f"Camera device_index {device_index} is out of range")

            self._device_index = device_index
            self._device_info = self._device_info_from_pylon_device(device_index, devices[device_index])
            self._camera = pylon.InstantCamera(factory.CreateDevice(devices[device_index]))
            self._camera.Open()

            self._converter = pylon.ImageFormatConverter()
            self._converter.OutputPixelFormat = pylon.PixelType_RGB8packed
            self._converter.OutputBitAlignment = pylon.OutputBitAlignment_MsbAligned

            if any(v is not None for v in [offset_x, offset_y, width, height]):
                self._set_image_size_unlocked(offset_x, offset_y, width, height)

            if exposure is not None:
                self._set_exposure_unlocked(exposure)

            self._camera.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)
            return self.status()

    def disconnect(self) -> dict:
        with self._lock:
            if self._camera is not None and self._camera.IsOpen():
                if self._camera.IsGrabbing():
                    self._camera.StopGrabbing()
                self._camera.Close()
            self._camera = None
            self._converter = None
            self._device_index = None
            self._device_info = None
            return self.status()

    def configure(
        self,
        exposure: Optional[int] = None,
        offset_x: Optional[int] = None,
        offset_y: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> dict:
        with self._lock:
            self._ensure_connected()
            was_grabbing = self._camera.IsGrabbing()
            if was_grabbing:
                self._camera.StopGrabbing()

            if any(v is not None for v in [offset_x, offset_y, width, height]):
                self._set_image_size_unlocked(offset_x, offset_y, width, height)
            if exposure is not None:
                self._set_exposure_unlocked(exposure)

            if was_grabbing:
                from pypylon import pylon

                self._camera.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)
            return self.status()

    def grab(self, encode_format: str = ".jpg", jpeg_quality: int = 95) -> dict:
        frame = self.grab_frame()
        h, w, c = frame.image.shape
        return {
            "success": True,
            "width": w,
            "height": h,
            "channels": c,
            "capture_time_ms": frame.capture_time_ms,
            "image_base64": encode_image_base64(frame.image, encode_format, jpeg_quality),
            "encode_format": encode_format,
        }

    def grab_bytes(self, encode_format: str = ".jpg", jpeg_quality: int = 95) -> tuple:
        frame = self.grab_frame()
        return (
            encode_image_bytes(frame.image, encode_format, jpeg_quality),
            frame.capture_time_ms,
        )

    def grab_frame(self) -> CameraFrame:
        import cv2
        from pypylon import pylon

        with self._lock:
            self._ensure_connected()
            if not self._camera.IsGrabbing():
                self._camera.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)

            start = time.time()
            grab_result = self._camera.RetrieveResult(
                5000, pylon.TimeoutHandling_ThrowException
            )
            try:
                if not grab_result.GrabSucceeded():
                    raise RuntimeError("Camera grab failed")
                image = self._converter.Convert(grab_result).GetArray()
                # Existing OCR/display pipeline expects OpenCV BGR images.
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            finally:
                grab_result.Release()

            frame = CameraFrame(image=image, capture_time_ms=(time.time() - start) * 1000)
            self._last_frame = frame
            return frame

    def _ensure_connected(self):
        if not self.connected:
            raise RuntimeError("Camera is not connected")

    def _set_exposure_unlocked(self, exposure: int):
        node_map = self._camera.GetNodeMap()
        if node_map.GetNode("ExposureTimeAbs") is not None:
            self._camera.ExposureTimeAbs.SetValue(exposure)
        else:
            self._camera.ExposureTime.SetValue(exposure)

    def _set_image_size_unlocked(
        self,
        offset_x: Optional[int],
        offset_y: Optional[int],
        width: Optional[int],
        height: Optional[int],
    ):
        if width is not None or height is not None:
            if hasattr(self._camera, "OffsetX"):
                self._camera.OffsetX.SetValue(0)
            if hasattr(self._camera, "OffsetY"):
                self._camera.OffsetY.SetValue(0)
        if width is not None:
            self._camera.Width.SetValue(width)
        if height is not None:
            self._camera.Height.SetValue(height)
        if offset_x is not None:
            self._camera.OffsetX.SetValue(offset_x)
        if offset_y is not None:
            self._camera.OffsetY.SetValue(offset_y)

    def _safe_device_value(self, device, method_name: str):
        try:
            method = getattr(device, method_name)
            return method()
        except Exception:
            return None

    def _device_info_from_pylon_device(self, index: int, device) -> dict:
        return {
            "index": index,
            "friendly_name": self._safe_device_value(device, "GetFriendlyName"),
            "model_name": self._safe_device_value(device, "GetModelName"),
            "serial_number": self._safe_device_value(device, "GetSerialNumber"),
            "device_class": self._safe_device_value(device, "GetDeviceClass"),
        }
