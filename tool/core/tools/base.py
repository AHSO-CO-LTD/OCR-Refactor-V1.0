"""
Tool — lớp cơ sở chung cho mọi tool (camera, plc, vision).

Chuẩn hóa:
  - vòng đời: open() / close() + trạng thái ToolState
  - định danh: tool_id (instance) + kind/driver (loại)
  - lỗi:      ToolError (thông điệp hướng tới client)
  - status(): dict JSON-serializable mô tả tool
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class ToolState(str, Enum):
    """Trạng thái vòng đời của một tool."""

    CREATED = "created"   # đã khởi tạo, chưa open
    READY = "ready"       # đã open, sẵn sàng
    RUNNING = "running"   # đang stream/đang chạy tác vụ liên tục
    ERROR = "error"       # lỗi, cần can thiệp
    CLOSED = "closed"     # đã đóng tài nguyên


class ToolError(Exception):
    """
    Lỗi chuẩn hóa của tool. message nên ngắn gọn, an toàn để trả về client.
    Mọi driver nên raise ToolError thay vì exception thô của thư viện phần cứng.
    """


class Tool(ABC):
    """
    Lớp cơ sở cho mọi tool. Driver cụ thể kế thừa CameraTool/PlcTool/VisionTool
    (vốn kế thừa Tool) và hiện thực open()/close() cùng các method chuyên biệt.
    """

    #: loại tool — override ở lớp con: "camera" | "plc" | "vision"
    kind: str = "tool"
    #: tên driver — override ở driver cụ thể: "basler" | "modbus_tcp" | "ocr_dl"
    driver: str = "base"

    def __init__(self, tool_id: str, config: Optional[Dict[str, Any]] = None):
        self.tool_id = tool_id
        self.config: Dict[str, Any] = dict(config or {})
        self._state = ToolState.CREATED

    # -- trạng thái ------------------------------------------------------
    @property
    def state(self) -> ToolState:
        return self._state

    def _set_state(self, state: ToolState) -> None:
        if state != self._state:
            logger.info(
                "[%s:%s] state %s -> %s", self.kind, self.tool_id, self._state.value, state.value
            )
            self._state = state

    # -- vòng đời --------------------------------------------------------
    @abstractmethod
    def open(self) -> None:
        """Mở/kết nối tài nguyên. Phải đặt state=READY khi thành công."""

    @abstractmethod
    def close(self) -> None:
        """Đóng/giải phóng tài nguyên. Phải đặt state=CLOSED."""

    # -- tiện ích --------------------------------------------------------
    def status(self) -> Dict[str, Any]:
        """Mô tả tool dạng JSON-serializable (dùng cho REST /status)."""
        return {
            "id": self.tool_id,
            "kind": self.kind,
            "driver": self.driver,
            "state": self._state.value,
        }

    def __enter__(self) -> "Tool":
        self.open()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def __repr__(self) -> str:  # pragma: no cover - tiện debug
        return f"<{type(self).__name__} id={self.tool_id!r} state={self._state.value}>"
