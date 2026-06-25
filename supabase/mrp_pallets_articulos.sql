-- ============================================================================
-- MRP Tarimas — Artículos (pallet_articulos)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Cada artículo pertenece a un almacén. El código se genera automáticamente
-- como 'A' + 4 dígitos correlativos por tenant/company (A0000, A0001, …) en una
-- función SECURITY DEFINER con advisory lock para evitar duplicados concurrentes.
-- ============================================================================

create table if not exists pallet_articulos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  company      text not null,
  warehouse_id uuid references pallet_warehouses(id),
  codigo       text not null,
  nombre       text not null,
  stock        integer not null default 0 check (stock >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, company, codigo)
);

-- stock: cada artículo tiene su existencia (arranca en 0). Idempotente para
-- tablas creadas antes de esta columna.
alter table pallet_articulos
  add column if not exists stock integer not null default 0;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pallet_articulos_stock_check'
  ) then
    alter table pallet_articulos
      add constraint pallet_articulos_stock_check check (stock >= 0);
  end if;
end $$;

create index if not exists pallet_articulos_scope_idx
  on pallet_articulos (tenant_id, company);
create index if not exists pallet_articulos_warehouse_idx
  on pallet_articulos (tenant_id, company, warehouse_id);

-- Trigger updated_at (reutiliza la función del esquema base).
drop trigger if exists trg_pallet_articulos_updated on pallet_articulos;
create trigger trg_pallet_articulos_updated before update on pallet_articulos
  for each row execute function mrp_set_updated_at();

-- Alta con código autogenerado correlativo (A0000, A0001, …).
create or replace function mrp_create_articulo(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_nombre       text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
  v_code text;
  v_row  pallet_articulos;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del artículo es obligatorio';
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|articulos'));

  select coalesce(max((substring(codigo from 2))::int), -1) + 1
    into v_next
    from pallet_articulos
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^A[0-9]+$';

  v_code := 'A' || lpad(v_next::text, 4, '0');

  insert into pallet_articulos (tenant_id, company, warehouse_id, codigo, nombre)
  values (p_tenant_id, p_company, p_warehouse_id, v_code, btrim(p_nombre))
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_articulo(text, text, uuid, text) to anon, authenticated;

-- RLS (scoping básico por tenant/company; lectura + update directo, inserts vía RPC).
alter table pallet_articulos enable row level security;
drop policy if exists pallet_articulos_all on pallet_articulos;
create policy pallet_articulos_all on pallet_articulos
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- ----------------------------------------------------------------------------
-- TEARDOWN OPCIONAL (no ejecutar salvo que quieras borrar artículos):
-- drop function if exists mrp_create_articulo(text,text,uuid,text);
-- drop table if exists pallet_articulos cascade;
-- ============================================================================
