"""
CameraTool — interface chung cho mọi camera.

Hai chế độ dùng:
  - grab()         : chụp đồng bộ 1 frame (cho trigger thủ công / tín hiệu PLC)
  - start_stream() : chụp liên tục, gọi callback on_frame(frame) cho mỗi frame mới

Quan trọng: on_frame phải NHẸ và KHÔNG block (chỉ đẩy frame vào slot/bus của
pipeline). Mọi xử lý nặng (inference, encode...) làm ở consumer, không làm trong
callback để không chặn vòng chụp của camera.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import Any, Callable, Optional

import numpy as np

from core.tools.base import Tool

#: callback nhận mỗi frame mới khi đang stream
FrameCallback = Callable[[np.ndarray], None]


class CameraTool(Tool):
    kind = "camera"

    @abstractmethod
    def grab(self) -> Optional[np.ndarray]:
        """
        Chụp đồng bộ 1 frame. Trả về ảnh BGR/RGB dạng np.ndarray, hoặc None nếu
        không lấy được frame. Raise ToolError nếu camera chưa mở.
        """

    @abstractmethod
    def start_stream(self, on_frame: FrameCallback) -> None:
        """
        Bắt đầu chụp liên tục. Với mỗi frame mới, gọi on_frame(frame).
        Nên dùng chiến lược "latest image only" ở tầng driver để giảm trễ.
        Phải đặt state=RUNNING.
        """

    @abstractmethod
    def stop_stream(self) -> None:
        """Dừng chụp liên tục. Phải đưa state về READY."""

    # Tham số tuỳ chọn — driver override nếu hỗ trợ.
    def set_param(self, **params: Any) -> None:
        """
        Cập nhật tham số camera lúc đang chạy (vd: exposure, roi=(x,y,w,h)).
        Mặc định no-op; driver nào hỗ trợ thì override.
        """
        return None

    def diagnostics(self) -> dict:
        """
        Thông tin chẩn đoán (debug) tuỳ driver (fps trần phần cứng, băng thông,
        packet size...). Dùng để tìm nút thắt khi fps thấp. Mặc định rỗng.
        """
        return {}

    def info(self) -> dict:
        """Thông tin nhận dạng camera (model, serial...). Mặc định rỗng."""
        return {}

    def get_max_value(self, feature: str) -> Optional[float]:
        """Giá trị Max cho phép của một tham số (vd Width, Height, ExposureTimeAbs)."""
        return None

    def get_ranges(self) -> dict:
        """Range {min, max, inc, value} của các tham số settable, để client validate."""
        return {}
