# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Frontend (root):
- `npm run dev` — Vite dev server with HMR.
- `npm run build` — Production build to `dist/` (deployed by Firebase Hosting).
- `npm run lint` — ESLint over the repo.
- `npm run preview` — Serve the built `dist/` locally.

Firebase deploys (project `oloos-bd`, see `.firebaserc`):
- `firebase deploy --only hosting` — Build to `dist/` first; hosting rewrites everything to `/index.html`.
- `firebase deploy --only firestore:rules` — Publish `firestore.rules`.
- `firebase deploy --only functions` — Publish callable functions in `functions/` (Node 20, region `us-central1`).

Environment:
- Frontend reads `VITE_FB_*` from `.env` (see `src/firebase.js`).
- Functions read SMTP creds from `functions/.env` via `dotenv` (`SMTP_USER`, `SMTP_PASS` — Gmail app password).

## High-level architecture

Single-page React 19 app on top of Firebase (Auth + Firestore + Storage + Functions). UI is in Spanish. There is no test suite.

### Auth + tenant gating (the critical path)

`src/auth/AuthProvider.jsx` is the source of truth at runtime:
1. `onAuthStateChanged` fires; if signed in, it loads `profiles/{uid}` from Firestore.
2. If the profile doc is missing or fails to read, it force-signs-out — there is no "logged-in without profile" state.
3. The context exposes `{ user, profile, permisos, role, epaAdmin, loading, error }`.

Every protected route uses `PrivateRoute` = `RequireAuth` → `RequireTenant` → `EpaAdminRouteGuard`:
- `RequireAuth` waits for `loading` then redirects to `/login` if no user/profile.
- `RequireTenant` reads `localStorage["appolo_profile"]` (written at login in `pages/Login.jsx`) and redirects to `/config-region` if `tenantId` is missing. **The localStorage copy and the Firestore profile are two parallel sources — keep them in sync when editing login or profile flows.**
- `EpaAdminRouteGuard` restricts users with `profile.epaAdmin === true` to a whitelisted path regex (`/`, `/epa/*`, `/config-region`, `/salud/aperturas/detalle/*`) **plus a partial MRP Tarimas whitelist delegated to `src/config/mrpAccess.js`**. Combined with `src/config/epaOnlyUids.js` (`isEpaRestrictedUser`), Home hides every module except EPA (and MRP Tarimas, when permitted) for those UIDs.

### Multi-tenant scoping (tenantId + company)

Every business document carries `tenantId` and `company`. Enforcement is two-layered:
- **Server (authoritative):** `firestore.rules` uses `sameTenantCompanyData(data)` plus permission helpers (`isAdminRequester`, `hasPerm('mantenimiento' | 'saludOcupacional' | 'canRecepcionCofersa' | 'despachosEPA' | …)`). Reads, creates, and updates almost always require the doc's tenant/company to match the requester's profile.
- **Client (defensive filter):** `src/utils/dataScope.js` exposes `filterByUserScope`, `filterSolicitudesOtByScope`, `filterEquiposByScope`. Listeners (e.g., `src/services/aperturas.js`) subscribe broadly and then filter in memory because some legacy docs lack tenant fields — those helpers intentionally pass through docs with no `tenantId`/`company` set.

When adding a new collection, mirror this pattern: write rules with `sameTenantCompanyData` + a permission check, and on the client either query with `where("tenantId", "==", …)` or filter via `dataScope`.

### Permission model

Two orthogonal axes on `profiles/{uid}`:
- `role`: `"administrativo"` / `"dev"` get blanket access via `isAdminRequester()`; `"operativo"` has its own carve-outs (e.g., checklists).
- `permisos`: a map of booleans keyed by module (e.g., `permisos.mantenimiento`, `permisos.saludOcupacional`, `permisos.canRecepcionCofersa`, `permisos.despachosEPA`). Rules use `hasPerm('key')`.

`profile.epaAdmin` is a third flag layered on top (see above).

**MRP Tarimas access** is defined in `src/config/mrpAccess.js` (the single source of truth, consumed by `EpaAdminRouteGuard`, `workAreas.jsx`, the module sidebar and `useMrpAccess`):
- *Sections* — `epaAdmin` profiles are structurally limited to `MRP_RESTRICTED_PATHS` (Dashboard, Inventario › Artículos, Inventario › En Cliente / Tienda, Historial de movimientos). Insumos, Catálogos, Descartes, Registro de eventos and Registro de insumos are not reachable and cannot be granted by permission.
- *Writes* — `permisos.mrpAjustes` / `permisos.mrpTraslados` gate the Ajuste and Traslado actions. `epaAdmin` profiles get no role override (read-only until granted); other users keep the pre-existing behaviour (admin role or `mrpTarimas` implies both).

When adding a permission key, update `PERMISSION_OPTIONS` **and** `validPermisosMap` in `firestore.rules` — its `keys().hasOnly([...])` rejects unknown keys, and `normalizePermissionMap` writes every key on save.

### Routing & module layout

