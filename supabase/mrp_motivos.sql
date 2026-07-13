-- ============================================================================
-- MRP Tarimas — Catálogo de MOTIVOS por tipo de movimiento
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. Idempotente.
--
-- Los motivos que se muestran en los modales de Ajuste y Traslado dejan de ser
-- una constante fija y se configuran en /dev/config-modulos/mrp-tarimas/motivos.
-- `tipo` distingue el catálogo según el movimiento:
--   ajuste_positivo | ajuste_negativo | traslado | traslado_almacen
-- ============================================================================

create table if not exists pallet_motivos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  company     text not null,
  tipo        text not null
                check (tipo in ('ajuste_positivo','ajuste_negativo','traslado','traslado_almacen')),
  label       text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, company, tipo, label)
);

create index if not exists pallet_motivos_scope_idx
  on pallet_motivos (tenant_id, company, tipo, active);

drop trigger if exists trg_pallet_motivos_updated on pallet_motivos;
create trigger trg_pallet_motivos_updated before update on pallet_motivos
  for each row execute function mrp_set_updated_at();

alter table pallet_motivos enable row level security;
drop policy if exists pallet_motivos_all on pallet_motivos;
create policy pallet_motivos_all on pallet_motivos
  for all to anon, authenticated
  using (company = 'OLO')
  with check (company = 'OLO');

-- Seed: motivos por defecto (los que había fijos) para no dejar los modales
-- vacíos tras la migración. No pisa datos existentes.
insert into pallet_motivos (tenant_id, company, tipo, label, sort_order)
select 'CR', 'OLO', t.tipo, m.label, m.ord
from (values
  ('ajuste_positivo'), ('ajuste_negativo'), ('traslado'), ('traslado_almacen')
) as t(tipo)
cross join (values ('Ingreso', 0), ('Devolución', 1)) as m(label, ord)
on conflict (tenant_id, company, tipo, label) do nothing;
