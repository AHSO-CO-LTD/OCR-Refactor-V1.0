# AI Agent Guide for This Project

This guide is for AI agents continuing the refactor. Read this before changing
code. The project is being converted from a PyQt desktop OCR application into a
headless FastAPI Device Tool that will later be packaged together with a main
backend and frontend.

## 1. Project Mission

This repository should become a local hardware/OCR service only.

The Device Tool owns:

- Basler camera discovery, connection, settings, and capture.
- PLC connection, read/write, light control, and pulse commands.
- OCR model loading and OCR runtime configuration.
- ROI cropping and raw OCR text extraction.
- Runtime health/status for the main backend.

The Device Tool does not own:

- Auth, users, roles, sessions, or permissions.
- Product database/config business ownership.
- Expected text decisions.
- OK/NG decisions.
- Reversed-text matching rules.
- Quantity/count/batch/report/audit logic.
- Frontend display state.
- Any PyQt or browser UI.

If a requested change decides business meaning, it belongs in the main backend,
not in this Device Tool.

## 2. Required Runtime

Use Python 3.9 only.

Reason: existing native runtime files are built for `cp39-win_amd64`, such as
OCR `.pyd` dependencies. Python 3.10+ or 3.11 can import normal Python files but
will fail when native OCR/runtime modules are loaded.

Run command:

```powershell
py -3.9 main.py
```

API docs:

```text
http://localhost:8000/api/docs
```

Do not remove the Python 3.9 guard in root `main.py`.

## 3. First Files to Read

Read these files in this order:

| Order | File | Why It Matters |
| --- | --- | --- |
| 1 | `docs/DEVICE_TOOL_BE_FE_HANDOFF.md` | Full BE/FE boundary, API ownership, old-vs-new behavior, remaining work. |
| 2 | `tool/README.md` | Short Device Tool scope, run command, and current API groups. |
| 3 | `tool/app/main.py` | FastAPI app composition and router registration. |
| 4 | `tool/app/services/runtime.py` | Shared singleton services used by routers. |
| 5 | `tool/app/services/roi_ocr_service.py` | Main OCR ROI endpoint logic. |
| 6 | `tool/app/services/ocr_service.py` | Native OCR loading, cache behavior, and PyQt runtime handling. |
| 7 | `tool/runtime/ocr/OCR.py` | Thin wrapper around the native OCR `.pyd` runtime. |
| 8 | `tool/app/services/camera_service.py` | Basler/pypylon camera lifecycle. |
| 9 | `tool/app/services/plc_service.py` | PLC client abstraction and signal mapping. |

Legacy PyQt/frontend files have been removed from the active source tree. Use
the handoff document for historical behavior, and do not reintroduce UI/business
logic into the Device Tool.

## 4. Current Folder Meaning

```text
main.py
```

Root launcher for the Device Tool. It enforces Python 3.9, prepares windowed exe
stdio, prevents duplicate instances on Windows, and runs Uvicorn.

```text
tool/app/routers/
```

FastAPI route definitions. Routers should stay thin and delegate work to
services.

```text
tool/app/services/
```

Hardware/OCR runtime logic. This is where device integration belongs.

```text
tool/app/schemas/
```

Pydantic request/response models.

```text
docs/
```

Handoff documentation. Update docs whenever API shape, ownership, or integration
flow changes.

```text
tool/runtime/ocr/
```

Native OCR runtime support. Keep `OCR.py`, `RunTime_Sofware/*.pyd`,
`RunTime_Sofware/*.dll`, and the UI files required internally by the native
runtime. This is not the future business backend.

## 5. API Boundary Rules

Preferred BE-facing endpoint:

```http
POST /api/v1/ocr/rois
```

This endpoint should return raw OCR results only:

- `success`
- `image_width`
- `image_height`
- `cycle_time_ms`
- one result per ROI
- raw `text`
- per-ROI technical `error`

It must not return:

- `expected_text`
- `matched`
- `ok`
- `ng`
- `ok_count`
- `ng_count`
- `batch`
- `count`
- final inspection result

Those fields belong to the main backend.

## 6. Backend Responsibilities

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

Suggested BE flow:

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

## 7. Frontend Responsibilities

The frontend should call the main backend only.

FE may display:

