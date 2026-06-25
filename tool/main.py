"""
main — điểm chạy server (nằm ở thư mục gốc project, ngang cấp với api/).

Dev:   python main.py   (hoặc: uvicorn api.app:app --reload)
"""

from __future__ import annotations

import os
import sys

_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import uvicorn

from core.config import load_config

if __name__ == "__main__":
    config = load_config(os.path.join(_PROJECT_ROOT, "config.json"))
    uvicorn.run(
        "api.app:app",
        host=config.bind_host,
        port=config.bind_port,
        reload=True,
        log_level="info",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
