# Project Overview

## Purpose

AHSO OCR Metal Core Washing is a local Windows factory application that combines
camera capture, product-specific OCR, PLC-driven machine flow, local production
history, reporting, and optional Dongil Server synchronization.

The refactor replaces a Python/PyQt monolith with a modular desktop system while
retaining Python for device and OCR work behind a versioned local API.

## Deployment Context

- One Windows industrial PC and one touchscreen display.
- Administrator privilege is required on every packaged launch.
- PostgreSQL and all application services run locally.
- Factory network and Internet availability vary.
- Core inspection and reporting remain local when Dongil Server is unavailable.
- Internet is needed only for online runtime provisioning or GitHub-based updates when used.

## System Components

- Electron desktop lifecycle and privileged operations.
- Next.js/React user interface.
- NestJS REST and WebSocket backend.
- PostgreSQL database managed through Prisma migrations.
- Read-only Python/FastAPI Device Tool for Basler camera, OCR, Modbus TCP, and SLMP.
- Existing USB dongle implementation for application licensing.
- Optional Dongil Server machine presence and aggregate result synchronization.

## Implemented Scope

- Authentication, users, roles, permissions, and first-run admin setup.
- Product, AI, OCR variant, camera, camera identity, and ROI configuration.
- Line operation, test workflows, PLC runtime, result persistence, reports, and export.
- License startup gate and remembered-session physical-dongle requirement.
- Electron startup/shutdown, watchdog, NSIS installer, updater, and recovery.
- Dongil registration, heartbeat, live outbox, and historical reconciliation.

## Deliberate Boundaries

- Frontend calls backend only.
- Backend owns business decisions, permissions, persistence, and Tool adaptation.
- Device Tool source is not modified from application tasks.
- Original license source and binaries are not modified without specific approval.
- Raw camera and ROI details remain local and are not sent to Dongil Server.

## Current Maturity

The source is beyond the original scaffold and foundation phases. Version 1.4.0
has historical release evidence. Production readiness still requires explicit
target-machine validation covering database, installer, updater, dongle, camera,
PLC, OCR, offline recovery, and Dongil behavior.

Use [../PROJECT_PROFILE.md](../PROJECT_PROFILE.md) for the central current profile.
