# Agent Instructions

This repository is being refactored into a headless FastAPI Device Tool. It is
not the final product backend or frontend.

## Required Reading

Before changing code, read these files:

- `docs/DEVICE_TOOL_BE_FE_HANDOFF.md`
- `docs/AI_AGENT_GUIDE.md`
- `tool/README.md`

## Hard Rules

- Do not work on `main` or `master`.
- Use Python 3.9 only.
- Do not add UI back into this repository.
- Do not add auth, user, session, product config, OK/NG, count, batch, report,
  or audit logic into the Device Tool.
- Keep business logic in the main backend that calls this tool.
- Keep frontend display logic in the future frontend, not here.
- Keep routers thin and place hardware/OCR runtime logic in services.
- Keep Pydantic models in `tool/app/schemas`.
- Keep native OCR runtime under `tool/runtime/ocr`.
- Do not delete or move `.pyd`, `.dll`, or required runtime UI files unless OCR
  still verifies afterward.
- Update docs when API shape, ownership, or runtime paths change.
- Avoid destructive Git commands.

## Current Scope

This tool may own:

- Camera discovery, connect, settings, and image capture.
- PLC connect, read/write, light, and pulse commands.
- OCR model load/cache/config.
- ROI crop and raw OCR text extraction.
- Health/status endpoints.

This tool must not own final inspection truth. The main backend must decide
expected text, reversed-text matching, OK/NG, counters, batch, reports, audit,
auth, and permissions.

## Verification

Use the checks that match the task:

```powershell
py -3.9 -m py_compile main.py tool\app\main.py tool\app\routers\*.py tool\app\services\*.py tool\app\schemas\*.py tool\runtime\ocr\OCR.py
py -3.9 main.py
```

Then check:

```text
GET http://localhost:8000/api/v1/health
GET http://localhost:8000/api/docs
```
