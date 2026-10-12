# Business Rules

## Roles And Permissions

- `dev` is the highest authority, hidden from other roles, and used for protected support and diagnostics.
- `admin` manages operational users, permissions, settings, updates, and integrations but cannot obtain dev-only permissions.
- `engineer` focuses on product, camera, OCR, ROI, PLC configuration, tests, and reports according to assigned permissions.
- `operator` focuses on Line operation according to assigned permissions.
- Default Operator Dongil access is read status, refresh registration, reconnect
  saved approved configuration, view history progress, and start a new history
  run. Operator cannot edit/test/save/reset/register/disconnect or
  pause/resume/cancel/retry a history run.
- Backend permissions are authoritative; frontend visibility is not authorization.
- When a user has explicit permissions, they replace the role-derived list in the current implementation.

## Account Safety

- Passwords are bcrypt hashes.
- A user cannot delete the currently signed-in account.
- Non-dev users cannot create, edit, or delete `dev` users.
- The system blocks deletion, deactivation, or demotion that would remove the last active admin.
- Production seed creates a hidden support dev; the customer creates the first admin explicitly.
- Every active role may opt into remembered login. It stores no password or
  durable access JWT, requires the same machine and a real dongle, and issues a
  fresh JWT with current permissions on restore.
- Logout, login without Remember, role change, account deactivation, and account
  deletion revoke the remembered credential. Recoverable startup/dongle errors do not.

## Product And ROI

- Product code and product name are unique.
- Product profiles contain batch quantity, AI thresholds, accepted OCR variants,
  camera settings, and indexed ROI regions.
- Products may be created before ROI configuration is complete.
- Product profile templates may copy approved camera/ROI settings to selected products.
- Overlapping ROI regions are rejected before persistence.
- ROI coordinates use center-based application geometry.
- Current runtime crop rotation supports 90-degree increments; free-angle editor
  geometry must not be assumed to match the current Tool crop contract.

## Inspection Results

- One Line session belongs to one selected product at a time.
- Product change closes the current session and opens a new session while preserving machine stop state.
- Per-capture ROI logs retain expected text, matched text, OCR rows, result, image path, error, and capture time as available.
- Aggregate `UNKNOWN` is not latched, counted, saved as a production capture, or sent to PLC.
- Manual Grab and Line Test are diagnostic flows and do not emit production OK/NG PLC pulses.
- Result and training-image saving follow their configured policies and folders.

## PLC

- Supported protocols are Modbus TCP and Mitsubishi SLMP.
- Protocol selection is explicit; connection failure does not fall back to another protocol.
- Fixed signal addresses are optional and skipped independently when unset.
- Modbus logical M addresses are converted to the configured coil offset; SLMP uses M addresses directly.
- OK and NG pulse durations are independently configurable.
- Camera live off preserves the last frame without requiring a physical disconnect.
- Manual camera disconnect suppresses automatic reconnect until explicit reconnect.
- PLC simulator is dev-only and must be authorized in backend.

## Inactivity And Recovery

- Automatic inactivity pause defaults to enabled with a 300-second timeout.
- PLC capture, manual Grab attempt, and active renderer interaction reset inactivity.
- Disabling inactivity pause does not change PLC stop/start behavior.
- Only admin/dev may change inactivity settings.
- Hardware/service reconnect resumes only after readiness checks; state is not silently declared healthy.

## Dongil

- A valid local dongle is required before machine identity and registration.
- Registration and connection are explicit operations.
- Only aggregate washing OK/NG quantities and product identity are synchronized.
- Images, ROI detail, OCR rows, camera data, and PLC internals remain local.
- Results persist locally before transmission.
- `ACCEPTED` and `REPLAYED` are successful delivery dispositions.
- Retry preserves stable local IDs and original inspection timestamps.
- Historical synchronization never deletes local results.
- The local OCR client type is fixed to `WASHING_MACHINE`; a different
  server-assigned type blocks connection and sending.
- PostgreSQL is authoritative for Dongil server configuration after the one-time
  legacy `.env` import.

## Language And Display

- English and Vietnamese are mandatory.
- Vietnamese text uses proper diacritics.
- Primary operational viewport is 1280 x 1024 on one touchscreen.
- Important actions must be visible and usable without hover.
- Date grouping for production and Dongil business scopes uses GMT+7.
