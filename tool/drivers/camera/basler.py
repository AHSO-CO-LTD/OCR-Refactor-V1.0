"""
BaslerCamera — driver camera Basler (pypylon), hiện thực CameraTool.

Port từ logic Camera_Program.py của project tham chiếu nhưng BỎ HẾT PyQt:
không signal, không Global; thay bằng callback on_frame() và return thuần.
Đầu ra frame là ảnh BGR (np.ndarray) để tương thích trực tiếp cv2.imencode/imdecode.

Tham số config (params từ client):
    interface : loại transport — "GigE"/"GEV", "USB"/"U3V", "CXP"/"CoaXPress"
                (mặc định "GigE"); dùng để lọc khi liệt kê thiết bị
    serial    : (tuỳ chọn) chọn camera theo serial; mặc định lấy camera đầu tiên
    exposure  : thời gian phơi sáng (mặc định 3000)
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Optional

import numpy as np
from pypylon import pylon

from core.registry import cameras
from core.tools.base import ToolError, ToolState
from core.tools.camera import CameraTool, FrameCallback

logger = logging.getLogger(__name__)

# Ánh xạ tên interface (client gửi) -> transport layer type của pylon.
_TL_TYPE_MAP = {
    "GIGE": pylon.TLTypeGigE,
    "GEV": pylon.TLTypeGigE,
    "USB": pylon.TLTypeUSB,
    "U3V": pylon.TLTypeUSB,
    "CXP": pylon.TLTypeCXP,
    "COAXPRESS": pylon.TLTypeCXP,
}


@cameras.register("basler")
class BaslerCamera(CameraTool):
    driver = "basler"

    #: Tên param (khớp set_param) -> node GenICam. Tuple = thử lần lượt theo đời máy.
    #: Thêm tham số settable mới = thêm 1 dòng ở đây; /ranges tự cập nhật.
    RANGE_FEATURES = {
        "width": "Width",
        "height": "Height",
        "offset_x": "OffsetX",
        "offset_y": "OffsetY",
        "exposure": ("ExposureTimeAbs", "ExposureTime"),
    }

    def __init__(self, tool_id: str, config: Optional[dict] = None):
        super().__init__(tool_id, config)
        self._cam: Optional[pylon.InstantCamera] = None

        # Chuyển ảnh sang BGR8 để dùng trực tiếp với OpenCV.
        self._converter = pylon.ImageFormatConverter()
        self._converter.OutputPixelFormat = pylon.PixelType_BGR8packed
        self._converter.OutputBitAlignment = pylon.OutputBitAlignment_MsbAligned

        self._grab_lock = threading.Lock()  # đồng bộ grab() và stream loop
        self._streaming = False
        self._stream_thread: Optional[threading.Thread] = None
        self._on_frame: Optional[FrameCallback] = None
        self._exposure = int(self.config.get("exposure", 3000))

        # FPS phần cứng camera chụp thực tế — đo phía server trong stream loop.
        self._fps = 0.0
        self._fps_count = 0
        self._fps_t0 = 0.0

        # Camera mono: dùng thẳng Mono8 (bỏ debayer/convert) cho rẻ. Camera màu
        # mới convert sang BGR. Quyết định dựa vào PixelFormat đọc lúc mở.
        self._is_mono = False

        # Cache hình học (đọc 1 lần lúc mở + cập nhật khi set_param) để status()
        # không phải đọc node camera đồng thời với thread stream.
        self._geom = {"width": 0, "height": 0, "offset_x": 0, "offset_y": 0}

    # -- vòng đời --------------------------------------------------------
    def open(self) -> None:
        tl = pylon.TlFactory.GetInstance()

        # Lọc thiết bị theo loại interface mà client chỉ định.
        interface = str(self.config.get("interface", "GigE")).strip().upper()
        device_info = pylon.DeviceInfo()
        device_info.SetTLType(_TL_TYPE_MAP.get(interface, pylon.TLTypeGigE))
        devices = tl.EnumerateDevices([device_info])
        if not devices:
            raise ToolError(f"Không tìm thấy camera Basler ({interface})")

        device = devices[0]
        serial = self.config.get("serial")
        if serial is not None:
            match = [d for d in devices if d.GetSerialNumber() == str(serial)]
            if not match:
                raise ToolError(f"Không tìm thấy camera serial '{serial}' ({interface})")
            device = match[0]

        try:
            self._cam = pylon.InstantCamera(tl.CreateDevice(device))
            self._cam.Open()
            self._apply_exposure(self._exposure)
            self._cam.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)
            if any(
                self.config.get(key) is not None
                for key in ("roi", "width", "height", "offset_x", "offset_y")
            ):
                self._read_geom_locked()
                self._apply_geometry(self.config)
        except Exception as e:
            raise ToolError(f"Mở camera Basler thất bại: {e}")

        with self._grab_lock:
            self._read_geom_locked()
        self._set_state(ToolState.READY)
        logger.info(
            "[basler:%s] đã mở (interface=%s, serial=%s, %sx%s)",
            self.tool_id,
            interface,
            device.GetSerialNumber(),
            self._geom["width"],
            self._geom["height"],
        )
        # Log trần fps phần cứng + băng thông để chẩn đoán fps thấp.
        diag = self._read_diag()
        self._is_mono = str(diag.get("pixel_format", "")).lower().startswith("mono")
        logger.info(
            "[basler:%s] CHẨN ĐOÁN: resulting_fps=%s exposure_us=%s packet_size=%s "
            "throughput_limit=%s pixel=%s payload=%s",
            self.tool_id,
            diag.get("resulting_fps"),
            diag.get("exposure_us"),
            diag.get("packet_size"),
            diag.get("throughput_limit"),
            diag.get("pixel_format"),
            diag.get("payload_size"),
        )

    def close(self) -> None:
        self.stop_stream()
        with self._grab_lock:
            if self._cam is not None:
                try:
                    if self._cam.IsGrabbing():
                        self._cam.StopGrabbing()
                    if self._cam.IsOpen():
                        self._cam.Close()
                except Exception as e:
                    logger.error("[basler:%s] lỗi khi đóng: %s", self.tool_id, e)
                finally:
                    self._cam = None
        self._set_state(ToolState.CLOSED)

    # -- chụp ------------------------------------------------------------
    def grab(self) -> Optional[np.ndarray]:
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        with self._grab_lock:
            return self._retrieve()

    def _retrieve(self) -> Optional[np.ndarray]:
        """Lấy 1 frame. PHẢI gọi khi đang giữ _grab_lock."""
        grab = self._cam.RetrieveResult(5000, pylon.TimeoutHandling_ThrowException)
        try:
            if grab.GrabSucceeded():
                return self._to_frame(grab)
            return None
        finally:
            grab.Release()

    def _to_frame(self, grab) -> np.ndarray:
        """
        Chuyển grab result thành ndarray dùng được ngay:
          - mono: trả thẳng ảnh xám (H,W) — copy vì buffer bị giải phóng sau Release
          - màu : debayer sang BGR (H,W,3) bằng pylon converter
        """
        if self._is_mono:
            return grab.GetArray().copy()
        return self._converter.Convert(grab).GetArray()

    def _read_geom_locked(self) -> None:
        """Đọc lại width/height/offset từ camera vào cache. PHẢI giữ _grab_lock."""
        try:
            self._geom = {
                "width": int(self._cam.Width.GetValue()),
                "height": int(self._cam.Height.GetValue()),
                "offset_x": int(self._cam.OffsetX.GetValue()),
                "offset_y": int(self._cam.OffsetY.GetValue()),
            }
        except Exception as e:
            logger.error("[basler:%s] đọc hình học lỗi: %s", self.tool_id, e)

    # -- stream liên tục -------------------------------------------------
    def start_stream(self, on_frame: FrameCallback) -> None:
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        self._on_frame = on_frame
        if self._streaming:
            return
        self._streaming = True
        self._stream_thread = threading.Thread(
            target=self._stream_loop, name=f"basler-{self.tool_id}", daemon=True
        )
        self._stream_thread.start()
        self._set_state(ToolState.RUNNING)

    def stop_stream(self) -> None:
        if not self._streaming:
            return
        self._streaming = False
        t = self._stream_thread
        if t is not None and t.is_alive() and t is not threading.current_thread():
            t.join(timeout=2)
        self._stream_thread = None
        self._on_frame = None
        if self._cam is not None and self._cam.IsOpen():
            self._set_state(ToolState.READY)

    def _stream_loop(self) -> None:
        self._fps_count = 0
        self._fps_t0 = time.time()
        while self._streaming:
            img = None
            try:
                with self._grab_lock:
                    if (
                        not self._streaming
                        or self._cam is None
                        or not self._cam.IsGrabbing()
                    ):
                        break
                    img = self._retrieve()
            except Exception as e:
                logger.error("[basler:%s] lỗi stream: %s", self.tool_id, e)
                time.sleep(0.05)
                continue

            if img is not None:
                self._fps_count += 1
                cb = self._on_frame
                if cb is not None:
                    try:
                        cb(img)  # callback phải nhẹ, không block
                    except Exception as e:
                        logger.error("[basler:%s] lỗi on_frame: %s", self.tool_id, e)

            # Cập nhật FPS thực tế mỗi giây.
            now = time.time()
            dt = now - self._fps_t0
            if dt >= 1.0:
                self._fps = self._fps_count / dt
                self._fps_count = 0
                self._fps_t0 = now
            time.sleep(0.001)

        self._fps = 0.0

    # -- tham số ---------------------------------------------------------
    def set_param(self, **params: Any) -> None:
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")

        if "exposure" in params and params["exposure"] is not None:
            with self._grab_lock:
                self._apply_exposure(int(params["exposure"]))
            self._exposure = int(params["exposure"])

        geom_keys = ("roi", "width", "height", "offset_x", "offset_y")
        if any(params.get(k) is not None for k in geom_keys):
            self._apply_geometry(params)

    def _apply_geometry(self, params: dict) -> None:
        """Đặt width/height/offset. Nhận 'roi'=(x,y,w,h) hoặc từng khóa riêng lẻ."""
        if params.get("roi") is not None:
            x, y, w, h = params["roi"]
            target = {"offset_x": int(x), "offset_y": int(y), "width": int(w), "height": int(h)}
        else:
            target = dict(self._geom)
            for k in ("width", "height", "offset_x", "offset_y"):
                if params.get(k) is not None:
                    target[k] = int(params[k])

        with self._grab_lock:
            was_grabbing = self._cam.IsGrabbing()
            if was_grabbing:
                self._cam.StopGrabbing()
            try:
                # Đưa offset về 0 trước để tránh vượt biên khi đổi kích thước.
                self._cam.OffsetX.SetValue(0)
                self._cam.OffsetY.SetValue(0)
                self._cam.Width.SetValue(target["width"])
                self._cam.Height.SetValue(target["height"])
                self._cam.OffsetX.SetValue(target["offset_x"])
                self._cam.OffsetY.SetValue(target["offset_y"])
            except Exception as e:
                self._read_geom_locked()
                if was_grabbing:
                    self._cam.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)
                raise ToolError(f"Đặt hình học thất bại: {e}")
            self._read_geom_locked()
            if was_grabbing:
                self._cam.StartGrabbing(pylon.GrabStrategy_LatestImageOnly)

    def status(self) -> dict:
        s = super().status()
        s["fps"] = round(self._fps, 1)  # fps phần cứng camera chụp thực tế
        s["exposure"] = self._exposure
        s["geometry"] = dict(self._geom)
        return s

    def diagnostics(self) -> dict:
        """Đọc các thông số quyết định trần fps (debug). An toàn gọi khi đang stream."""
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        with self._grab_lock:
            return self._read_diag()

    def info(self) -> dict:
        """Thông tin nhận dạng camera."""
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        di = self._cam.GetDeviceInfo()
        return {
            "model": di.GetModelName(),
            "serial": di.GetSerialNumber(),
            "vendor": di.GetVendorName(),
        }

    def get_max_value(self, feature: str) -> Optional[float]:
        """Giá trị Max của một node (vd Width, Height, ExposureTimeAbs)."""
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        try:
            return getattr(self._cam, feature).Max
        except Exception as e:
            raise ToolError(f"Không đọc được Max của '{feature}': {e}")

    def get_ranges(self) -> dict:
        """
        Range {min, max, inc, value} của các tham số settable, để client validate.
        Lặp theo RANGE_FEATURES → thêm param mới chỉ cần thêm 1 dòng vào bảng đó,
        /ranges tự cập nhật (không sửa hàm này).
        """
        if self._cam is None or not self._cam.IsOpen():
            raise ToolError("Camera chưa mở")
        with self._grab_lock:
            out = {}
            for name, node_names in self.RANGE_FEATURES.items():
                if isinstance(node_names, str):
                    node_names = (node_names,)
                rng = None
                for nn in node_names:  # thử lần lượt (vd ExposureTimeAbs → ExposureTime)
                    rng = self._node_range(nn)
                    if rng:
                        break
                out[name] = rng
            return out

    def _node_range(self, name: str) -> Optional[dict]:
        """Đọc {min,max,inc,value} của 1 node; bỏ qua thuộc tính không có (vd Inc của float)."""
        try:
            node = getattr(self._cam, name)
        except Exception:
            return None
        out = {}
        for key, attr in (("min", "Min"), ("max", "Max"), ("inc", "Inc"), ("value", "Value")):
            try:
                out[key] = getattr(node, attr)
            except Exception:
                pass
        return out or None

    def _try_get(self, names):
        """Đọc node đầu tiên tồn tại trong `names`; trả None nếu không có/không đọc được."""
        for name in names:
            try:
                node = getattr(self._cam, name)
            except Exception:
                continue
            try:
                return node.GetValue()
            except Exception:
                try:
                    return node.ToString()
                except Exception:
                    continue
        return None

    def _read_diag(self) -> dict:
        """Tập hợp thông số chẩn đoán (tên node khác nhau giữa GigE/USB/đời camera)."""
        raw = {
            "resulting_fps": self._try_get(["ResultingFrameRateAbs", "ResultingFrameRate"]),
            "acquisition_fps_enable": self._try_get(["AcquisitionFrameRateEnable"]),
            "acquisition_fps": self._try_get(["AcquisitionFrameRateAbs", "AcquisitionFrameRate"]),
            "exposure_us": self._try_get(["ExposureTimeAbs", "ExposureTime"]),
            "pixel_format": self._try_get(["PixelFormat"]),
            "payload_size": self._try_get(["PayloadSize"]),
            # GigE: băng thông & gói tin
            "packet_size": self._try_get(["GevSCPSPacketSize"]),
            "inter_packet_delay": self._try_get(["GevSCPD"]),
            "throughput_limit_mode": self._try_get(["DeviceLinkThroughputLimitMode"]),
            "throughput_limit": self._try_get(["DeviceLinkThroughputLimit"]),
            "current_throughput": self._try_get(["DeviceLinkCurrentThroughput"]),
        }
        return {k: v for k, v in raw.items() if v is not None}

    def _apply_exposure(self, value: int) -> None:
        """Hỗ trợ cả node cũ (ExposureTimeAbs) lẫn mới (ExposureTime)."""
        node_map = self._cam.GetNodeMap()
        if node_map.GetNode("ExposureTimeAbs") is not None:
            self._cam.ExposureTimeAbs.SetValue(float(value))
        else:
            self._cam.ExposureTime.SetValue(float(value))
