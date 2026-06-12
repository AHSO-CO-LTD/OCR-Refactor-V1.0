# Business Rules

## Role Model

The system uses four top-level roles:

- `dev`
- `admin`
- `engineer`
- `operator`

These roles describe default behavior, but the actual permission set is not hard-coded by role alone.

## Permission Model

Each role or user has a permission list.

Permissions can be:

- assigned by role
- overridden by user
- added or removed by admin

This allows one shared UI with different visible actions depending on who is logged in.

## Role Definitions

### Dev

The dev role is the highest level.

Properties:

- hidden from all other roles
- full system access
- used for technical override and maintenance
- should not be assignable by normal admin flow unless explicitly allowed

### Admin

Admin has broad system control.

Expected abilities:

- full or near-full operational access
- manage users
- manage roles and permissions
- assign permissions per user and per role
- manage system settings
- manage products and operational configuration

### Engineer

Engineer is the technical production role.

Default focus:

- product management
- image/camera parameters
- inspection tuning
- ROI and OCR-related settings

Actual permissions should still be configurable by admin.

### Operator

Operator is the floor user role.

Default focus:

- open machine
- select product
- start/stop production
- handle exceptions
- adjust ROI during runtime if permitted

## Shared UI Rule

All roles use the same application shell and screen structure.

What changes is:

- which menus are visible
- which buttons are enabled
- which forms are read-only
- which operations are blocked by backend authorization

## Language Rule

The application must support English and Vietnamese.

Rules:

- all user-facing UI text should be translatable
- permission keys remain technical identifiers
- permission display names should support both languages
- backend should prefer stable error codes so frontend can localize messages

## Permission Enforcement Rule

Permissions must be enforced in two places:

1. Frontend for usability
2. Backend for security

Frontend hiding alone is never enough.

## Recommended Permission Categories

- `user.manage`
- `role.manage`
- `permission.manage`
- `product.manage`
- `camera.manage`
- `roi.edit`
- `inspection.start`
- `inspection.stop`
- `inspection.override`
- `history.view`
- `report.view`
- `system.shutdown`
- `system.debug`
- `license.view`

## Data Safety Rules

- passwords must be hashed
- sensitive hardware secrets must not be exposed to the browser
- dongle logic should stay in desktop/native/backend layer
- audit logs should capture administrative changes

## Operational Rules

- operator actions during production should be traceable
- product change and parameter change should be versioned or logged
- emergency overrides should be visible in history
- locked users should be handled by attempt policy
