# VisionCenter Device Tool

Full BE/FE integration handoff:
`../docs/DEVICE_TOOL_BE_FE_HANDOFF.md`

AI agent continuation guide:
`../docs/AI_AGENT_GUIDE.md`

This folder is the new headless FastAPI tool for local machine hardware and OCR
runtime work. It intentionally does not own auth, users, sessions, or product
business configuration. Those concerns belong to the main backend.

## Scope

- Camera connection, configuration, and image capture.
- PLC connection, coil read/write, and pulse commands.
- OCR model loading, OCR runtime configuration, and prediction.
- OCR ROI extraction from image or camera frame.
- Runtime health/status for the main backend to call locally.

## API Groups

- `GET /`
- `GET /api/v1/health`
- `GET /api/v1/camera/devices`
- `POST /api/v1/camera/connect`
- `POST /api/v1/camera/disconnect`
- `POST /api/v1/camera/settings`
- `POST /api/v1/camera/grab`
- `POST /api/v1/camera/grab/raw`
- `POST /api/v1/plc/connect`
- `POST /api/v1/plc/disconnect`
- `POST /api/v1/plc/read`
- `GET /api/v1/plc/signals`
- `POST /api/v1/plc/write`
- `POST /api/v1/plc/light`
- `POST /api/v1/plc/pulse`
- `POST /api/v1/plc/error-pulse`
- `POST /api/v1/ocr/load-model`
- `POST /api/v1/ocr/config`
- `POST /api/v1/ocr/predict`
- `POST /api/v1/ocr/rois`
- `POST /api/v1/ocr/predict-file`
- `WS /api/v1/ocr/ws`
- `POST /api/v1/ai/ocr_ai/load_model`
- `POST /api/v1/ai/ocr_ai/input_config`
- `WS /api/v1/ai/ocr_ai/ws`

## Run

Use Python 3.9. The native runtime files are built for `cp39-win_amd64`, so
Python 3.10+ or 3.11 will not load the hardware/OCR dependencies correctly.

```powershell
py -3.9 main.py
```

Open API docs:

```text
http://localhost:8000/api/docs
```

## OCR ROI Request Example

The main backend owns product logic and final OK/NG decisions. This tool reads
text from camera/image ROIs and returns raw OCR output plus technical metadata.

```json
{
  "model_path": "D:/models/IS35R_100_E35.pt",
  "grab_from_camera": true,
  "roi_list": [
    { "label": "slot-1", "x": 410, "y": 260, "width": 300, "height": 440 },
    { "label": "slot-2", "x": 890, "y": 260, "width": 300, "height": 440 }
  ],
  "acceptance_threshold_ocr": 0.5,
  "duplication_threshold_ocr": 0.5,
  "row_threshold": 20
}
```

The response includes `cycle_time_ms`, image dimensions, and one raw OCR text
entry per ROI. The main backend should compare text to product rules and decide
OK/NG, counts, reports, and frontend display.

## Business Boundary

This tool must not decide product OK/NG results. The main backend owns:

- Product expected text and matching rules.
- Reversed text acceptance.
- OK/NG counts and final result.
- Batch/count/report/audit logic.
- User/session/auth and frontend display state.
