"""
logging_setup — chuẩn hóa logging cho toàn project.

Gọi setup_logging() một lần khi khởi động API. Mọi module dùng
logging.getLogger(__name__) sẽ tự kế thừa cấu hình này.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


def setup_logging(
    log_dir: str,
    level: int = logging.INFO,
    filename: str = "api.log",
) -> logging.Logger:
    """Thiết lập log ra cả file lẫn console. Trả về logger gốc 'api'."""
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(
        level=level,
        format=_FORMAT,
        handlers=[
            logging.FileHandler(os.path.join(log_dir, filename), encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    return logging.getLogger("api")


def get_logger(name: Optional[str] = None) -> logging.Logger:
    return logging.getLogger(name)
