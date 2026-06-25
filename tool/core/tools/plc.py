"""
PlcTool — interface trừu tượng chung cho PLC.

LƯU Ý KIẾN TRÚC:
  File này CHỈ định nghĩa hợp đồng (abstract). KHÔNG gom các protocol vào đây.
  Mỗi protocol cụ thể là MỘT FILE RIÊNG trong drivers/plc/, mỗi file một class:
      drivers/plc/modbus_tcp.py  -> class ModbusTcpPlc(PlcTool)
      drivers/plc/modbus_rtu.py  -> class ModbusRtuPlc(PlcTool)
      drivers/plc/slmp.py        -> class SlmpPlc(PlcTool)
  và tự đăng ký qua @plcs.register("<tên>"). Thêm protocol mới = thêm 1 file,
  không sửa core, không đụng các protocol khác.

Chuẩn hóa kết quả đọc/ghi về một kiểu duy nhất (PlcReadResult/PlcWriteResult)
để tầng pipeline và API không phụ thuộc kiểu trả về riêng của từng thư viện.

Quy ước địa chỉ: `address` là địa chỉ LOGIC theo PLC (vd M0, M100). Việc cộng
offset (vd Modbus coil = 8192 + M) do từng driver tự xử lý bên trong.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import List, Optional

from core.tools.base import Tool


class PlcReadResult:
    """Kết quả đọc bit/coil đã chuẩn hóa."""

    def __init__(self, bits: Optional[List[bool]] = None, error: bool = False):
        self.bits: List[bool] = list(bits or [])
        self.error: bool = error

    def is_error(self) -> bool:
        return self.error


class PlcWriteResult:
    """Kết quả ghi bit/coil đã chuẩn hóa."""

    def __init__(self, error: bool = False):
        self.error: bool = error

    def is_error(self) -> bool:
        return self.error


class PlcTool(Tool):
    kind = "plc"

    @abstractmethod
    def read_coils(self, address: int, count: int) -> PlcReadResult:
        """Đọc `count` bit liên tiếp bắt đầu từ địa chỉ logic `address`."""

    @abstractmethod
    def write_coil(self, address: int, value: bool) -> PlcWriteResult:
        """Ghi 1 bit tại địa chỉ logic `address`."""
