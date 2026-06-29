"""
core — Framework tái sử dụng cho mọi project (frontend-agnostic).

Gồm các nhóm trừu tượng chính, độc lập hoàn toàn với phần cứng và giao diện:
  - core.tools     : interface chung cho Camera / PLC / Vision
  - core.pipeline  : engine chạy bài toán (latest-frame, fan-out cho client)
  - core.registry  : đăng ký & tra cứu driver / pipeline theo tên (config-driven)
  - core.config    : nạp cấu hình project
  - core.logging_setup : chuẩn hóa logging

Quy ước: lớp này KHÔNG import PyQt, không import driver phần cứng cụ thể,
không phụ thuộc bất kỳ frontend nào. Driver/pipeline cụ thể nằm ở
`drivers/` và `pipelines/` ở thư mục gốc project.
"""

__version__ = "0.1.0"
