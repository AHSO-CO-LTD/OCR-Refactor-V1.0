# Frontend UI Stack

## Requirement

The frontend should prioritize:

- shadcn/ui style components
- sonner for toast notifications
- Recharts for charts
- shadcn chart patterns for chart wrappers and dashboard visualization
- responsive layouts that are optimized first for the factory machine screen size: 1280x1080
- single-screen touchscreen workflows with virtual-keyboard-friendly inputs and large touch targets

## Current Setup

The project has started a local shadcn-style setup instead of relying on opaque generated code.

Current frontend additions:

- `components.json`
- `lib/utils.ts`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/sonner.tsx`
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/ui/confirm-modal.tsx`
- `components/inspection-trend-chart.tsx`
- `components/app-shell.tsx`
- `components/users/*`
- `components/system/error-screen.tsx`

Current frontend status:

- Login, dashboard, role permissions, and user management screens exist.
- User management supports create, edit, delete, and quick status changes.
- User create/edit flows use inline validation and confirmation for sensitive actions.
- Role permissions hide `admin/dev` from normal admin users; only `dev` can manage protected roles.
- Sonner notifications follow the selected language and use visual variants by type.
- 404/not-found/error screens use shared UI with retry/home/report actions.
- AppShell keeps header/sidebar/navbar fixed while only the active content pane scrolls.
- Product profile management exists with template apply flow, preview background simulation, and interactive ROI editing.
- Product ROI editor supports draw/move/resize/rotate, undo/redo, copy/paste, multi-select, and overlap validation.
- Dedicated Camera page exists at `/dashboard/camera` with product selection, backend-proxied Device Tool status/device discovery, connect/grab/live controls, view adjustment persistence, and manual refresh for camera status/devices.
- AppShell warms up camera status/device discovery in the background for users with camera or inspection permissions.
- Factory deployment assumptions now include a single touchscreen display, so setup/runtime screens must avoid hover-only interaction and support on-screen keyboard entry.
- Responsive hardening is still being finalized, with 1280x1080 as the primary validation viewport.

## Rules

- Prefer reusable UI primitives under `frontend/components/ui`.
- Prefer `sonner` for success/error feedback instead of inline-only messages.
- Prefer `recharts` for production dashboards and reports.
- Keep charts operational and readable, not decorative.
- Keep Vietnamese UI copy accented.
- Every user-facing page, modal, error screen, validation message, empty state, and notification must use the i18n layer and follow the user's previously selected language.
- Treat 1280x1080 as the primary validation viewport for admin and operator screens.
- At 1280x1080, the application must avoid page-level horizontal scrolling. Wide tables may scroll inside their own bordered container.
- Header, sidebar, and navbar must stay fixed as application chrome. Only the current page/tab content area should scroll.
- Use responsive grids with `minmax(0, 1fr)`, `overflow-x-auto` for dense tables, and controlled widths for sidebars/forms.
- Do not rely only on `xl`/large desktop layouts. Check mobile, tablet, laptop, 1280x1080 factory screen, and wider desktop behavior.
- Keep action buttons reachable and readable at 1280x1080; avoid layouts where forms and dense tables compete side by side unless enough content width remains.
- Role/admin screens must not expose protected `admin/dev` permission editing to normal admin users. Frontend hiding is required for UX, but backend authorization remains mandatory.
- Treat factory setup and runtime screens as touch-first. Important actions must have clear visible buttons, touch targets should be comfortably large, and numeric/text entry should work cleanly with the Windows on-screen keyboard.

## Immediate Frontend Next Step

1. Validate dashboard, roles, users, and products at 1280x1080.
2. Fix any page-level horizontal overflow; keep table overflow inside table containers.
3. Re-check mobile, tablet, 1024x768, 1366x768, 1536x864, and 1920x1080.
4. Finish Product module UI hardening and persisted save/load verification.
5. Verify the Camera page with a running Device Tool and start dedicated ROI/History/Reports operational screens after product profile behavior is stable.

## Responsive Viewport Priority

Primary target:

```text
1280x1080
```

Secondary validation sizes:

```text
375x812    mobile
768x1024   tablet portrait
1024x768   small industrial/laptop screen
1366x768   common laptop
1536x864   wide laptop
1920x1080  full HD desktop
```

All future UI work should be implemented so the 1280x1080 factory viewport feels intentionally designed, not merely "not broken".
