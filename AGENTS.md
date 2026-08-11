# AGENTS.md

Guidance for coding assistants working in AppoloDesk. UI copy and user-facing flows are in Spanish.

## Commands

Frontend (repository root):

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — production build to `dist/`.
- `npm run lint` — ESLint over the repository.
- `npm run preview` — serve `dist/` locally.
- `npm run assistant:knowledge` — rebuild the generated assistant JSON in `docs/` and `public/` from routes, work areas and capability sources.

Backfills:

- `npm run backfill:profiles-area`
- `npm run backfill:solicitudes-created-area`
- `npm run backfill:solicitudes-bodega`
- `npm run backfill:tiempo-respuesta`

Firebase project `oloos-bd`:

- `firebase deploy --only hosting` — run the build first; hosting rewrites to `/index.html`.
- `firebase deploy --only firestore:rules`
- `firebase deploy --only functions`

Environment:

- Frontend reads `VITE_FB_*`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and optionally `VITE_ASSISTANT_WEBHOOK_URL`.
- Functions read SMTP, SQL Server and Supabase service credentials from `functions/.env`; never expose or commit secrets.
- Cloud Functions run on Node 20; callable business functions use region `us-central1` where explicitly configured.

There is no automated test suite. Validate changes with lint/build and focused runtime checks.

## Architecture

React 19 SPA backed by Firebase Auth, Firestore, Storage and Cloud Functions. MRP Tarimas uses Supabase tables/RPCs. The assistant UI sends contextual requests to an optional webhook/n8n workflow.

### Authentication and route guards

`src/auth/AuthProvider.jsx` is the runtime source of truth. On auth change it loads `profiles/{uid}`; a missing/unreadable profile forces sign-out. It exposes user/profile, role, permisos, `tenantId`, `company`, `bodegaId`, `bodegaNombre`, `epaAdmin`, loading and error.

`PrivateRoute` applies:

1. `RequireAuth`
2. `RequireTenant`
3. `EpaAdminRouteGuard`
4. `RequireRouteAccess`

`RequireTenant` reads `localStorage["appolo_profile"]` and now requires both `tenantId` and `bodegaId`. Login, ConfigRegion and BodegaSwitcher update Firestore/localStorage; preserve synchronization when changing profile flows.

`RequireRouteAccess` uses `src/config/routeAccess.js` and `src/config/permissions.js`. Keep route gates synchronized with work-area visibility.

`profile.epaAdmin === true` restricts navigation to `/`, `/welcome`, `/areas`, `/epa/*`, `/config-region` and Seguridad/Salud aperture detail paths, plus the MRP Tarimas subset listed in `src/config/mrpAccess.js` (`MRP_RESTRICTED_PATHS`). `src/config/epaOnlyUids.js` adds the legacy restricted-user check.

`src/config/mrpAccess.js` is the single source of truth for MRP Tarimas access: which sections a restricted profile may open, and whether the profile may register ajustes (`permisos.mrpAjustes`) or traslados (`permisos.mrpTraslados`). Read it through `useMrpAccess()` inside the module.

### Scope: tenant + company + bodega

Business data is scoped by `tenantId`, `company`, `bodegaId` and often `bodegaNombre`.

- Firestore rules remain authoritative.
- `sameTenantCompanyData` checks tenant/company.
- `sameTenantScopeData` is the phase-1 bodega migration helper: tenant/company are mandatory; documents with `bodegaId` must match the profile, while legacy documents without it temporarily pass.
- `src/utils/dataScope.js` mirrors defensive filtering client-side.
- New writes should include all four scope fields when available.
- Do not switch to a strict bodega requirement in rules until the backfill is complete and verified.

Bodega catalog: `src/config/bodegas.js`. Current scopes are CR/OLO (CLIRO, El Coco) and VNZ/OLO (San Diego, Michelena). Some bodegas also map to SRO warehouse IDs.

### Roles and permissions

Roles: `dev`, `administrativo`, `operativo`. Admin roles generally override module permissions; Dev routes still require `dev`.

Canonical permissions from `src/config/permissions.js`:

- Operations: `despacho`, `recepcion`, `recepcionReportes`, `canRecepcionCofersa`, `despachosEPA`.
- Security: `saludOcupacional`, `documentacion`, `epa`.
- Maintenance: `mantenimiento`.
- Services: `serviciosGenerales`, `pesajeTarimas`, `mrpTarimas`.
- Administration: `horasExtra`, `gestionUsuarios`.

`zoneFranca` and `zonaFranca` are legacy aliases for `pesajeTarimas`.

Visibility metadata lives in `src/config/workAreas.jsx`: `requiredPerm`, `anyPerms`, `allPerms`, roles/allowedRoles, admin/dev flags and `adminOverride`. Use these helpers instead of ad-hoc permission checks.

## Routes and modules

`src/App.jsx` owns routing. `src/config/workAreas.jsx` owns area/module navigation. Keep both and `src/config/routeAccess.js` synchronized.

Global:

- `/welcome`, `/`, `/areas`
- `/config-region`
- `/reportes` — permission-filtered report center.
- `/pesado` — pesaje shortcut.

Operational areas:

