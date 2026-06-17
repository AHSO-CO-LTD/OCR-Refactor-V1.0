# VisionCenter Device Tool

Headless FastAPI service for local camera, PLC, and OCR runtime work.

This repository is no longer a PyQt UI application. It has been reduced toward a
single local Device Tool that will later be launched together with the main
backend and frontend in one desktop app/exe.

## Purpose

This tool owns only machine-facing work:

- Basler camera discovery, connection, settings, and capture.
- PLC connection, read/write, light control, and pulse commands.
- OCR model loading and runtime configuration.
- ROI crop and raw OCR text extraction.
- Health/status endpoints for the main backend.

This tool must not own business logic:

- No auth, users, roles, or sessions.
- No product database/config ownership.
- No expected-text decision.
- No OK/NG decision.
- No reversed-text matching decision.
- No quantity/count/batch/report/audit logic.
- No frontend display state.
- No PyQt/browser UI.

The main backend calls this tool, applies business rules, and returns final state
to the frontend. The frontend should call the main backend only.

## Current Structure

```text
.
  AGENTS.md
  README.md
  config.json
  main.py
  requirements.txt
  docs/
    AI_AGENT_GUIDE.md
    DEVICE_TOOL_BE_FE_HANDOFF.md
  tool/
    README.md
    app/
      core/
      routers/
      schemas/
      services/
    runtime/
      ocr/
        OCR.py
        RunTime_Sofware/
```

Important paths:

| Path | Purpose |
| --- | --- |
| `main.py` | Root launcher. Enforces Python 3.9 and starts `tool.app.main:app`. |
| `config.json` | Local API host/port config. |
| `tool/app/main.py` | FastAPI app and router registration. |
| `tool/app/routers/` | API routes for health, camera, PLC, OCR, and legacy OCR compatibility. |
| `tool/app/services/` | Runtime logic for camera, PLC, OCR, ROI OCR, and shared services. |
| `tool/app/schemas/` | Pydantic request/response models. |
| `tool/runtime/ocr/` | Native OCR wrapper and required `.pyd/.dll` runtime files. |
| `docs/DEVICE_TOOL_BE_FE_HANDOFF.md` | Full BE/FE handoff and old-vs-new behavior. |
| `docs/AI_AGENT_GUIDE.md` | Detailed guide for AI agents continuing this project. |
| `AGENTS.md` | Required rules for coding agents. |

## Runtime Requirement

Use Python 3.9.

The native OCR runtime is built for `cp39-win_amd64`. Python 3.10+ or 3.11 may
start normal Python code but will fail when loading native OCR dependencies.

Recommended command:

```powershell
py -3.9 main.py
```

## Install

Create and use a Python 3.9 environment, then install dependencies:

