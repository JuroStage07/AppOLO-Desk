-- ============================================================================
-- MRP — Traslado entre almacenes con catálogo de artículos COMPARTIDO
-- ----------------------------------------------------------------------------
-- El catálogo de artículos ahora es por tenant/company (no por almacén). Un
-- artículo es una sola fila y puede tener inventario en varios almacenes.
--
-- Cambios vs. la versión anterior (SOLO la resolución del artículo):
--   1) El artículo de origen se valida por tenant/company (ya NO se exige que
--      su `warehouse_id` sea el almacén de origen).
--   2) El destino usa el MISMO `articulo_id` (ya NO se resuelve por nombre ni se
--      auto-crea un artículo en el almacén destino → sin duplicados).
--      Por lo tanto `dest_articulo_id = p_articulo_id` y `dest_created = false`.
--
-- Todo lo demás queda IDÉNTICO: validaciones, task, movement_code, movimientos
-- out/in, deltas de stock (mrp_apply_articulo_stock_delta), metadata y contrato
-- de retorno. Sigue siendo SECURITY DEFINER.
--
-- Idempotente (create or replace, misma firma).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mrp_articulo_warehouse_transfer(
  p_tenant_id text,
  p_company text,
  p_origin_warehouse_id uuid,
  p_dest_warehouse_id uuid,
  p_articulo_id uuid,
  p_origin_location text,
  p_dest_location text,
  p_quantity integer,
  p_reason text,
  p_user_id text,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_nombre    text;
  v_dest_art  uuid;
  v_created   boolean := false;
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

  -- Artículo (catálogo por tenant/company). Ya NO se exige warehouse_id de origen.
  select nombre into v_nombre
  from pallet_articulos
  where id = p_articulo_id and tenant_id = p_tenant_id and company = p_company;
  if v_nombre is null then
    raise exception 'El artículo no existe en este tenant/company';
  end if;

  -- Catálogo compartido: se usa el MISMO artículo en ambos almacenes.
  v_dest_art := p_articulo_id;
  v_created  := false;

  v_task := gen_random_uuid();

  -- Movimiento de stock (transaccional; impide negativo en origen).
  perform mrp_apply_articulo_stock_delta(
    p_tenant_id, p_company, p_origin_warehouse_id, p_origin_location, p_articulo_id, -p_quantity
  );
  perform mrp_apply_articulo_stock_delta(
    p_tenant_id, p_company, p_dest_warehouse_id, p_dest_location, v_dest_art, p_quantity
  );

  -- Evento de SALIDA (almacén origen).
  v_code_out := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(
    movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
    origin_location, destination_location, articulo_id, quantity, reason,
    user_id, user_email, metadata
  ) values (
    v_code_out, v_task, p_tenant_id, p_company, p_origin_warehouse_id, 'traslado',
    p_origin_location, p_dest_location, p_articulo_id, p_quantity,
    nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email,
    jsonb_build_object(
      'cross_warehouse', true, 'direction', 'out',
      'counterpart_warehouse_id', p_dest_warehouse_id,
      'counterpart_articulo_id', v_dest_art,
      'dest_articulo_created', v_created
    )
  ) returning id into v_mid_out;

  -- Evento de ENTRADA (almacén destino).
  v_code_in := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(
    movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
    origin_location, destination_location, articulo_id, quantity, reason,
    user_id, user_email, metadata
  ) values (
    v_code_in, v_task, p_tenant_id, p_company, p_dest_warehouse_id, 'traslado',
    p_origin_location, p_dest_location, v_dest_art, p_quantity,
    nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email,
    jsonb_build_object(
      'cross_warehouse', true, 'direction', 'in',
      'counterpart_warehouse_id', p_origin_warehouse_id,
      'counterpart_articulo_id', p_articulo_id,
      'dest_articulo_created', v_created
    )
  ) returning id into v_mid_in;

  return jsonb_build_object(
    'task_id', v_task,
    'out_movement_id', v_mid_out, 'out_movement_code', v_code_out,
    'in_movement_id', v_mid_in, 'in_movement_code', v_code_in,
    'dest_articulo_id', v_dest_art, 'dest_created', v_created
  );
end;
$function$;
