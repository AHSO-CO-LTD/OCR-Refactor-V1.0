"""
Registry — đăng ký & tra cứu driver / pipeline theo tên (config-driven).

Mỗi driver/pipeline nằm ở 1 file riêng và tự đăng ký bằng decorator:

    # drivers/plc/modbus_tcp.py
    from core.registry import plcs

    @plcs.register("modbus_tcp")
    class ModbusTcpPlc(PlcTool):
        ...

Khi cần dùng, tra theo tên lấy từ config:

    cls = plcs.get(config["driver"])     # -> ModbusTcpPlc
    tool = cls(tool_id, config)

Thêm loại mới = thêm 1 file + import nó (xem core.loader). Không sửa core.
"""

from __future__ import annotations

import logging
from typing import Callable, Dict, List, Type, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class Registry:
    """Bảng tra cứu name -> class, dùng chung cho camera/plc/vision/pipeline."""

    def __init__(self, label: str):
        self._label = label
        self._items: Dict[str, type] = {}

    def register(self, name: str) -> Callable[[Type[T]], Type[T]]:
        """Decorator đăng ký một class dưới `name`."""

        def deco(cls: Type[T]) -> Type[T]:
            if name in self._items and self._items[name] is not cls:
                logger.warning(
                    "[registry:%s] ghi đè '%s' (%s -> %s)",
                    self._label,
                    name,
                    self._items[name].__name__,
                    cls.__name__,
                )
            self._items[name] = cls
            logger.info("[registry:%s] đăng ký '%s' -> %s", self._label, name, cls.__name__)
            return cls

        return deco

    def get(self, name: str) -> type:
        if name not in self._items:
            raise KeyError(
                f"{self._label} '{name}' chưa được đăng ký. "
                f"Có sẵn: {self.names() or '[trống]'}"
            )
        return self._items[name]

    def names(self) -> List[str]:
        return sorted(self._items)

    def __contains__(self, name: str) -> bool:
        return name in self._items


# Các registry dùng chung toàn project, tách theo category.
cameras = Registry("camera")
plcs = Registry("plc")
ai = Registry("ai")          # thuật toán dựa trên model/weights (yolo_ocr...)
visions = Registry("vision")  # vision classic dựa trên tham số (dành cho sau này)
pipelines = Registry("pipeline")
