# Project Overview

## Purpose

This project refactors an existing monolithic Python desktop application into a modular local desktop system that can be packaged as a Windows `.exe`.

The original system is an industrial OCR and inspection application used on a production line. It reads camera frames, runs OCR/AI inspection, validates product-specific rules, and stores inspection history and configuration data locally.

## Main Goals

- Replace the legacy PyQt desktop UI with Electron + Next.js.
- Move application backend logic into NestJS.
- Prepare a separate Python + FastAPI service for OCR/AI processing.
- Use PostgreSQL as the local database.
- Keep the application fully usable offline/local on an industrial PC.
- Support dongle-based software protection.
- Support role-based access control with per-user overrides.
- Support English and Vietnamese UI from the beginning.
- Package the whole solution into a single deployable desktop application experience.

## Scope Of The Refactor

### In scope

- Login and authentication
- Role and permission system
- User management
- Product management
- Camera and ROI configuration
- Inspection start/stop flow
- Exception handling during runtime
- History and reporting
- Local service orchestration
- Dongle/license check
- Desktop packaging into `.exe`

### Out of scope for the first phase

- Full AI rewrite
- Deep camera SDK rewrite
- Advanced training tooling
- Cloud deployment
- Multi-machine centralized management

## Source Project

The original project lives in:

- `D:\OCR\OCR-Metal-Core-Washing`

Useful reference assets in the source project:

- Existing PyQt UI forms
- Legacy Python modules
- SQL schema script
- Runtime AI artifacts and model files
- Dongle check logic

## Guiding Principles

- Keep the app local-first.
- Make FE depend only on REST APIs and permission data.
- Keep business rules in the backend, not in the UI.
- Treat AI service as a replaceable external module.
- Prefer additive migration over big-bang rewrite.
- Use the same UI shell for all roles, but change visible actions according to permission.
- Keep user-facing text ready for English and Vietnamese translation.
