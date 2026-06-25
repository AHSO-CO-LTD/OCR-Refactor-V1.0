import base64


def decode_base64_image(image_base64: str):
    import cv2
    import numpy as np

    try:
        raw = base64.b64decode(image_base64, validate=True)
    except Exception as exc:
        raise ValueError(f"Invalid base64 image: {exc}") from exc

    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("Image payload could not be decoded")
    return image


def encode_image_base64(
    image,
    encode_format: str = ".jpg",
    jpeg_quality: int = 95,
) -> str:
    import cv2

    if image is None or image.size == 0:
        raise ValueError("Image is empty")

    params: List[int] = []
    if encode_format.lower() in {".jpg", ".jpeg"}:
        params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]

    ok, buffer = cv2.imencode(encode_format, image, params)
    if not ok:
        raise ValueError(f"Failed to encode image as {encode_format}")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def encode_image_bytes(
    image,
    encode_format: str = ".jpg",
    jpeg_quality: int = 95,
) -> bytes:
    import cv2

    if image is None or image.size == 0:
        raise ValueError("Image is empty")

    params: List[int] = []
    if encode_format.lower() in {".jpg", ".jpeg"}:
        params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]

    ok, buffer = cv2.imencode(encode_format, image, params)
    if not ok:
        raise ValueError(f"Failed to encode image as {encode_format}")
    return buffer.tobytes()


def media_type_for_format(encode_format: str) -> str:
    value = encode_format.lower()
    if value in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if value == ".png":
        return "image/png"
    if value == ".bmp":
        return "image/bmp"
    return "application/octet-stream"
from typing import List
