"""
drivers.camera — driver camera. Import các file con để chúng tự đăng ký vào
registry `cameras`. Thêm camera mới = thêm 1 file + 1 dòng import ở đây.
"""

from drivers.camera import basler  # noqa: F401  (đăng ký "basler")
