-- ============================================================================
-- Despachos Dev — lectura anónima (RLS) para la SPA AppoloDesk
-- ----------------------------------------------------------------------------
-- Contexto:
--   AppoloDesk (SPA) NO abre sesión de Supabase: la identidad vive en Firebase.
--   El cliente usa solo la anon key, por lo que las funciones dd_tenant_id()/
--   dd_company()/dd_bodega_id() (basadas en claims del JWT) no reciben scope y
--   las políticas pensadas para la app móvil OLOso devuelven 0 filas al anon.
--
--   Las tablas pallet_* (MRP Tarimas) ya permiten lectura anónima y la SPA hace
--   el filtrado de scope en el cliente. Esta migración alinea las tablas
--   despacho_dev_* con ese MISMO patrón: SELECT para los roles anon/authenticated.
--
-- Alcance y seguridad:
--   - SOLO lectura (SELECT). No se otorga INSERT/UPDATE/DELETE.
--   - NO elimina ni modifica políticas existentes (las del móvil siguen vigentes).
--     Postgres combina políticas permisivas con OR, así que esta se suma.
--   - Exposición equivalente a la que ya tienen las tablas pallet_* hoy:
--     cualquiera con la anon key pública podrá LEER estos datos. El filtrado por
--     tenant/company/bodega lo aplica la SPA en cliente (defensa en profundidad),
--     no la RLS. Si estos datos requieren confidencialidad estricta, usar en su
--     lugar una edge function / backend con service role (no esta migración).
--
-- Idempotente: puede ejecutarse varias veces sin error.
-- ============================================================================

begin;

-- Asegura que RLS esté habilitado (ya lo está; se deja explícito e idempotente).
alter table public.despacho_dev_estados   enable row level security;
alter table public.despacho_dev_despachos enable row level security;
alter table public.despacho_dev_choferes  enable row level security;
alter table public.despacho_dev_actividad enable row level security;
alter table public.despacho_dev_layout    enable row level security;

-- ── despacho_dev_estados ────────────────────────────────────────────────────
drop policy if exists "dd_estados_anon_select" on public.despacho_dev_estados;
create policy "dd_estados_anon_select"
  on public.despacho_dev_estados
  for select
  to anon, authenticated
  using (true);

-- ── despacho_dev_despachos ──────────────────────────────────────────────────
drop policy if exists "dd_despachos_anon_select" on public.despacho_dev_despachos;
create policy "dd_despachos_anon_select"
  on public.despacho_dev_despachos
  for select
  to anon, authenticated
  using (true);

-- ── despacho_dev_choferes ───────────────────────────────────────────────────
drop policy if exists "dd_choferes_anon_select" on public.despacho_dev_choferes;
create policy "dd_choferes_anon_select"
  on public.despacho_dev_choferes
  for select
  to anon, authenticated
  using (true);

-- ── despacho_dev_actividad ──────────────────────────────────────────────────
drop policy if exists "dd_actividad_anon_select" on public.despacho_dev_actividad;
create policy "dd_actividad_anon_select"
  on public.despacho_dev_actividad
  for select
  to anon, authenticated
  using (true);

-- ── despacho_dev_layout (acomodo del contenedor / grid de carga) ────────────
drop policy if exists "dd_layout_anon_select" on public.despacho_dev_layout;
create policy "dd_layout_anon_select"
  on public.despacho_dev_layout
  for select
  to anon, authenticated
  using (true);

commit;

-- ============================================================================
-- Verificación rápida (opcional):
--   set role anon;
--   select count(*) from public.despacho_dev_estados;    -- debe ser > 0
--   select count(*) from public.despacho_dev_despachos;  -- debe ser > 0
--   reset role;
-- ============================================================================