- Device health from BE.
- Active product.
- Camera preview proxied by BE.
- ROI overlays from BE config.
- Raw OCR text returned by BE.
- Final OK/NG returned by BE.
- Count, batch, reports, and errors returned by BE.

FE must not:

- Call `localhost:8000` Device Tool directly in production flow.
- Decide whether OCR text is correct.
- Implement reversed-text matching.
- Compute batch/count as source of truth.
- Bypass BE permission checks.

## 8. Legacy Logic Migration Map

Use this table when looking for old behavior:

| Old Area | Legacy Files | New Destination |
| --- | --- | --- |
| Camera connection and capture | Old `frontend/lib/Camera_Program.py` | `tool/app/services/camera_service.py` |
| PLC signals and commands | Old `frontend/lib/PLC.py` | `tool/app/services/plc_service.py` |
| OCR engine wrapper | Old `backend/AI/OCR.py` | `tool/runtime/ocr/OCR.py` plus `tool/app/services/ocr_service.py` |
| ROI crop and OCR text extraction | Old `frontend/lib/Display.py` | `tool/app/services/roi_ocr_service.py` |
| Expected text matching | Old `frontend/lib/Display.py` | Main backend only |
| OK/NG state | Old `frontend/lib/Display.py`, `frontend/lib/Main_Screen.py` | Main backend only |
| Counter/batch/report | Old `frontend/lib/Main_Screen.py` | Main backend only |
| Login/user/session | Old `frontend/lib/Login_Screen.py`, `frontend/lib/Authentication.py` | Main backend only |
| UI screens | Old `frontend/lib/*.py`, `.ui` files | Future FE only |

## 9. Development Rules for Agents

Follow these rules strictly:

- Do not work on `main` or `master`. Create or use a feature/refactor branch.
- Keep changes minimal and scoped.
- Do not revive PyQt UI.
- Do not add auth/user/session/product config into the Device Tool.
- Do not add final inspection decision logic into the Device Tool.
- Keep routers small; put runtime logic in services.
- Keep Pydantic schemas in `tool/app/schemas`.
- Keep service singletons in `tool/app/services/runtime.py`.
- Use clear error responses instead of silent failure.
- Update docs when endpoint behavior changes.
- Preserve Python 3.9 compatibility.
- Avoid destructive Git commands.

## 10. Verification Checklist

Use the checks that match the task.

Basic import/compile check:

```powershell
py -3.9 -m py_compile main.py tool\app\main.py tool\app\routers\*.py tool\app\services\*.py tool\app\schemas\*.py
```

Start API:

```powershell
py -3.9 main.py
```

Health check:

```text
GET http://localhost:8000/api/v1/health
```

OpenAPI check:

```text
GET http://localhost:8000/api/docs
```

Camera checks when hardware is connected:

```text
GET  /api/v1/camera/devices
POST /api/v1/camera/connect
POST /api/v1/camera/grab/raw
POST /api/v1/camera/disconnect
```

OCR checks with local model/images:

```text
C:\duyhai\AHSO\model\IS35R_100_E35.pt
C:\duyhai\AHSO\model\True_IS-35R_2025_11_12_10_28_25_885.bmp
C:\duyhai\AHSO\model\False_SL-37_2025_11_21_15_08_36_191.bmp
```

PLC checks are intentionally deferred until real PLC hardware testing is allowed.

## 11. Known Current State

- Device Tool endpoints exist for camera, PLC, OCR, ROI OCR, health, and legacy
  OCR compatibility.
- Source has been reduced toward a headless tool shape: legacy `api/`,
  `frontend/`, and old `backend/` folders should not be reintroduced.
- `/api/v1/ocr/rois` is the main endpoint for BE integration.
- Camera has been tested with Basler `acA2500-14gm`.
- OCR model loading and ROI OCR have been tested with the local model folder.
- PLC endpoints exist but real PLC connection testing is deferred.
- OCR native runtime now lives under `tool/runtime/ocr`.

## 12. If You Are Unsure

Use this rule:

```text
If it touches hardware, capture, OCR runtime, or raw ROI text, it can belong in
the Device Tool.

If it decides business meaning, product correctness, operator permission, count,
batch, report, audit, or UI display state, it belongs outside the Device Tool.
```

When in doubt, update documentation and ask the human before crossing this
boundary.