`src/App.jsx` declares every route in one place. Landing/navigation entry points:
- `/` and `/areas` → `pages/AreasTrabajoHubPage.jsx` (the main hub — module grid + quick-access strip).
- `/welcome` → `pages/Home.jsx` (post-login welcome screen, kept separate from the hub).
- `/config-region` → tenant/region setup, the only protected route that skips `RequireTenant`.
- `/pesado` → shortcut to `Zona Franca/PesajeTarimas` (also reachable under `/servicios-generales/pesaje-tarimas`).

Page modules live under `src/pages/<Module>/`:
- `Despacho/` — in-progress and finalized dispatch views.
- `Documentacion/` — document library + `colecciones` grouping.
- `EPA/` — EPA hub and finished openings.
- `Mantenimiento/Equipos/` and `Mantenimiento/OTs/` — equipment registry and work orders (`solicitudesOT` with `subtareas` subcollection plus a global `subtaskList` catalog). The OTs dashboard at `/mantenimiento/ots/dashboard` is fed by helpers in `src/pages/Mantenimiento/OTs/dashboard/` (`computeOTsDashboardMetrics.js`, `periodUtils.js`, `useOTsDashboardMetrics.js`) — keep period math and metric aggregation in those files rather than inside the page component.
- `Recepcion/AccionDescarga/` — unload actions; `MetricaRecepcion.jsx` is a large analytics page that queries `accion_descarga` directly and exports via `src/utils/metricaRecepcionExcelPro.js` (multi-sheet xlsx, incl. `Tiempos_proveedor` and the EPA trend section).
- `SSO/Seguridad/` — `Aperturas`, `ControlMarcas`, `ControlTerceros`, `Visados`, plus `MetricaSaludOcupacional.jsx` at `/seguridad/metricas` (reads `dashboard_salud_daily` + `aperturas`). Branded **"Seguridad"** (routes `/seguridad/*`; legacy `/salud/*` redirects to it via `SaludLegacyRedirect` in App.jsx). `SSO` ("Salud y Seguridad Ocupacional") is the umbrella folder; a separate **"Salud Ocupacional"** work area exists only as a coming-soon placeholder (`/salud-ocupacional`).
- `ServiciosGenerales/` — work orders + tarima validation.
- `Zona Franca/` (note the space) — tarima weighing and lookup.

`Zona Franca` has a space in its path; quote it in shell commands.

### Shared UI kit

All pages render through a single design system under `src/components/ui/` (barrel-exported via `src/components/ui/index.js`). Design tokens (colors, radii, shadows, `CONTAINER_MAX`, `FONT_STACK`) live in `src/styles/theme.js` — the source of truth; do not hardcode hex codes in page styles. Key primitives:
- **Layout:** `Shell` (locks body scroll + sets brand background), `Topbar` (sticky header with the global sidebar/area navigator), `Brand`, `Main` / `Container`, `Hero`.
- **Cards & grids:** `Card`, `ModuleCard`, `ModuleGrid`, `KpiCard` / `KpiGrid`, `RowCard`, `QuickCard`, `IconBox`.
- **Controls & status:** `Button` (+ `PrimaryButton`, `SecondaryButton`, `GhostButton`), `Badge`, `StatusPill`, `Chip` / `ChipsRow`, `SearchInput`, `Field`, `Sheet`, `EmptyState`, `Spinner`.

The "Recepción style" was the reference look; commit `cc4abeb` migrated every page to this kit. When adding a page, compose these primitives instead of writing bespoke wrappers, and import tokens (`ACCENT`, `BORDER`, `SLATE`, `TEXT`, `CONTAINER_MAX`, …) from `src/styles/theme.js`.

### Sidebar & pinned quick-access

`Topbar.jsx` ships a global sidebar that lists every area + its sub-modules (filtered by `epaAdmin` / `isEpaRestrictedUser`) — keep the `AREAS` array in `Topbar.jsx` in sync when routes are added or renamed.

`src/hooks/usePinnedModules.js` persists user-pinned modules to `localStorage["appolo_pinned_modules"]` as `[{ label, path }]`. `ModuleCard` exposes a pin toggle; the hub's quick-access strip reads from this hook. (All `FooterNote` / "Tip" cards were removed — don't reintroduce them.)

### Firestore collections (most relevant)

`profiles`, `usernames`, `pushTokens`, `despachos` (+ `items`, `fotos`, `layout` subcolls), `equipos`, `checklists_diarias`, `solicitudesOT` (+ `subtareas`), `subtaskList`, `accion_descarga`, `aperturas`, `aperturasRecepcion`, `recepcionCofersa_lotes`, `tareas_apertura`, `controlMarcas/{day}/marcas`, `usuariosTerceros`, `controlTerceros`, `visados`, `visadosPorFirmar`, `documentacion`, `colecciones`, `fichas`, `chats/{id}/mensajes`, `dashboard_salud_daily`, `pesajes`. There is a `collectionGroup("fotos")` read rule (`firestore.rules:305`).

### Cloud Functions

`functions/index.js` exposes one callable (`sendEquipoQrLabel`, region `us-central1`) that re-validates the caller's profile, tenant/company match against `equipos/{id}`, generates a QR PNG, and emails it via Gmail SMTP. New functions should follow the same pattern: pull `profiles/{uid}` server-side and re-check tenant/company — never trust client-passed scope.
