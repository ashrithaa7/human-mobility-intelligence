> Historical implementation-phase record. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the completed handoff, current validation and known limits.

# Design restoration

This document records the earlier styling-only phase. Subsequent functional changes and current verification are documented in `CRITICAL_IMPLEMENTATION_REPORT.md`.

Restored on 29 October 2026 using project files only. No Git commands or history were used.

## Evidence and causes

- `project-code-review.txt` retains earlier planner pages and shared navigation. Its planner page backgrounds are `bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900`; navigation and primary controls use purple; panels use translucent white with white borders. Its temporal bars use purple-to-pink and blue-to-cyan gradients.
- The current auth pages, reports, admin user management, analysis components, duplicated dashboard components, and map/chart series still carry that palette. These corroborate the saved source listing.
- The landing, public dashboard, planner dashboard, and planner analysis backgrounds had instead become a navy/blue radial gradient. Their cards and welcome areas also introduced blue/cyan surfaces, accents and extra spacing. Shared header/sidebar/footer styles introduced another navy/blue navigation treatment.
- Root body colours and `--hmi-*` variables reinforced the navy palette. The shared surfaces used nearly opaque navy backgrounds, obscuring the purple page gradient.
- The newer public feature workspace used a light background, white cards, dark text and black/indigo controls, unlike the surrounding dashboards. Admin dashboard/data screens used the same light classes, partially restyled with `.hmi-admin .bg-white`, `.text-slate-*` and input overrides. Those overrides left other states and accent colours inconsistent.
- Global `form.space-y-*` selectors added opaque cards and padding solely because a form used a spacing utility, including a second card inside the access-request panel.
- Global chart overrides forced another blue-grey palette with `!important`. Chart axis titles also needed an explicit light fill for the dark workspace.

## Restoration

Restored the evidenced slate–purple page gradient, purple controls and active navigation, purple/pink accents, translucent cards, white borders and muted grey typography. Shared surface and input definitions now live in Tailwind's components layer so intentional utility states and status borders retain precedence. Auth panels are explicitly applied to their containers instead of inferred from form spacing. Existing analytics gradients and map/series colours are preserved. Map controls, popup contrast and chart labels remain legible. Mobile headings, card padding, statistics grids, report actions and admin tabs adapt to smaller screens.

The exact former landing headline treatment, shadow values, and original layouts for newer feature/data pages are not recorded in the remaining files. Their styling is a consistent reconstruction from the surviving palette and components, not a claim of pixel-exact recovery. No original font asset was available; the existing font stack is retained.

## Changed application files

All paths below are relative to `frontend/`:

- `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/request-access/page.tsx`
- `app/(protected)/dashboard/page.tsx`
- `app/(protected)/planner/dashboard/page.tsx`, `app/(protected)/planner/analysis/page.tsx`, `app/(protected)/planner/reports/page.tsx`
- `app/(protected)/admin/dashboard/page.tsx`, `app/(protected)/admin/data/page.tsx`, `app/(protected)/admin/users/page.tsx`
- `components/auth/LoginForm.tsx`, `components/auth/RegisterForm.tsx`
- `components/common/Header.tsx`, `components/common/Sidebar.tsx`, `components/common/Footer.tsx`
- `components/dashboard/PublicFeatureWorkspace.tsx` (shared by maps, temporal analysis, insights and travel)
- `next.config.js`: optional `HMI_NEXT_DIST_DIR` permits isolated build verification alongside an existing development server; default output remains `.next`.

## Verification and limits

- `npm.cmd run type-check`: passed.
- `$env:HMI_NEXT_DIST_DIR = '.next-design-restoration'; npm.cmd run build`: passed, all 31 routes generated/compiled. The initial standard build encountered a partial manifest in the output also used by an existing local server, so production verification used isolated output.
- All 15 application page URLs returned HTTP 200 from the isolated production server. This checks delivery of page shells, not authenticated end-to-end behavior.
- Checked the production CSS for 18 required surface, input, gradient, responsive-grid and focus selectors: all present. The broad form/admin override selectors are absent.
- A pre-edit SHA-256 inventory covers 58 frontend source files. Comparing changed TSX files after removing only `className` attributes found **no other changes**. Authentication, role checks, routing, event handlers, API requests, upload parameters, data semantics and exports are unchanged. Frontend API routes, map implementation, chart data logic, libraries, backend code and dependencies were not modified.
- Inventory and comparison results are in `frontend/.design-review/functional-baseline.json` and `verification-result.json`.
- Browser review was stopped by the user with Escape before rendered-page inspection. Authenticated flows, live map rendering and mobile screenshots were not visually verified.
- Existing build warnings about `swcMinify`, multiple lockfiles and metadata viewport remain; no dependency changes were made.
