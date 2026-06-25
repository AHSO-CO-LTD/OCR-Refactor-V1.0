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
        self._stream_converter = None
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

    def frame_rate_status(self, requested_fps: Optional[float] = None) -> dict:
        if not self.connected:
            return self._default_frame_rate_status(requested_fps)

        try:
            with self._lock:
                node_map = self._camera.GetNodeMap()
                configured = self._read_first_float_node_with_limits(
                    node_map,
                    self._acquisition_frame_rate_node_names(),
                )
                resulting = self._read_first_float_node_with_limits(
                    node_map,
                    self._resulting_frame_rate_node_names(),
                )
                if resulting["value"] is None:
                    resulting = self._read_first_float_node_by_keywords_with_limits(
                        node_map,
                        ["resulting", "frame", "rate"],
                    )
                if resulting["value"] is None:
                    resulting = self._read_first_float_node_by_keywords_with_limits(
                        node_map,
                        ["frame", "rate"],
                    )
                frame_rate_node = self._find_first_node(
                    node_map,
                    self._acquisition_frame_rate_node_names(),
                )
                writable = self._is_node_writable(frame_rate_node)
                camera_max_fps = self._resolve_camera_max_fps(configured, resulting)
                camera_resulting_fps = resulting["value"] or camera_max_fps

                return {
                    "connected": True,
                    "requested_stream_fps": requested_fps,
                    "configured_fps": configured["value"],
                    "camera_resulting_fps": camera_resulting_fps,
                    "camera_max_fps": camera_max_fps,
                    "effective_stream_fps": camera_resulting_fps,
                    "writable": writable,
                    "error": None,
                    "source": {
                        "configured": configured["name"],
                        "resulting": resulting["name"],
                        "max": self._resolve_camera_max_source(configured, resulting),
                        "candidates": self._collect_frame_rate_candidates(node_map),
                    },
                }
        except Exception as exc:
            return self._default_frame_rate_status(requested_fps, str(exc))

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
            self._stream_converter = pylon.ImageFormatConverter()
            self._stream_converter.OutputPixelFormat = (
                pylon.PixelType_Mono8
                if self._is_monochrome_camera()
                else pylon.PixelType_RGB8packed
            )
            self._stream_converter.OutputBitAlignment = (
                pylon.OutputBitAlignment_MsbAligned
            )

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
            self._stream_converter = None
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

    def grab_stream_bytes(
        self,
        encode_format: str = ".jpg",
        jpeg_quality: int = 70,
        max_width: Optional[int] = None,
    ) -> tuple:
        total_started_at = time.time()
        frame = self.grab_stream_frame()
        resize_started_at = time.time()
        image = self._resize_for_stream(frame.image, max_width)
        resize_time_ms = (time.time() - resize_started_at) * 1000
        encode_started_at = time.time()
        content = encode_image_bytes(image, encode_format, jpeg_quality)
        encode_time_ms = (time.time() - encode_started_at) * 1000
        height, width = image.shape[:2]
        return (
            content,
            {
                "capture_time_ms": frame.capture_time_ms,
                "resize_time_ms": resize_time_ms,
                "encode_time_ms": encode_time_ms,
                "tool_total_time_ms": (time.time() - total_started_at) * 1000,
                "frame_width": width,
                "frame_height": height,
                "encoded_bytes": len(content),
            },
        )

    def grab_stream_frame(self) -> CameraFrame:
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
                image = self._stream_converter.Convert(grab_result).GetArray()
            finally:
                grab_result.Release()

            return CameraFrame(
                image=image,
                capture_time_ms=(time.time() - start) * 1000,
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

    def _resize_for_stream(self, image, max_width: Optional[int]):
        if max_width is None or max_width <= 0:
            return image

        height, width = image.shape[:2]
        if width <= max_width:
            return image

        import cv2

        next_height = max(1, round(height * (max_width / width)))
        return cv2.resize(image, (max_width, next_height), interpolation=cv2.INTER_AREA)

    def _ensure_connected(self):
        if not self.connected:
            raise RuntimeError("Camera is not connected")

    def _is_monochrome_camera(self) -> bool:
        model_name = str((self._device_info or {}).get("model_name") or "").lower()
        if model_name.endswith("m"):
            return True

        node_map = self._camera.GetNodeMap()
        return self._safe_get_node(node_map, "PixelColorFilter") is None

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

    def _default_frame_rate_status(
        self,
        requested_fps: Optional[float] = None,
        error: Optional[str] = None,
    ) -> dict:
        return {
            "connected": False,
            "requested_stream_fps": requested_fps,
            "configured_fps": None,
            "camera_resulting_fps": None,
            "camera_max_fps": None,
            "effective_stream_fps": None,
            "writable": False,
            "error": error,
            "source": None,
        }

    def _find_first_node(self, node_map, names: list):
        from pypylon import genicam

        for name in names:
            node = self._safe_get_node(node_map, name)
            try:
                if node is not None and genicam.IsReadable(node):
                    return node
            except Exception:
                continue
        return None

    def _safe_get_node(self, node_map, name: str):
        try:
            return node_map.GetNode(name)
        except Exception:
            return None

    def _read_first_float_node(self, node_map, names: list) -> dict:
        node = self._find_first_node(node_map, names)
        if node is None:
            return {"name": None, "value": None}

        return self._read_float_node(node)

    def _read_first_float_node_with_limits(self, node_map, names: list) -> dict:
        node = self._find_first_node(node_map, names)
        if node is None:
            return self._empty_float_node()

        return self._read_float_node_with_limits(node)

    def _read_first_float_node_by_keywords(self, node_map, keywords: list) -> dict:
        try:
            nodes = node_map.GetNodes()
        except Exception:
            return {"name": None, "value": None}

        normalized_keywords = [str(keyword).lower() for keyword in keywords]
        for node in nodes:
            try:
                name = node.GetName()
            except Exception:
                continue

            normalized_name = name.lower()
            if not all(keyword in normalized_name for keyword in normalized_keywords):
                continue

            value = self._read_float_node(node)
            if value["value"] is not None:
                return value

        return {"name": None, "value": None}

    def _read_first_float_node_by_keywords_with_limits(self, node_map, keywords: list) -> dict:
        try:
            nodes = node_map.GetNodes()
        except Exception:
            return self._empty_float_node()

        normalized_keywords = [str(keyword).lower() for keyword in keywords]
        for node in nodes:
            try:
                name = node.GetName()
            except Exception:
                continue

            normalized_name = name.lower()
            if not all(keyword in normalized_name for keyword in normalized_keywords):
                continue

            value = self._read_float_node_with_limits(node)
            if value["value"] is not None:
                return value

        return self._empty_float_node()

    def _read_float_node(self, node) -> dict:
        try:
            return {"name": node.GetName(), "value": float(node.GetValue())}
        except Exception:
            try:
                return {"name": node.GetName(), "value": float(node.ToString())}
            except Exception:
                return {"name": node.GetName(), "value": None}

    def _read_float_node_with_limits(self, node) -> dict:
        value = self._read_float_node(node)
        value.update(
            {
                "min": self._safe_node_min(node),
                "max": self._safe_node_max(node),
                "writable": self._is_node_writable(node),
            }
        )
        return value

    def _empty_float_node(self) -> dict:
        return {
            "name": None,
            "value": None,
            "min": None,
            "max": None,
            "writable": False,
        }

    def _safe_node_min(self, node) -> Optional[float]:
        if node is None:
            return None

        try:
            return float(node.GetMin())
        except Exception:
            return None

    def _safe_node_max(self, node) -> Optional[float]:
        if node is None:
            return None

        try:
            return float(node.GetMax())
        except Exception:
            return None

    def _is_node_writable(self, node) -> bool:
        if node is None:
            return False

        try:
            from pypylon import genicam

            return bool(genicam.IsWritable(node))
        except Exception:
            return False

    def _resolve_camera_max_fps(self, configured: dict, resulting: dict) -> Optional[float]:
        # Basler Resulting*FrameRate nodes represent the camera-calculated
        # achievable frame rate for the current ROI/exposure/transport settings.
        if resulting["value"] is not None:
            return resulting["value"]

        if configured.get("max") is not None:
            return configured["max"]

        return configured["value"]

    def _resolve_camera_max_source(self, configured: dict, resulting: dict):
        if resulting["value"] is not None:
            return resulting["name"]

        if configured.get("max") is not None:
            return configured["name"]

        return configured["name"]

    def _acquisition_frame_rate_node_names(self) -> list:
        return [
            "AcquisitionFrameRate",
            "AcquisitionFrameRateAbs",
            "AcquisitionFrameRateRaw",
            "BslAcquisitionFrameRate",
        ]

    def _resulting_frame_rate_node_names(self) -> list:
        return [
            "ResultingFrameRate",
            "ResultingFrameRateAbs",
            "ResultingAcquisitionFrameRate",
            "ResultingAcquisitionFrameRateAbs",
            "AcquisitionResultingFrameRate",
            "AcquisitionResultingFrameRateAbs",
            "BslResultingFrameRate",
            "BslResultingAcquisitionFrameRate",
            "BslResultingAcquisitionFrameRateAbs",
        ]

    def _collect_frame_rate_candidates(self, node_map) -> list:
        try:
            nodes = node_map.GetNodes()
        except Exception:
            return []

        candidates = []
        preferred_names = set(
            self._acquisition_frame_rate_node_names()
            + self._resulting_frame_rate_node_names()
        )

        for node in nodes:
            try:
                name = node.GetName()
            except Exception:
                continue

            normalized_name = name.lower()
            if name not in preferred_names and not (
                "frame" in normalized_name and "rate" in normalized_name
            ):
                continue

            value = self._read_float_node_with_limits(node)
            if (
                value["value"] is None
                and value["min"] is None
                and value["max"] is None
            ):
                continue

            candidates.append(value)

        return candidates[:30]

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
