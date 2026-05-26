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
- `EpaAdminRouteGuard` restricts users with `profile.epaAdmin === true` to a whitelisted path regex (`/`, `/epa/*`, `/config-region`, `/salud/aperturas/detalle/*`). Combined with `src/config/epaOnlyUids.js` (`isEpaRestrictedUser`), Home also hides every module except EPA for those UIDs.

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

### Routing & module layout

`src/App.jsx` declares every route in one place. Page modules live under `src/pages/<Module>/`:
- `Despacho/` — in-progress and finalized dispatch views.
- `Documentacion/` — document library + `colecciones` grouping.
- `EPA/` — EPA hub and finished openings.
- `Mantenimiento/Equipos/` and `Mantenimiento/OTs/` — equipment registry and work orders (`solicitudesOT` with `subtareas` subcollection plus a global `subtaskList` catalog).
- `Recepcion/AccionDescarga/` — unload actions; `MetricaRecepcion.jsx` is a large analytics page that queries `accion_descarga` directly.
- `Salud Ocupacional/` (note the space in the path) — `Aperturas`, `ControlMarcas`, `ControlTerceros`, `Visados`, plus a metrics page.
- `ServiciosGenerales/` — work orders + tarima validation.
- `Zona Franca/` (note the space) — tarima weighing and lookup.

Two directories have spaces (`Salud Ocupacional`, `Zona Franca`); quote them in shell commands.

### Firestore collections (most relevant)

`profiles`, `usernames`, `pushTokens`, `despachos` (+ `items`, `fotos`, `layout` subcolls), `equipos`, `checklists_diarias`, `solicitudesOT` (+ `subtareas`), `subtaskList`, `accion_descarga`, `aperturas`, `aperturasRecepcion`, `recepcionCofersa_lotes`, `tareas_apertura`, `controlMarcas/{day}/marcas`, `usuariosTerceros`, `controlTerceros`, `visados`, `visadosPorFirmar`, `documentacion`, `colecciones`, `fichas`, `chats/{id}/mensajes`, `dashboard_salud_daily`, `pesajes`. There is a `collectionGroup("fotos")` read rule (`firestore.rules:305`).

### Cloud Functions

`functions/index.js` exposes one callable (`sendEquipoQrLabel`, region `us-central1`) that re-validates the caller's profile, tenant/company match against `equipos/{id}`, generates a QR PNG, and emails it via Gmail SMTP. New functions should follow the same pattern: pull `profiles/{uid}` server-side and re-check tenant/company — never trust client-passed scope.
