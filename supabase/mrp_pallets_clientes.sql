-- ============================================================================
-- MRP Tarimas — Clientes (pallet_clientes)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Un cliente pertenece al tenant/company (NO a un almacén). El código se genera
-- automáticamente como 'CL' + 4 dígitos correlativos por tenant/company
-- (CL0001, CL0002, …) en una función SECURITY DEFINER con advisory lock para
-- evitar duplicados concurrentes.
-- ============================================================================

create table if not exists pallet_clientes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null,
  company    text not null,
  codigo     text not null,
  nombre     text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, company, codigo)
);

create index if not exists pallet_clientes_scope_idx
  on pallet_clientes (tenant_id, company);

-- Trigger updated_at (reutiliza la función del esquema base).
drop trigger if exists trg_pallet_clientes_updated on pallet_clientes;
create trigger trg_pallet_clientes_updated before update on pallet_clientes
  for each row execute function mrp_set_updated_at();

-- Alta con código autogenerado correlativo (CL0001, CL0002, …).
create or replace function mrp_create_cliente(
  p_tenant_id text,
  p_company   text,
  p_nombre    text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
  v_code text;
  v_row  pallet_clientes;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del cliente es obligatorio';
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|clientes'));

  select coalesce(max((substring(codigo from 3))::int), 0) + 1
    into v_next
    from pallet_clientes
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^CL[0-9]+$';

  v_code := 'CL' || lpad(v_next::text, 4, '0');

  insert into pallet_clientes (tenant_id, company, codigo, nombre)
  values (p_tenant_id, p_company, v_code, btrim(p_nombre))
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_cliente(text, text, text) to anon, authenticated;

-- RLS (scoping básico por tenant/company; lectura + update directo, inserts vía RPC).
alter table pallet_clientes enable row level security;
drop policy if exists pallet_clientes_all on pallet_clientes;
create policy pallet_clientes_all on pallet_clientes
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- ----------------------------------------------------------------------------
-- TEARDOWN OPCIONAL (no ejecutar salvo que quieras borrar clientes):
-- drop function if exists mrp_create_cliente(text,text,text);
-- drop table if exists pallet_clientes cascade;
-- ============================================================================
