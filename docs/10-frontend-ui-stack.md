# Frontend UI Stack

## Technology

- Next.js 16 App Router and React 19.
- TypeScript and Tailwind CSS 4.
- Local shadcn-style primitives.
- Sonner notifications.
- Recharts for charts.
- Lucide icons.
- `react-simple-keyboard` for touch entry.

## Route Map

| Route | Purpose |
| --- | --- |
| `/setup` | First customer admin and result-folder setup |
| `/login` | License-aware sign-in and remembered session restore |
| `/dashboard/line` | Primary operator Line workspace |
| `/dashboard/line-test` | Diagnostic image/camera batch test |
| `/dashboard/line-animation-test` | DEV animation/runtime diagnostic |
| `/dashboard/configuration` | Product, AI, ROI, camera, identity, and diagnostics tabs |
| `/dashboard/configuration/plc` | PLC configuration |
| `/dashboard/reports` | Production result reporting |
| `/dashboard/test-reports` | Test-session failure reporting |
| `/dashboard/users` | User management |
| `/dashboard/roles` | Operational role permissions |
| `/dashboard/settings` | General, operation, result, Dongil, update, desktop, and DEV settings |

Legacy camera, camera-debug, camera-identity, and product routes redirect to the
matching Configuration tab. `/dashboard` currently redirects to the Line workspace.

## Layout

- Primary target: 1280 x 1024 factory touchscreen.
- Secondary checks: 1024 x 768, 1366 x 768, 1536 x 864, 1920 x 1080,
  tablet portrait, and supported mobile layouts.
- App chrome remains fixed while active content scrolls.
- `dev/admin` use sidebar; operational roles use navbar.
- Dense tables use internal horizontal scrolling, never page-level overflow.

## Interaction

- Critical actions are visible and do not depend on hover.
- Inputs support the Windows or in-app virtual keyboard.
- Validation is inline and focuses the first invalid field.
- Manual Save, destructive actions, sensitive settings, and dirty exit use custom confirmation dialogs.
- Sonner is reserved for meaningful asynchronous success, error, warning, and system events.
- Loading is localized to the affected control or region.
- No remembered credential opens the login form directly. The temporary access
  JWT stays in `sessionStorage`; Electron owns the encrypted remember token.
- Operator sees Dongil URL/type as read-only and only receives controls allowed
  by its current backend permissions.

## Runtime State

- Machine state is backend-owned and survives route navigation.
- Frontend polls or uses WebSocket only for presentation and operator actions.
- The Line workspace uses real product and machine APIs but still contains a demo
  fallback when product loading fails; production behavior must make that fallback unmistakable or remove it.
- DEV role preview changes frontend presentation only and does not grant backend authority.

## Accessibility

Use semantic elements, labels, keyboard focus, non-color status cues, sufficient
contrast, and large touch targets. Status and safety text remain visible even
when non-critical explanations are moved into tooltips.
