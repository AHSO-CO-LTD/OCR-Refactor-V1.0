"""
config — cài đặt VẬN HÀNH của API server (chỉ những gì server tự cần).

Triết lý: việc CHỌN driver và tham số phần cứng KHÔNG nằm ở đây. Client (mọi
frontend) tự quyết định lúc chạy bằng cách gửi {driver, params} trong request:

    POST /tool/v1/camera/connect  {"driver": "basler", "params": {...}}

Đổi camera/PLC = client gửi driver khác → backend chỉ tra registry và tạo tool
tương ứng, KHÔNG sửa/không build lại. Vì vậy config.json server chỉ giữ vài cài
đặt cấp hạ tầng mà client không quan tâm.

Tuỳ chọn: có thể đặt vài "preset" sẵn để client gọi nhanh theo tên thay vì gửi
full params, nhưng client luôn được phép override — preset chỉ là tiện ích.

Ví dụ config.json:
{
  "bind_host": "0.0.0.0",
  "bind_port": 8000,
  "presets": {
    "cam_line1": {"kind": "camera", "driver": "basler", "params": {"exposure": 3000}}
  }
}
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

_DEFAULTS: Dict[str, Any] = {
    "bind_host": "0.0.0.0",
    "bind_port": 8000,
    "presets": {},
}


class Config:
    """Bao quanh dict cấu hình vận hành của server."""

    def __init__(self, data: Dict[str, Any]):
        self._data = data

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    @property
    def bind_host(self) -> str:
        return self._data.get("bind_host", "0.0.0.0")

    @property
    def bind_port(self) -> int:
        return int(self._data.get("bind_port", 8000))

    @property
    def presets(self) -> Dict[str, Dict[str, Any]]:
        """Preset tuỳ chọn: tên -> {kind, driver, params}. Client có thể override."""
        return self._data.get("presets", {})

    def preset(self, name: str) -> Optional[Dict[str, Any]]:
        return self.presets.get(name)

    def as_dict(self) -> Dict[str, Any]:
        return dict(self._data)


def load_config(path: str) -> Config:
    """Đọc config.json, trộn với mặc định. File thiếu -> dùng mặc định."""
    data: Dict[str, Any] = dict(_DEFAULTS)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data.update(json.load(f))
    env_port = os.getenv("DEVICE_TOOL_PORT") or os.getenv("API_PORT")
    if env_port:
        data["bind_port"] = int(env_port)
    env_host = os.getenv("DEVICE_TOOL_HOST") or os.getenv("API_HOST")
    if env_host:
        data["bind_host"] = env_host
    return Config(data)
