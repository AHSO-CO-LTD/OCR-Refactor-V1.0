"""
streaming — kênh truyền frame 1 producer (thread) -> 1 consumer (WebSocket).

Đơn giản hóa cho nhu cầu hiện tại: mỗi camera phục vụ MỘT client xem stream tại
một thời điểm. Kênh giữ đúng frame mới nhất (hàng đợi 1 phần tử, drop-old): nếu
client gửi chậm, frame cũ bị bỏ để luôn nhận frame mới nhất, giảm trễ.

Cầu nối thread -> asyncio: camera chạy ở thread thường, WS chạy trên event loop;
publish() dùng loop.call_soon_threadsafe để đẩy an toàn sang event loop.

(Khi nào cần nhiều client cùng xem, chỉ việc nâng cấp lớp này thành fan-out; phần
còn lại của hệ thống không phải đổi.)
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)


class LatestFrame:
    """
    Ô giữ frame/dữ liệu MỚI NHẤT (drop-old, an toàn đa luồng) — dùng nối producer
    (thread chụp) với consumer (worker encode / worker vision).

    Producer publish() liên tục; consumer wait_newer() luôn nhận phần tử mới nhất,
    bỏ qua phần tử trung gian nếu xử lý không theo kịp. Nhờ vậy producer không bị
    consumer chậm kéo theo (tách encode/vision khỏi thread chụp).
    """

    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._item: Any = None
        self._seq = 0
        self._closed = False

    def publish(self, item: Any) -> None:
        with self._cond:
            self._item = item
            self._seq += 1
            self._cond.notify_all()

    def wait_newer(self, last_seq: int, timeout: float = 1.0) -> Tuple[Any, int]:
        with self._cond:
            if self._seq <= last_seq and not self._closed:
                self._cond.wait(timeout)
            if self._closed or self._seq <= last_seq:
                return None, last_seq
            return self._item, self._seq

    def close(self) -> None:
        with self._cond:
            self._closed = True
            self._cond.notify_all()


class FrameChannel:
    """Kênh 1-1 an toàn đa luồng, giữ frame mới nhất."""

    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: "Optional[asyncio.Queue[Any]]" = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Gắn event loop của server (gọi 1 lần lúc startup)."""
        self._loop = loop

    def has_consumer(self) -> bool:
        return self._queue is not None

    def open(self) -> "asyncio.Queue[Any]":
        """Mở kênh cho 1 client. Gọi trong WS handler (ngữ cảnh async)."""
        self._queue = asyncio.Queue(maxsize=1)
        return self._queue

    def close(self) -> None:
        """Đóng kênh khi client rời đi."""
        self._queue = None

    def publish(self, item: Any) -> None:
        """Đẩy frame mới nhất cho client. An toàn gọi từ thread camera."""
        loop = self._loop
        q = self._queue
        if loop is None or q is None:
            return
        loop.call_soon_threadsafe(self._offer, q, item)

    @staticmethod
    def _offer(q: "asyncio.Queue[Any]", item: Any) -> None:
        # drop-old: hàng đợi đầy thì bỏ phần tử cũ rồi nạp phần tử mới
        if q.full():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass
