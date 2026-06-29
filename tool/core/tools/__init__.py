"""core.tools — interface chung cho mọi loại tool phần cứng/AI."""

from core.tools.base import Tool, ToolState, ToolError
from core.tools.camera import CameraTool, FrameCallback
from core.tools.plc import PlcTool, PlcReadResult, PlcWriteResult
from core.tools.vision import VisionTool

__all__ = [
    "Tool",
    "ToolState",
    "ToolError",
    "CameraTool",
    "FrameCallback",
    "PlcTool",
    "PlcReadResult",
    "PlcWriteResult",
    "VisionTool",
]
