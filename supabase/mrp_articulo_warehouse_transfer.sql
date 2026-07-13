-- ============================================================================
-- MRP Tarimas — Traslado de artículos (tarimas) ENTRE ALMACENES
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. Idempotente (create or replace).
--
-- Mueve una cantidad de un artículo desde el almacén de trabajo (origen) hacia
-- otro almacén (destino) del MISMO tenant/company, de forma transaccional.
--
-- Identidad del artículo entre almacenes:
--   `codigo` es único por tenant (unique (tenant_id, company, codigo)), así que el
--   mismo código NO puede existir en dos almacenes. El artículo destino se
--   resuelve por NOMBRE dentro del almacén destino; si no existe, se AUTO-CREA
--   (código correlativo nuevo, mismo nombre, stock 0) vía mrp_create_articulo.
--
-- Trazabilidad: se registran DOS movimientos 'traslado' enlazados por task_id
--   (uno de salida en el almacén origen, uno de entrada en el destino), con
--   metadata.cross_warehouse = true y el almacén/artículo contraparte.
-- ============================================================================

create or replace function mrp_articulo_warehouse_transfer(
  p_tenant_id          text,
  p_company            text,
  p_origin_warehouse_id uuid,
  p_dest_warehouse_id   uuid,
  p_articulo_id         uuid,
  p_origin_location     text,
  p_dest_location       text,
  p_quantity            integer,
  p_reason              text,
  p_user_id             text,
  p_user_email          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nombre    text;
  v_dest_art  uuid;
  v_created   boolean := false;
  v_new       jsonb;
  v_task      uuid;
  v_code_out  text;
  v_code_in   text;
  v_mid_out   uuid;
  v_mid_in    uuid;
  v_allowed   text[] := array['almacen','patio','reparacion','merma','pend'];
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;
  if p_origin_warehouse_id is null or p_dest_warehouse_id is null then
    raise exception 'Debe indicar el almacén de origen y destino';
  end if;
  if p_origin_warehouse_id = p_dest_warehouse_id then
    raise exception 'El almacén de origen y destino no pueden ser iguales';
  end if;
  if p_dest_location is null then p_dest_location := 'pend'; end if;
  if not (p_origin_location = any(v_allowed)) then
    raise exception 'Ubicación origen inválida para traslado entre almacenes: %', p_origin_location;
  end if;
  if not (p_dest_location = any(v_allowed)) then
    raise exception 'Ubicación destino inválida para traslado entre almacenes: %', p_dest_location;
  end if;

  -- El almacén destino debe pertenecer al mismo tenant/company.
  if not exists (
    select 1 from pallet_warehouses
    where id = p_dest_warehouse_id and tenant_id = p_tenant_id and company = p_company
  ) then
    raise exception 'El almacén destino no pertenece a este tenant/company';
  end if;

  -- Artículo origen (debe existir en el almacén de trabajo).
  select nombre into v_nombre
  from pallet_articulos
  where id = p_articulo_id and tenant_id = p_tenant_id and company = p_company
    and warehouse_id = p_origin_warehouse_id;
  if v_nombre is null then
    raise exception 'El artículo no existe en el almacén de origen';
  end if;

  -- Artículo destino: por nombre dentro del almacén destino; si no, auto-crear.
  select id into v_dest_art
  from pallet_articulos
  where tenant_id = p_tenant_id and company = p_company
    and warehouse_id = p_dest_warehouse_id
    and lower(btrim(nombre)) = lower(btrim(v_nombre))
    and active = true
  limit 1;

  if v_dest_art is null then
    v_new := mrp_create_articulo(p_tenant_id, p_company, p_dest_warehouse_id, v_nombre);
    v_dest_art := (v_new->>'id')::uuid;
    v_created := true;
  end if;

  v_task := gen_random_uuid();

  -- Movimiento de stock (transaccional; impide negativo en origen).
  perform mrp_apply_articulo_stock_delta(
    p_tenant_id, p_company, p_origin_warehouse_id, p_origin_location, p_articulo_id, -p_quantity);
  perform mrp_apply_articulo_stock_delta(
    p_tenant_id, p_company, p_dest_warehouse_id, p_dest_location, v_dest_art, p_quantity);

  -- Evento de SALIDA (almacén origen).
  v_code_out := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(
    movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
    origin_location, destination_location, articulo_id, quantity, reason,
    user_id, user_email, metadata)
  values (
    v_code_out, v_task, p_tenant_id, p_company, p_origin_warehouse_id, 'traslado',
    p_origin_location, p_dest_location, p_articulo_id, p_quantity,
    nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email,
    jsonb_build_object(
      'cross_warehouse', true, 'direction', 'out',
      'counterpart_warehouse_id', p_dest_warehouse_id,
      'counterpart_articulo_id', v_dest_art,
      'dest_articulo_created', v_created))
  returning id into v_mid_out;

  -- Evento de ENTRADA (almacén destino).
  v_code_in := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(
    movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
    origin_location, destination_location, articulo_id, quantity, reason,
    user_id, user_email, metadata)
  values (
    v_code_in, v_task, p_tenant_id, p_company, p_dest_warehouse_id, 'traslado',
    p_origin_location, p_dest_location, v_dest_art, p_quantity,
    nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email,
    jsonb_build_object(
      'cross_warehouse', true, 'direction', 'in',
      'counterpart_warehouse_id', p_origin_warehouse_id,
      'counterpart_articulo_id', p_articulo_id,
      'dest_articulo_created', v_created))
  returning id into v_mid_in;

  return jsonb_build_object(
    'task_id', v_task,
    'out_movement_id', v_mid_out, 'out_movement_code', v_code_out,
    'in_movement_id', v_mid_in, 'in_movement_code', v_code_in,
    'dest_articulo_id', v_dest_art, 'dest_created', v_created);
end;
$$;

grant execute on function mrp_articulo_warehouse_transfer(
  text, text, uuid, uuid, uuid, text, text, integer, text, text, text
) to anon, authenticated;
