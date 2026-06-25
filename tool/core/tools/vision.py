"""
VisionTool — interface chung cho mọi tool xử lý ảnh / suy luận AI.

Hợp đồng:
  - load_model(path) : nạp model
  - configure(**kw)  : đặt ngưỡng/tham số suy luận
  - infer(frame)     : chạy suy luận trên 1 frame, trả dict JSON-serializable

Kết quả infer() PHẢI trung lập ngôn ngữ (chỉ kiểu cơ bản: dict/list/str/số/bool)
để mọi frontend (Python, web, C#...) đều dùng được.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import Any, Dict

import numpy as np

from core.tools.base import Tool


class VisionTool(Tool):
    kind = "vision"

    @abstractmethod
    def load_model(self, model_path: str) -> None:
        """Nạp model từ đường dẫn. Raise ToolError nếu thất bại."""

    @abstractmethod
    def infer(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Chạy suy luận trên 1 frame. Trả dict JSON-serializable, quy ước tối thiểu:
            {"success": bool, ... }  hoặc  {"success": False, "error": str}
        """

    def configure(self, **params: Any) -> None:
        """Đặt tham số suy luận (ngưỡng...). Mặc định no-op; driver override."""
        return None