- Despacho: `/despacho`, `/in-progress`, `/finalizados`.
- Seguridad: control de marcas, aperturas, visados, documentación and `/seguridad/metricas`. Legacy `/salud/*` redirects here. `/salud-ocupacional` is still a coming-soon area.
- Recepción: `/recepcion/accion-descarga`, `/recepcion/metricas` (Reportes de Descarga) and `/recepcion/metricas-recepcion` (Reportes de Recepción over `accion_recepcion`).
- Mantenimiento: equipment and OTs, including `/mantenimiento/ots/dashboard` and detail routes.
- Servicios Generales: OTs, validar ingreso and pesaje.
- EPA: hub and final apertures.
- Administración/Horas Extra: users, approvals, manager validation, monthly report, coordinators and attendance marks.
- Dev: Supabase update and module configuration.

Directories with spaces still need quoting in shell commands: `src/pages/Zona Franca/`. The old `Salud Ocupacional` tree was replaced by `src/pages/SSO/Seguridad/`.

### MRP Tarimas

MRP routes are nested under `/mrp-tarimas`:

- `dashboard` — summary.
- `inventario` — stock per article/location, adjustments and transfers.
- `movimientos` — movement history.
- `descartes` — negative-adjustment records.
- `catalogos` — articles, supplies, BOMs and warehouses.

The workspace uses profile tenant/company and resolves its warehouse from the active `bodegaId` through `pallet_warehouses.bodega_id`; users no longer choose an arbitrary warehouse. Linking lives at `/dev/config-modulos/mrp-tarimas/entidades`; movement reasons at `/dev/config-modulos/mrp-tarimas/motivos`.

Critical MRP rules:

- Valid operational locations: `tienda`, `almacen`, `patio`, `reparacion`, `merma`, `pend`.
- Positive adjustments enter `pend`.
- Negative adjustments subtract from an operational origin and create a discard record.
- `merma` is operational stock and counts in totals; `descartes` is an administrative log, not a location.
- Transfers support location-to-location and cross-warehouse flows.
- Reasons are configurable for positive/negative adjustments, regular transfers and warehouse transfers.
- Articles are warehouse-specific; `mrp_insumos` and BOMs are tenant/company scoped.

MRP service boundaries:

- `src/services/mrp/` contains scope, catalogs, inventory and movement mutations.
- `src/hooks/mrp/` owns async UI integration and refresh buses.
- SQL migrations under `supabase/` define tables, RLS and RPCs. Preserve idempotency and tenant/company checks when changing RPCs.

## Assistant knowledge and actions

Sources:

- `docs/assistant-knowledge/appolo-knowledge.md` — human-readable functional source.
- `docs/assistant-knowledge/appolo-capabilities.json` — detailed retrieval units.
- `docs/assistant-knowledge/appolo-knowledge.json` — generated aggregate.
- `public/assistant-knowledge/appolo-knowledge.json` — public runtime copy.
- `docs/assistant-knowledge/assistant-system-prompt.md` — n8n/model contract.

After changing routes, permissions, modules or assistant actions, update the human/capability sources and run `npm run assistant:knowledge`. The sync script preserves access gates from work areas.

`AssistantModal.jsx` supports exactly two write-capable drafts:

- `create_ot_draft`: app validates the official OT catalogs and writes `solicitudesOT` only after user confirmation. Scope includes bodega fields.
- `mrp_transfer_draft`: app resolves article/location, validates stock and executes an intra-warehouse transfer only after confirmation.

n8n proposes; the frontend validates and writes. Do not add new action types without updating the UI, system prompt and both knowledge sources.

## Shared UI kit

Use `src/components/ui/` and barrel imports from `src/components/ui/index.js`. Tokens in `src/styles/theme.js` are the source of truth; do not introduce page-specific hardcoded brand colors.

Important primitives include Shell, Topbar, Brand, Main/Container, Hero, Card, ModuleCard/Grid, KPI components, buttons, badges/chips, fields, sheets, tables, empty/error/loading states, toast and confirm dialog.

Navigation surfaces include `AreasSidebar`, `CircleMenu`, `CommandPalette`, `PinsFlyout`, `BodegaSwitcher` and the assistant. Keep their filtering behavior consistent with workAreas/routeAccess.

## Data stores

Firestore additions to the prior model include `accion_recepcion` and the full `overtime*` set. `firestore.rules` contains duplicate/legacy match blocks in places; edit carefully and validate effective rule behavior, not just the nearest match.

MRP Supabase tables include:

- `pallet_warehouses`, `pallet_articulos`
- `pallet_inventory_articulo`, `pallet_movimientos_articulo`, `pallet_descartes_articulo`
- `pallet_motivos`, `pallet_external_consumptions`
- `mrp_insumos`, `mrp_boms`, `mrp_bom_insumos`

## Cloud Functions

`functions/index.js` exports:

- `sendEquipoQrLabel` — validates caller/profile/equipment scope and emails a QR label.
- `consumeTarimasFromExternalApp` — authenticated, permissioned, bodega-aware and idempotent external MRP consumption (`almacen` → `tienda`) via Supabase RPC.
- `testSqlConnection`
- `getOvertimeRecords`
- `decideOvertimeRecord`
- `getOvertimeCoordinators`
- `saveCoordinatorEmails`

All new functions must reload `profiles/{uid}` server-side, validate authorization and scope, and avoid trusting client-provided tenant/company/bodega.
