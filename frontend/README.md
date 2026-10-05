# Frontend workspace

Next.js 16 and React 19 renderer for the local AHSO OCR desktop application.
It is designed for Electron and the factory workstation first, not as an
independent public website.

## Runtime

- Workspace: `@ocr/frontend`
- Default development URL: `http://localhost:3970`
- Primary target viewport: `1280x1024`
- Languages: English and Vietnamese
- Styling: Tailwind CSS 4 plus project primitives
- Notifications: Sonner
- Charts: Recharts

The renderer calls only the NestJS backend. Browser-side code must not call the
Device/OCR Tool, PLC or Dongil Server directly.

## Routes

Public/startup routes:

- `/startup`
- `/login`
- `/setup`

Authenticated routes include the dashboard, Line operation, products, camera,
camera identities/debug, PLC configuration, users, roles, reports, Line Test,
test reports and settings under `/dashboard`.

Route access is driven by backend permissions. Hiding a control or route is not
an authorization boundary.

## UI constraints

- Keep application chrome fixed; only the active content pane scrolls.
- Avoid page-level horizontal overflow at `1280x1024`.
- Design operational controls for a single touchscreen and virtual keyboard.
- All user-facing text, validation, empty/error states, dialogs and
  notifications must use the i18n layer.
- Preserve the existing visual system; theme switching is not currently an
  implemented product capability.
- Use custom confirmation UI; do not use browser `alert`, `confirm` or
  `prompt`.

## Commands

Run from the repository root:

```powershell
npm run dev -w @ocr/frontend
```

Optional verification commands:

```powershell
npm run typecheck -w @ocr/frontend
npm run lint -w @ocr/frontend
npm run build -w @ocr/frontend
```

Check port `3970` before starting development. A temporary process must be
stopped after verification.

See [`../docs/09-i18n.md`](../docs/09-i18n.md),
[`../docs/10-frontend-ui-stack.md`](../docs/10-frontend-ui-stack.md), and
[`../docs/16-development.md`](../docs/16-development.md).
