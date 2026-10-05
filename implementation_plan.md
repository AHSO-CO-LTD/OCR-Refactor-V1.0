# Implementation Plan Index

Status: Superseded as an active plan

The former ROI-crop investigation in this file described an earlier repository
path and proposed a Tool-side change. It is not an approved implementation plan
for the current checkout and must not be used to modify the read-only `tool/` submodule.

Active and historical approved plans are stored under `docs/plans/`.

Current documentation baseline work:

- `docs/plans/2026-10-05-documentation-baseline-refresh.md`

Known ROI contract issue:

- The editor stores and displays free-angle ROI rotation.
- Current backend live and image paths normalize runtime crop rotation to
  90-degree increments because Device Tool accepts `0`, `90`, `180`, or `270`.
- Any change to the Tool contract requires a separately approved Tool-side task.
- Application-side remediation must first define whether the product will
  constrain editing to supported rotations or implement a backend-only
  free-angle crop that preserves the Tool boundary.

No ROI implementation change is approved by this index.