```powershell
py -3.9 -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If using the global Python 3.9 already installed on the machine:

```powershell
py -3.9 -m pip install -r requirements.txt
```

## Run

Start the Device Tool:

```powershell
py -3.9 main.py
```

Default local URLs:

```text
API root:    http://localhost:8000
Swagger:     http://localhost:8000/api/docs
ReDoc:       http://localhost:8000/api/redoc
Health:      http://localhost:8000/api/v1/health
```

Host/port are read from `config.json`:

```json
{
  "api_host": "localhost",
  "api_port": 8000
}
```

## API Groups

Health:

```http
GET /
GET /api/v1/health
```

Camera:

```http
GET  /api/v1/camera/status
GET  /api/v1/camera/devices
POST /api/v1/camera/connect
POST /api/v1/camera/disconnect
POST /api/v1/camera/settings
POST /api/v1/camera/grab
POST /api/v1/camera/grab/raw
```

`/api/v1/camera/devices` lists hardware that can be discovered.
`/api/v1/camera/status` reports whether this Device Tool process has opened a
camera connection. A camera can be listed while `connected` is still `false`
until `/api/v1/camera/connect` is called.

PLC:

```http
GET  /api/v1/plc/status
POST /api/v1/plc/connect
POST /api/v1/plc/disconnect
POST /api/v1/plc/read
GET  /api/v1/plc/signals
POST /api/v1/plc/write
POST /api/v1/plc/light
POST /api/v1/plc/pulse
POST /api/v1/plc/error-pulse
```

OCR:

```http
GET  /api/v1/ocr/status
POST /api/v1/ocr/load-model
POST /api/v1/ocr/config
POST /api/v1/ocr/predict
POST /api/v1/ocr/predict-file
POST /api/v1/ocr/rois
WS   /api/v1/ocr/ws
```

Legacy OCR compatibility:

```http
POST /api/v1/ai/ocr_ai/load_model
POST /api/v1/ai/ocr_ai/input_config
WS   /api/v1/ai/ocr_ai/ws
```

New backend code should prefer `/api/v1/ocr/*`.

## Primary Backend Endpoint

The main backend should primarily call:

```http
POST /api/v1/ocr/rois
```

Example request using camera capture:

```json
{
  "model_path": "C:/duyhai/AHSO/model/IS35R_100_E35.pt",
  "grab_from_camera": true,
  "roi_list": [
    {
      "label": "slot-1",
      "x": 410,
      "y": 260,
      "width": 300,
      "height": 440,
      "rotate_clockwise": true
    },
    {
      "label": "slot-2",
      "x": 890,
      "y": 260,
      "width": 300,
      "height": 440,
      "rotate_clockwise": true
    }
  ],
  "acceptance_threshold_ocr": 0.5,
  "duplication_threshold_ocr": 0.5,
  "row_threshold": 20
}
```

Example response:

```json
{
  "success": true,
  "image_width": 3000,
  "image_height": 1000,
  "cycle_time_ms": 293.3,
  "results": [
    {
      "index": 0,
      "label": "slot-1",
      "text": "IS-35R",
      "x": 410,
      "y": 260,
      "width": 300,
      "height": 440,
      "error": null
    }
  ],
  "error": null
}
```

This response is raw OCR output. It intentionally does not include `ok`,
`matched`, `expected_text`, `count`, `batch`, `ok_count`, or `ng_count`.

## Backend Responsibilities

The main backend should:

- Store product config.
- Store expected text.
- Store ROI list per product.
- Store model path or model identifier.
- Store camera settings per product.
- Store OCR thresholds per product.
- Decide matching rules, including reversed text.
- Call the Device Tool for raw OCR.
- Convert raw OCR into OK/NG.
- Update quantity/count/batch/report/audit.
- Return final inspection state to FE.

Suggested flow:

```text
1. FE asks BE to run inspection.
2. BE loads active product config.
3. BE checks Device Tool health.
4. BE connects/configures camera if needed.
5. BE calls POST /api/v1/ocr/rois.
6. BE receives raw OCR text per ROI.
7. BE applies product matching rules.
8. BE computes OK/NG, quantity, count, batch, report.
9. BE returns final result to FE.
```

## Frontend Responsibilities

The frontend should call the main backend only.

The frontend may display:

- Device health from BE.
- Active product.
- Camera preview proxied by BE.
- ROI overlays from BE config.
- Raw OCR text returned by BE.
- Final OK/NG returned by BE.
- Count, batch, reports, and errors returned by BE.

The frontend must not:

- Call `localhost:8000` Device Tool directly in production flow.
- Decide whether OCR text is correct.
- Implement reversed-text matching.
- Compute batch/count as source of truth.
- Bypass BE permission checks.

## Verification

Syntax check without writing bytecode:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
@'
from pathlib import Path
files = [Path('main.py'), *Path('tool').rglob('*.py')]
for path in files:
    compile(path.read_text(encoding='utf-8'), str(path), 'exec')
print(f'syntax_ok {len(files)} files')
'@ | py -3.9 -
```

OpenAPI check:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
@'
from fastapi.testclient import TestClient
from tool.app.main import app
client = TestClient(app)
paths = client.get('/openapi.json').json()['paths']
print('ocr_rois', '/api/v1/ocr/rois' in paths)
print('inspection_removed', '/api/v1/inspection/run' not in paths)
'@ | py -3.9 -
```

OCR runtime smoke test:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
@'
from tool.app.services.ocr_service import OCRService
service = OCRService()
print(service.load_model(r'C:\duyhai\AHSO\model\IS35R_100_E35.pt'))
print(service.status())
'@ | py -3.9 -
```

PLC connection test is intentionally deferred until real PLC hardware testing is
approved.

## Packaging Notes

When packaging the final app/exe, the launcher should start:

- Device Tool FastAPI local service.
- Main backend local service.
- Frontend/Electron shell.

Packaging must include:

- Python 3.9 runtime.
- `tool/runtime/ocr/RunTime_Sofware/*.pyd`
- `tool/runtime/ocr/RunTime_Sofware/*.dll`
- `tool/runtime/ocr/RunTime_Sofware/form_UI/*.ui`
- Model files or a stable model path resolution strategy.
- Local health checks so BE/FE know whether Device Tool is ready.

## Current Verified State

- `AGENTS.md` exists at repository root.
- Legacy `api/`, `frontend/`, and old `backend/` folders were removed from the
  active source tree.
- OCR native runtime now lives under `tool/runtime/ocr`.
- OpenAPI still exposes `/api/v1/ocr/rois`.
- Removed business endpoint `/api/v1/inspection/run` is not present.
- OCR model load was verified with `C:\duyhai\AHSO\model\IS35R_100_E35.pt`.
- ROI OCR was verified with the local test image and returned `IS-35R` and
  `R53-SI`.

## More Documentation

- Full BE/FE handoff: `docs/DEVICE_TOOL_BE_FE_HANDOFF.md`
- AI agent guide: `docs/AI_AGENT_GUIDE.md`
- Tool-local README: `tool/README.md`
- Coding agent rules: `AGENTS.md`
