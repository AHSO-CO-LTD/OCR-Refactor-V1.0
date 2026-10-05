# Product

## Name

AHSO OCR Metal Core Washing

## Users

- Operators run production on a single touchscreen industrial PC.
- Engineers configure products, OCR, ROI, cameras, PLC, and diagnostic tests.
- Administrators manage operational users, permissions, settings, updates, and Dongil configuration.
- Developers perform protected support, simulation, and deep diagnostics.

## Purpose

Provide a reliable local workflow for camera- and PLC-driven OCR inspection,
production result capture, report review, and optional aggregate synchronization
with Dongil Server.

## Product Principles

- Current machine state must be understandable at a glance.
- Production continues locally when Dongil Server is unavailable.
- Hardware and business rules remain backend-authoritative.
- Operational controls are touch-friendly, visible, and predictable.
- Errors explain recovery without exposing internal secrets.
- English and Vietnamese terminology remain consistent through the i18n layer.
- Stable production behavior and data recovery take priority over visual novelty.

## Primary Workflows

1. Electron validates local services, database migrations, license, and configured hardware.
2. User signs in or restores an eligible remembered session.
3. Operator selects a product and enters the Line workspace.
4. Manual or PLC Auto flow captures a frame and obtains OCR results.
5. Backend applies product rules, persists eligible production results, and drives configured PLC outputs.
6. Reports read local history independently of Dongil availability.
7. Dongil outbox and historical workers synchronize aggregate OK/NG quantities when authorized and connected.

## Non-goals

- Cloud SaaS operation.
- Direct renderer access to camera, PLC, PostgreSQL, dongle, or Device Tool.
- Rewriting the protected Device Tool or original license implementation as part of application work.
- Sending camera images, ROI detail, raw OCR rows, or PLC internals to Dongil Server.

## Experience Direction

Clear, dependable, and operational. Avoid decorative SaaS styling, ambiguous
status, hover-only actions, excessive cards, and layouts that compromise the
1280 x 1024 factory viewport.

## Accessibility

Use semantic controls, visible focus, keyboard access, sufficient contrast,
large touch targets, and status communication that does not rely on color alone.
