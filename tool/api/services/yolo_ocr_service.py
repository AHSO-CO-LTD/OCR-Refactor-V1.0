"""
yolo_ocr_service — giữ MỘT instance yolo_ocr active (dùng chung cho A và B).

- A (predict độc lập) và B (ký sinh camera) đều dùng CHUNG instance này: nạp model
  1 lần, config 1 nơi, ảnh hưởng cả hai.
- B lấy instance qua detector() để feed frame; B KHÔNG tự nạp/đóng model.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional

import numpy as np

from core.registry import ai
from core.tools.base import ToolError
from core.tools.vision import VisionTool

logger = logging.getLogger(__name__)

_DRIVER = "yolo_ocr"


class YoloOcrService:
    def __init__(self) -> None:
        self._tool: Optional[VisionTool] = None
        self._lock = threading.Lock()

    def load_model(
        self,
        model_path: str,
        conf: Optional[float] = None,
        iou: Optional[float] = None,
        row_threshold: Optional[int] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"model_path": model_path}
        for k, v in (("conf", conf), ("iou", iou), ("row_threshold", row_threshold)):
            if v is not None:
                params[k] = v

        cls = ai.get(_DRIVER)
        new_tool: VisionTool = cls(_DRIVER, params)
        new_tool.open()  # nạp model (ngoài lock)

        with self._lock:
            old = self._tool
            self._tool = new_tool
        if old is not None:
            try:
                old.close()
            except Exception as e:
                logger.error("Lỗi đóng yolo_ocr cũ: %s", e)
        return new_tool.status()

    def configure(self, **params: Any) -> Dict[str, Any]:
        tool = self._require()
        tool.configure(**params)
        return tool.status()

    def predict(self, frame: np.ndarray, debug_image: bool = False) -> Dict[str, Any]:
        return self._require().infer(frame, debug_image=debug_image)

    def detector(self) -> VisionTool:
        """Instance đã nạp để nhánh B (camera) feed frame. Raise nếu chưa nạp."""
        return self._require()

    def status(self) -> Dict[str, Any]:
        return self._tool.status() if self._tool is not None else {"model_loaded": False}

    def is_loaded(self) -> bool:
        return self._tool is not None

    def _require(self) -> VisionTool:
        if self._tool is None:
            raise ToolError("Chưa nạp model — gọi load_model trước")
        return self._tool

    def close(self) -> None:
        with self._lock:
            tool = self._tool
            self._tool = None
        if tool is not None:
            tool.close()
