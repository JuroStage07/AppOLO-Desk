-- ============================================================================
-- MRP Tarimas — Vínculo Cliente → Compañía (pallet_tiendas.cliente_id)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase DESPUÉS de mrp_pallets_tiendas.sql y
-- mrp_pallets_clientes.sql. NO DESTRUCTIVO e idempotente.
--
-- Terminología UI: "Clientes" == pallet_tiendas, "Compañías" == pallet_clientes.
-- Cada cliente se vincula a UNA compañía (columna nullable `cliente_id`, FK a
-- pallet_clientes) — misma lógica que pallet_articulos.cliente_id. Al crear el
-- mismo cliente para varias compañías, la UI crea una fila por compañía (código
-- TD#### distinto). Los clientes antiguos quedan con cliente_id NULL y el rol
-- `dev` los asigna desde Catálogos › Clientes.
-- ============================================================================

alter table pallet_tiendas
  add column if not exists cliente_id uuid references pallet_clientes(id);

create index if not exists pallet_tiendas_cliente_idx
  on pallet_tiendas (tenant_id, company, cliente_id);

-- Alta con código autogenerado correlativo (TD0001, …) + compañía opcional.
-- Se recrea la función para añadir `p_cliente_id` con DEFAULT NULL; las llamadas
-- existentes de 3 args siguen funcionando por el valor por defecto.
drop function if exists mrp_create_tienda(text, text, text);

create or replace function mrp_create_tienda(
  p_tenant_id  text,
  p_company    text,
  p_nombre     text,
  p_cliente_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
  v_code text;
  v_row  pallet_tiendas;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la tienda es obligatorio';
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|tiendas'));

  select coalesce(max((substring(codigo from 3))::int), 0) + 1
    into v_next
    from pallet_tiendas
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^TD[0-9]+$';

  v_code := 'TD' || lpad(v_next::text, 4, '0');

  insert into pallet_tiendas (tenant_id, company, codigo, nombre, cliente_id)
  values (p_tenant_id, p_company, v_code, btrim(p_nombre), p_cliente_id)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_tienda(text, text, text, uuid) to anon, authenticated;

-- ============================================================================
