import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from tool.app.core.config import get_config
from tool.app.services.image_codec import decode_base64_image


class OCRService:
    def __init__(self):
        self._engine = None
        self._qt_app = None
        self._model_path: Optional[str] = None
        self._load_error: Optional[str] = None
        self._config = {
            "acceptance_threshold_ocr": 0.5,
            "duplication_threshold_ocr": 0.5,
            "row_threshold": 20,
        }

    @property
    def model_loaded(self) -> bool:
        return bool(self._engine and hasattr(self._engine, "_model_OCR"))

    def status(self) -> dict:
        return {
            "model_loaded": self.model_loaded,
            "model_path": self._model_path,
            "config": dict(self._config),
            "load_error": self._load_error,
        }

    def load_model(self, model_path: str) -> dict:
        normalized_path = str(Path(model_path).resolve())
        if self.model_loaded and self._model_path == normalized_path:
            return {"success": True, "model_path": normalized_path, "cached": True}

        engine = self._ensure_engine()
        engine.load_model(normalized_path)
        engine.input_config(**self._config)
        self._model_path = normalized_path
        return {"success": True, "model_path": normalized_path, "cached": False}

    def configure(
        self,
        acceptance_threshold_ocr: float = 0.5,
        duplication_threshold_ocr: float = 0.5,
        row_threshold: int = 20,
    ) -> dict:
        self._config = {
            "acceptance_threshold_ocr": acceptance_threshold_ocr,
            "duplication_threshold_ocr": duplication_threshold_ocr,
            "row_threshold": row_threshold,
        }
        if self._engine:
            self._engine.input_config(**self._config)
        return {"success": True, "config": dict(self._config)}

    def predict_base64(
        self,
        image_base64: str,
        overrides: Optional[Dict[str, Any]] = None,
    ) -> dict:
        return self.predict_image(decode_base64_image(image_base64), overrides)

    def predict_image(
        self,
        image,
        overrides: Optional[Dict[str, Any]] = None,
    ) -> dict:
        engine = self._ensure_engine()
        if overrides:
            runtime_config = {**self._config, **{k: v for k, v in overrides.items() if v is not None}}
            engine.input_config(**runtime_config)
        else:
            engine.input_config(**self._config)
        return engine.predict(image)

    def predict_encoded_bytes(
        self,
        image,
        overrides: Optional[Dict[str, Any]] = None,
        encode_format: str = ".jpg",
        jpeg_quality: int = 95,
    ) -> dict:
        import cv2
        import numpy as np

        params: List[int] = []
        if encode_format.lower() in {".jpg", ".jpeg"}:
            params = [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
        ok, buffer = cv2.imencode(encode_format, image, params)
        if not ok:
            raise ValueError(f"Failed to encode image as {encode_format}")
        decoded = cv2.imdecode(np.frombuffer(buffer.tobytes(), np.uint8), cv2.IMREAD_COLOR)
        return self.predict_image(decoded, overrides)

    def _ensure_engine(self):
        if self._engine:
            return self._engine

        config = get_config()
        repo_root = config.base_dir
        ai_dir = repo_root / "tool" / "runtime" / "ocr"
        runtime_dir = ai_dir / "RunTime_Sofware"
        for path in [str(ai_dir), str(runtime_dir)]:
            if path not in sys.path:
                sys.path.insert(0, path)

        try:
            self._ensure_qt_app()
            from OCR import OCR

            self._engine = OCR()
            self._engine.input_config(**self._config)
            self._load_error = None
            return self._engine
        except Exception as exc:
            self._load_error = str(exc)
            raise RuntimeError(f"OCR runtime is not available: {exc}") from exc

    def _ensure_qt_app(self):
        try:
            from PyQt5.QtWidgets import QApplication

            self._qt_app = QApplication.instance() or QApplication(sys.argv)
        except Exception:
            # Some environments can configure the OCR runtime without Qt loaded.
            # The real error will surface when the native OCR engine is imported.
            return
