"""
YoloOcr — driver OCR dùng trực tiếp ultralytics.YOLO (task obb), hiện thực VisionTool.

Thay cho Deep_Learning_Tool (compiled, dính PyQt5). Model detect TỪNG KÝ TỰ dưới
dạng oriented bounding box; "text" được ráp lại bằng post-processing thuần Python:
gom các box thành hàng theo toạ độ dọc (cy, sai số <= row_threshold), trong mỗi
hàng sắp trái→phải theo cx, rồi nối tên lớp (ký tự). Trả về DANH SÁCH các dòng.

imgsz KHÔNG hardcode: đọc từ chính model lúc load (vd 352, 608...).

Tham số config (params từ client):
    model_path    : đường dẫn .pt trên máy server (tuỳ chọn lúc tạo, có thể load sau)
    conf          : ngưỡng chấp nhận (acceptance), mặc định 0.5
    iou           : ngưỡng khử trùng lặp (duplication/NMS), mặc định 0.5
    row_threshold : sai số pixel theo trục dọc để gom hàng, mặc định 20
    device        : (tuỳ chọn) 'cpu' / 0 / 'cuda:0'; None → ultralytics tự chọn
"""

from __future__ import annotations

import base64
import logging
import os
import threading
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from ultralytics import YOLO

from core.registry import ai
from core.tools.base import ToolError, ToolState
from core.tools.vision import VisionTool

logger = logging.getLogger(__name__)


@ai.register("yolo_ocr")
class YoloOcr(VisionTool):
    kind = "ai"
    driver = "yolo_ocr"

    def __init__(self, tool_id: str, config: Optional[dict] = None):
        super().__init__(tool_id, config)
        self._model: Optional[YOLO] = None
        self._imgsz: Optional[int] = None
        self._conf = float(self.config.get("conf", 0.5))
        self._iou = float(self.config.get("iou", 0.5))
        self._row_threshold = int(self.config.get("row_threshold", 20))
        self._device = self.config.get("device")  # None → auto
        self._lock = threading.Lock()  # YOLO model không an toàn đa luồng

    # -- vòng đời --------------------------------------------------------
    def open(self) -> None:
        model_path = self.config.get("model_path")
        if model_path:
            self.load_model(model_path)
        self._set_state(ToolState.READY)

    def close(self) -> None:
        with self._lock:
            self._model = None
        self._set_state(ToolState.CLOSED)

    # -- model -----------------------------------------------------------
    def load_model(self, model_path: str) -> None:
        if not model_path:
            raise ToolError("model_path rỗng")
        if not os.path.exists(model_path):
            raise ToolError(f"Không tìm thấy model: {model_path}")
        try:
            model = YOLO(model_path)
            # imgsz lấy theo model huấn luyện (không hardcode)
            imgsz = int(model.model.args.get("imgsz", 640))
            # warm-up để lần infer đầu không bị chậm
            model.predict(
                np.zeros((imgsz, imgsz, 3), np.uint8),
                imgsz=imgsz,
                device=self._device,
                verbose=False,
            )
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Nạp model thất bại: {e}")

        with self._lock:
            self._model = model
            self._imgsz = imgsz
        logger.info(
            "[yolo_ocr:%s] đã nạp model %s (task=%s, imgsz=%s, classes=%s)",
            self.tool_id,
            os.path.basename(model_path),
            model.task,
            imgsz,
            len(model.names),
        )

    def configure(self, **params: Any) -> None:
        if params.get("conf") is not None:
            self._conf = float(params["conf"])
        if params.get("iou") is not None:
            self._iou = float(params["iou"])
        if params.get("row_threshold") is not None:
            self._row_threshold = int(params["row_threshold"])

    # -- suy luận --------------------------------------------------------
    def infer(self, frame: np.ndarray, debug_image: bool = False) -> Dict[str, Any]:
        if self._model is None:
            return {"success": False, "error": "Model chưa được nạp"}
        if frame is None or getattr(frame, "size", 0) == 0:
            return {"success": False, "error": "Ảnh rỗng"}
        # YOLO cần ảnh 3 kênh — camera mono trả ảnh xám (H,W) hoặc (H,W,1).
        if frame.ndim == 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        elif frame.ndim == 3 and frame.shape[2] == 1:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        try:
            with self._lock:
                res = self._model.predict(
                    frame,
                    conf=self._conf,
                    iou=self._iou,
                    imgsz=self._imgsz,
                    device=self._device,
                    verbose=False,
                )
            rows = self._assemble_rows(res[0])
            result: Dict[str, Any] = {"success": True, "rows": rows}
            if debug_image:
                result["debug_image_base64"] = self._encode_debug_image(res[0])
            return result
        except Exception as e:
            logger.error("[yolo_ocr:%s] lỗi infer: %s", self.tool_id, e)
            return {"success": False, "error": str(e)}

    def _encode_debug_image(self, r: Any) -> Optional[str]:
        try:
            annotated = r.plot()
            success, buffer = cv2.imencode(".jpg", annotated)
            if not success:
                return None
            payload = base64.b64encode(buffer).decode("ascii")
            return f"data:image/jpeg;base64,{payload}"
        except Exception as e:
            logger.error("[yolo_ocr:%s] debug image failed: %s", self.tool_id, e)
            return None

    def _assemble_rows(self, r: Any) -> List[str]:
        """Gom box ký tự thành các dòng text (trên→dưới, mỗi dòng trái→phải)."""
        names = r.names
        items = []  # (cx, cy, ký_tự)

        obb = getattr(r, "obb", None)
        boxes = getattr(r, "boxes", None)
        if obb is not None and len(obb) > 0:
            xywhr = obb.xywhr.cpu().numpy()
            cls = obb.cls.cpu().numpy().astype(int)
            for i in range(len(cls)):
                items.append((float(xywhr[i, 0]), float(xywhr[i, 1]), str(names[int(cls[i])])))
        elif boxes is not None and len(boxes) > 0:
            xywh = boxes.xywh.cpu().numpy()
            cls = boxes.cls.cpu().numpy().astype(int)
            for i in range(len(cls)):
                items.append((float(xywh[i, 0]), float(xywh[i, 1]), str(names[int(cls[i])])))

        if not items:
            return []

        # Gom hàng theo cy
        items.sort(key=lambda t: t[1])
        rows: List[list] = []
        row_ref = items[0][1]
        current: list = [items[0]]
        for it in items[1:]:
            if abs(it[1] - row_ref) <= self._row_threshold:
                current.append(it)
            else:
                rows.append(current)
                current = [it]
                row_ref = it[1]
        rows.append(current)

        # Mỗi hàng sắp theo cx rồi nối ký tự
        lines: List[str] = []
        for row in rows:
            row.sort(key=lambda t: t[0])
            lines.append("".join(t[2] for t in row))
        return lines

    # -- trạng thái ------------------------------------------------------
    def status(self) -> dict:
        s = super().status()
        s["model_loaded"] = self._model is not None
        s["conf"] = self._conf
        s["iou"] = self._iou
        s["row_threshold"] = self._row_threshold
        s["imgsz"] = self._imgsz
        s["num_classes"] = len(self._model.names) if self._model is not None else 0
        return s
