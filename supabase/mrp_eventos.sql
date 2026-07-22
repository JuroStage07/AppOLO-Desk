-- ============================================================================
-- MRP Tarimas — Registro de eventos (mrp_eventos)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Bitácora de auditoría de los CATÁLOGOS: edición, activación, desactivación,
-- eliminación y ajustes de stock de insumos. Es independiente de
-- pallet_movimientos_articulo (que registra el stock de artículos por tarima).
--
--   entity_type: articulo | compania | cliente | insumo | bom | almacen
--   action:      create | update | activate | deactivate | delete | adjust
-- ============================================================================

create table if not exists mrp_eventos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  entity_type   text not null,
  entity_id     uuid,
  entity_codigo text,
  entity_nombre text,
  action        text not null,
  detail        text,
  user_id       text,
  user_email    text,
  created_at    timestamptz not null default now()
);

create index if not exists mrp_eventos_scope_idx
  on mrp_eventos (tenant_id, company, created_at desc);

-- RLS (scoping básico por tenant/company; lectura + insert directo desde cliente).
alter table mrp_eventos enable row level security;
drop policy if exists mrp_eventos_all on mrp_eventos;
create policy mrp_eventos_all on mrp_eventos
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- ----------------------------------------------------------------------------
-- TEARDOWN OPCIONAL:
-- drop table if exists mrp_eventos cascade;
-- ============================================================================
