-- ============================================================================
-- MRP Tarimas — Vínculo Artículo → Cliente (pallet_articulos.cliente_id)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase DESPUÉS de mrp_pallets_clientes.sql.
-- NO DESTRUCTIVO e idempotente.
--
-- Cada artículo se asigna a UN cliente (columna nullable `cliente_id`). Cuando
-- en la UI se crea el mismo artículo para varios clientes, se crea una fila por
-- cliente (código correlativo distinto). Los artículos antiguos quedan con
-- cliente_id NULL y el rol `dev` los asigna desde la tabla de Catálogos.
-- ============================================================================

alter table pallet_articulos
  add column if not exists cliente_id uuid references pallet_clientes(id);

create index if not exists pallet_articulos_cliente_idx
  on pallet_articulos (tenant_id, company, cliente_id);

-- Alta con código autogenerado correlativo (A0000, A0001, …) + cliente opcional.
-- Se recrea la función para añadir `p_cliente_id` con DEFAULT NULL, de modo que
-- las llamadas existentes de 4 args (p.ej. mrp_articulo_warehouse_transfer)
-- siguen funcionando resolviéndose al valor por defecto.
drop function if exists mrp_create_articulo(text, text, uuid, text);

create or replace function mrp_create_articulo(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_nombre       text,
  p_cliente_id   uuid default null
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

  insert into pallet_articulos (tenant_id, company, warehouse_id, codigo, nombre, cliente_id)
  values (p_tenant_id, p_company, p_warehouse_id, v_code, btrim(p_nombre), p_cliente_id)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_articulo(text, text, uuid, text, uuid) to anon, authenticated;

-- ============================================================================
