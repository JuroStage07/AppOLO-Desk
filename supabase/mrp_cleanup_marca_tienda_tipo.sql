-- ============================================================================
-- MRP Tarimas — LIMPIEZA: eliminar marcas, tiendas y tipos
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. Idempotente.
--
-- Deja el módulo SOLO con: almacenes, artículos e inventario por artículo+ubicación.
-- - Quita la dimensión "tienda" del inventario/movimientos por artículo.
-- - Recrea las RPCs de artículo sin parámetros de tienda.
-- - BORRA tablas que ya no se usan: pallet_brands, pallet_stores y el modelo
--   viejo por marca+tipo (pallet_inventory, pallet_movements, pallet_discards).
--
-- ⚠️ DESTRUCTIVO para esas tablas: se pierden sus datos. Si quieres conservarlos,
--    expórtalos antes de ejecutar.
-- ============================================================================

/* 1) Quitar la dimensión tienda de las tablas de artículo -------------------*/
alter table pallet_inventory_articulo   drop constraint if exists pallet_inv_art_store_rule;
alter table pallet_inventory_articulo   drop column if exists store_id cascade;
alter table pallet_movimientos_articulo drop column if exists origin_store_id cascade;
alter table pallet_movimientos_articulo drop column if exists destination_store_id cascade;

-- Índice único de inventario sin tienda.
create unique index if not exists pallet_inv_art_uniq
  on pallet_inventory_articulo (tenant_id, company, warehouse_id, location, articulo_id);

/* 2) Recrear funciones de negocio sin tienda --------------------------------*/
drop function if exists mrp_articulo_transfer(text,text,uuid,text,text,uuid,uuid,uuid,integer,text,text,text);
drop function if exists mrp_apply_articulo_stock_delta(text,text,uuid,text,uuid,uuid,integer);

create or replace function mrp_apply_articulo_stock_delta(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_location text, p_articulo_id uuid, p_delta integer
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_qty integer;
begin
  select id, quantity into v_id, v_qty
  from pallet_inventory_articulo
  where tenant_id = p_tenant_id and company = p_company
    and warehouse_id = p_warehouse_id and location = p_location
    and articulo_id = p_articulo_id
  for update;

  if v_id is null then
    if p_delta < 0 then
      raise exception 'Stock insuficiente en %: no existe inventario para el artículo', p_location;
    end if;
    insert into pallet_inventory_articulo(tenant_id, company, warehouse_id, location, articulo_id, quantity)
    values (p_tenant_id, p_company, p_warehouse_id, p_location, p_articulo_id, p_delta);
  else
    if v_qty + p_delta < 0 then
      raise exception 'Stock insuficiente en %: disponible %, solicitado %', p_location, v_qty, -p_delta;
    end if;
    update pallet_inventory_articulo set quantity = v_qty + p_delta where id = v_id;
  end if;

  update pallet_articulos set stock = stock + p_delta where id = p_articulo_id;
end;
$$;

create or replace function mrp_articulo_ajuste_positivo(
  p_tenant_id text, p_company text, p_warehouse_id uuid, p_articulo_id uuid,
  p_quantity integer, p_reason text, p_user_id text, p_user_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El motivo es obligatorio'; end if;

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, 'pend', p_articulo_id, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, tenant_id, company, warehouse_id, movement_type,
                                          destination_location, articulo_id, quantity, reason, user_id, user_email)
  values (v_code, p_tenant_id, p_company, p_warehouse_id, 'ajuste_positivo',
          'pend', p_articulo_id, p_quantity, btrim(p_reason), p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'intake_location', 'pend');
end;
$$;

create or replace function mrp_articulo_ajuste_negativo(
  p_tenant_id text, p_company text, p_warehouse_id uuid, p_articulo_id uuid,
  p_quantity integer, p_reason text, p_origin_location text, p_user_id text, p_user_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid; v_did uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_origin_location is null then p_origin_location := 'pend'; end if;
  if p_origin_location = 'tienda' then raise exception 'El descarte no puede tener origen en una tienda'; end if;

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, p_articulo_id, -p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, tenant_id, company, warehouse_id, movement_type,
                                          origin_location, articulo_id, quantity, reason, user_id, user_email, metadata)
  values (v_code, p_tenant_id, p_company, p_warehouse_id, 'ajuste_negativo',
          p_origin_location, p_articulo_id, p_quantity, btrim(p_reason), p_user_id, p_user_email,
          jsonb_build_object('discard', true))
  returning id into v_mid;

  insert into pallet_descartes_articulo(tenant_id, company, warehouse_id, articulo_id, quantity, reason, movement_id, user_id, user_email)
  values (p_tenant_id, p_company, p_warehouse_id, p_articulo_id, p_quantity, btrim(p_reason), v_mid, p_user_id, p_user_email)
  returning id into v_did;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'discard_id', v_did);
end;
$$;

create or replace function mrp_articulo_transfer(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_origin_location text, p_destination_location text,
  p_articulo_id uuid, p_quantity integer, p_reason text,
  p_user_id text, p_user_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid; v_task uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_origin_location = p_destination_location then
    raise exception 'El origen y el destino no pueden ser iguales'; end if;

  v_task := gen_random_uuid();

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, p_articulo_id, -p_quantity);
  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_destination_location, p_articulo_id, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
                                          origin_location, destination_location, articulo_id, quantity, reason, user_id, user_email)
  values (v_code, v_task, p_tenant_id, p_company, p_warehouse_id, 'traslado',
          p_origin_location, p_destination_location, p_articulo_id, p_quantity,
          nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'task_id', v_task);
end;
$$;

grant execute on function mrp_articulo_ajuste_positivo(text,text,uuid,uuid,integer,text,text,text) to anon, authenticated;
grant execute on function mrp_articulo_ajuste_negativo(text,text,uuid,uuid,integer,text,text,text,text) to anon, authenticated;
grant execute on function mrp_articulo_transfer(text,text,uuid,text,text,uuid,integer,text,text,text) to anon, authenticated;

/* 3) BORRAR tablas y funciones que ya no se usan ----------------------------*/
-- Modelo viejo de tarimas por marca+tipo:
drop table if exists pallet_discards cascade;
drop table if exists pallet_movements cascade;
drop table if exists pallet_inventory cascade;
drop function if exists mrp_apply_stock_delta(text,text,uuid,text,uuid,uuid,text,integer);
drop function if exists mrp_positive_adjustment(text,text,uuid,uuid,text,integer,text,text,text);
drop function if exists mrp_negative_adjustment(text,text,uuid,uuid,text,integer,text,text,text,text);
drop function if exists mrp_transfer(text,text,uuid,text,text,uuid,uuid,uuid,text,integer,text,text,text);

-- Catálogos eliminados:
drop table if exists pallet_brands cascade;
drop table if exists pallet_stores cascade;
-- ============================================================================
