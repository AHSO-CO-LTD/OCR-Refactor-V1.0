"""
camera_service — quản lý vòng đời camera + 2 nhánh tiêu thụ frame độc lập.

Một CameraSession có 2 nhánh chạy trên cùng nguồn frame thô, hoàn toàn độc lập:
  - nhánh FRAME    : encode JPEG → WS /stream (cho client xem live)
  - nhánh DETECTOR (B): feed frame mới nhất cho 1 detector (vd yolo_ocr) → kết quả
    qua results_channel. KÝ SINH vào luồng camera, KHÔNG ảnh hưởng nhánh frame.

Detector là instance dùng CHUNG (do service thuật toán sở hữu) — CameraSession chỉ
"mượn" để feed frame, KHÔNG nạp model và KHÔNG đóng nó. Hiện hỗ trợ 1 detector/camera
(đa detector để phát triển sau).

Acquisition (camera.start_stream) chạy khi có ÍT NHẤT 1 nhánh bật. `_on_frame`
chỉ đẩy frame vào slot của nhánh đang bật. Cả hai nhánh dùng LatestFrame (drop-old)
nên việc chụp không bị encode/detector kéo chậm.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from core.registry import cameras
from core.streaming import FrameChannel, LatestFrame
from core.tools.base import ToolError, ToolState
from core.tools.camera import CameraTool
from core.tools.vision import VisionTool

logger = logging.getLogger(__name__)


class CameraSession:
    """Một camera + nhánh frame (encode) + nhánh vision (B)."""

    def __init__(self, tool: CameraTool, jpeg_quality: int = 80):
        self.tool = tool
        self.jpeg_quality = int(jpeg_quality)
        self._lock = threading.Lock()

        # Nhánh FRAME (encode JPEG → WS /stream)
        self.frames_channel = FrameChannel()
        self._encode_slot: Optional[LatestFrame] = None
        self._encode_active = False
        self._encode_thread: Optional[threading.Thread] = None

        # Nhánh DETECTOR (B) — detector dùng CHUNG, không sở hữu ở đây
        self.results_channel = FrameChannel()
        self._det_slot: Optional[LatestFrame] = None
        self._det_active = False
        self._det_thread: Optional[threading.Thread] = None
        self._detector: Optional[VisionTool] = None
        self._det_name: Optional[str] = None
        self._det_rois: Optional[list] = None  # list (x,y,w,h); None = toàn frame

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.frames_channel.attach_loop(loop)
        self.results_channel.attach_loop(loop)

    @property
    def detector_active(self) -> bool:
        return self._det_active

    @property
    def detector_name(self) -> Optional[str]:
        return self._det_name

    # -- nguồn frame -----------------------------------------------------
    def _on_frame(self, frame: np.ndarray) -> None:
        """Callback từ thread chụp — phải NHẸ: chỉ đẩy vào slot của nhánh đang bật."""
        if self._encode_active and self._encode_slot is not None:
            self._encode_slot.publish(frame)
        if self._det_active and self._det_slot is not None:
            self._det_slot.publish(frame)

    def _ensure_acquisition(self) -> None:
        """Bật camera grab nếu chưa chạy (gọi khi giữ _lock)."""
        if self.tool.state != ToolState.RUNNING:
            self.tool.start_stream(self._on_frame)

    def _maybe_stop_acquisition(self) -> None:
        """Tắt camera grab nếu không còn nhánh nào dùng (gọi khi giữ _lock)."""
        if (
            not self._encode_active
            and not self._det_active
            and self.tool.state == ToolState.RUNNING
        ):
            self.tool.stop_stream()

    # -- nhánh FRAME -----------------------------------------------------
    def start_frames(self) -> None:
        with self._lock:
            if self._encode_active:
                return
            self._encode_slot = LatestFrame()
            self._encode_active = True
            self._encode_thread = threading.Thread(
                target=self._encode_loop, name=f"encode-{self.tool.tool_id}", daemon=True
            )
            self._encode_thread.start()
            self._ensure_acquisition()

    def stop_frames(self) -> None:
        with self._lock:
            if not self._encode_active:
                return
            self._encode_active = False
            if self._encode_slot is not None:
                self._encode_slot.close()
            t = self._encode_thread
            self._encode_thread = None
            self._maybe_stop_acquisition()
        if t is not None and t.is_alive():
            t.join(timeout=2)

    def _encode_loop(self) -> None:
        last = 0
        quality = [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality]
        slot = self._encode_slot
        while self._encode_active and slot is not None:
            frame, seq = slot.wait_newer(last, timeout=1.0)
            if frame is None:
                continue
            ok, buf = cv2.imencode(".jpg", frame, quality)
            if ok:
                self.frames_channel.publish(buf.tobytes())
            last = seq

    # -- nhánh DETECTOR (B) ----------------------------------------------
    def start_detector(
        self, detector: VisionTool, name: str, rois: Optional[list] = None
    ) -> None:
        """
        Gắn 1 detector ĐÃ NẠP (dùng chung) để feed frame camera. Không nạp/đóng nó.
        rois: list (x,y,w,h) — nếu có, infer LẦN LƯỢT từng vùng crop, trả kết quả
        theo từng ROI; nếu None → infer toàn frame.
        """
        with self._lock:
            if self._det_active:
                raise ToolError(f"Detect (B) đang chạy ({self._det_name}) trên camera này")
            self._detector = detector
            self._det_name = name
            self._det_rois = list(rois) if rois else None
            self._det_slot = LatestFrame()
            self._det_active = True
            self._det_thread = threading.Thread(
                target=self._detector_loop, name=f"detect-{self.tool.tool_id}", daemon=True
            )
            self._det_thread.start()
            self._ensure_acquisition()

    def stop_detector(self) -> None:
        with self._lock:
            if not self._det_active:
                return
            self._det_active = False
            if self._det_slot is not None:
                self._det_slot.close()
            t = self._det_thread
            self._det_thread = None
            self._detector = None  # chỉ buông tham chiếu — KHÔNG close (instance dùng chung)
            self._det_name = None
            self._det_rois = None
            self._maybe_stop_acquisition()
        if t is not None and t.is_alive():
            t.join(timeout=2)

    def _detector_loop(self) -> None:
        last = 0
        slot = self._det_slot
        while self._det_active and slot is not None:
            detector = self._detector
            if detector is None:
                break
            frame, seq = slot.wait_newer(last, timeout=1.0)
            if frame is None:
                continue
            result = self._infer(detector, frame)
            self.results_channel.publish({"seq": seq, **result})
            last = seq

    def _infer(self, detector: VisionTool, frame: np.ndarray) -> Dict[str, Any]:
        """Infer toàn frame, hoặc lần lượt từng ROI nếu có (crop trước khi infer)."""
        rois = self._det_rois
        if not rois:
            return detector.infer(frame)

        h_img, w_img = frame.shape[:2]
        out = []
        for (x, y, w, h) in rois:
            box = {"x": x, "y": y, "w": w, "h": h}
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(w_img, x + w), min(h_img, y + h)
            if x1 <= x0 or y1 <= y0:
                out.append({"roi": box, "success": False, "error": "ROI ngoài khung"})
                continue
            crop = frame[y0:y1, x0:x1]
            out.append({"roi": box, **detector.infer(crop)})
        return {"rois": out}

    # -- chụp đơn --------------------------------------------------------
    def grab_jpeg(self) -> Optional[bytes]:
        """Chụp 1 frame, trả JPEG bytes (cho REST grab — encode đồng bộ)."""
        frame = self.tool.grab()
        if frame is None:
            return None
        ok, buf = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality]
        )
        return buf.tobytes() if ok else None

    def status(self) -> Dict[str, Any]:
        s = self.tool.status()
        s["detector_active"] = self._det_active
        s["detector_name"] = self._det_name
        return s

    def close(self) -> None:
        self.stop_detector()
        self.stop_frames()
        self.tool.close()


class CameraManager:
    """Quản lý nhiều camera instance theo tool_id."""

    def __init__(self) -> None:
        self._sessions: Dict[str, CameraSession] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._lock = threading.Lock()
        self._counter = 0

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        for s in self._sessions.values():
            s.attach_loop(loop)

    def connect(
        self,
        driver: str,
        params: Optional[Dict[str, Any]] = None,
        tool_id: Optional[str] = None,
    ) -> CameraSession:
        params = dict(params or {})
        with self._lock:
            if tool_id is None:
                self._counter += 1
                tool_id = f"cam{self._counter}"
            if tool_id in self._sessions:
                raise ToolError(f"Camera id '{tool_id}' đã tồn tại")
            try:
                cls = cameras.get(driver)
            except KeyError as e:
                raise ToolError(str(e.args[0])) from e
            tool: CameraTool = cls(tool_id, params)

        tool.open()  # mở ngoài lock (có thể chậm)

        session = CameraSession(tool, jpeg_quality=int(params.get("jpeg_quality", 80)))
        if self._loop is not None:
            session.attach_loop(self._loop)
        with self._lock:
            self._sessions[tool_id] = session
        return session

    def get(self, tool_id: str) -> CameraSession:
        session = self._sessions.get(tool_id)
        if session is None:
            raise ToolError(f"Không có camera id '{tool_id}'")
        return session

    def disconnect(self, tool_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(tool_id, None)
        if session is not None:
            session.close()

    def list(self) -> List[Dict[str, Any]]:
        return [s.status() for s in self._sessions.values()]

    def close_all(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for s in sessions:
            try:
                s.close()
            except Exception as e:
                logger.error("Lỗi đóng camera %s: %s", s.tool.tool_id, e)
