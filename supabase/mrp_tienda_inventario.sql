-- ============================================================================
-- MRP Tarimas — Inventario por TIENDA en la ubicación `tienda`
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Reintroduce la dimensión "tienda" (store_id) en el inventario por artículo,
-- PERO SOLO para la ubicación `tienda`. En cualquier otra ubicación el
-- inventario sigue siendo una fila por (almacén, ubicación, artículo) con
-- store_id = NULL (comportamiento actual, no cambia).
--
-- Objetivo: mantener SALDOS EXACTOS por tienda para poder ver el inventario
-- "En tienda" como un pivote artículo × tienda.
--
-- Reglas:
--   • store_id es NULL para todas las ubicaciones distintas de `tienda`.
--   • En `tienda`, cada tienda destino tiene su propia fila (store_id no nulo).
--   • Los traslados hacia/desde `tienda` que NO indican tienda (p. ej. la app
--     externa) caen en la fila store_id = NULL de `tienda` ("Sin asignar").
--   • La obligatoriedad de la tienda se aplica en la UI (TrasladoModal); la RPC
--     la deja OPCIONAL para no romper al consumidor externo.
-- ============================================================================

/* 1) Columna store_id + FK a pallet_tiendas --------------------------------- */
alter table pallet_inventory_articulo
  add column if not exists store_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pallet_inv_art_store_fk'
  ) then
    alter table pallet_inventory_articulo
      add constraint pallet_inv_art_store_fk
      foreign key (store_id) references pallet_tiendas (id);
  end if;
end $$;

/* 2) Índices únicos: uno para filas sin tienda y otro para filas con tienda -- */
-- Se elimina el índice único plano introducido por la limpieza y se recrean los
-- dos índices parciales (idempotente).
drop index if exists pallet_inv_art_uniq;

create unique index if not exists pallet_inv_art_uniq_nostore
  on pallet_inventory_articulo (tenant_id, company, warehouse_id, location, articulo_id)
  where store_id is null;

create unique index if not exists pallet_inv_art_uniq_store
  on pallet_inventory_articulo (tenant_id, company, warehouse_id, location, articulo_id, store_id)
  where store_id is not null;

create index if not exists pallet_inv_art_store_idx
  on pallet_inventory_articulo (tenant_id, company, store_id)
  where store_id is not null;

/* 3) Delta de stock con dimensión tienda ------------------------------------ */
-- Se recrea añadiendo `p_store_id` (DEFAULT NULL) al final. Las llamadas de 6
-- args existentes (ajustes y el lado no-tienda del traslado) siguen resolviendo
-- por el valor por defecto. `store_id` solo aplica a la ubicación `tienda`.
drop function if exists mrp_apply_articulo_stock_delta(text,text,uuid,text,uuid,integer);

create or replace function mrp_apply_articulo_stock_delta(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_location text, p_articulo_id uuid, p_delta integer,
  p_store_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_qty integer;
begin
  -- store_id solo es válido en `tienda`; en otras ubicaciones se fuerza NULL.
  if p_location <> 'tienda' then p_store_id := null; end if;

  if p_store_id is null then
    select id, quantity into v_id, v_qty
    from pallet_inventory_articulo
    where tenant_id = p_tenant_id and company = p_company
      and warehouse_id = p_warehouse_id and location = p_location
      and articulo_id = p_articulo_id and store_id is null
    for update;
  else
    select id, quantity into v_id, v_qty
    from pallet_inventory_articulo
    where tenant_id = p_tenant_id and company = p_company
      and warehouse_id = p_warehouse_id and location = p_location
      and articulo_id = p_articulo_id and store_id = p_store_id
    for update;
  end if;

  if v_id is null then
    if p_delta < 0 then
      raise exception 'Stock insuficiente en %: no existe inventario para el artículo', p_location;
    end if;
    insert into pallet_inventory_articulo(tenant_id, company, warehouse_id, location, articulo_id, quantity, store_id)
    values (p_tenant_id, p_company, p_warehouse_id, p_location, p_articulo_id, p_delta, p_store_id);
  else
    if v_qty + p_delta < 0 then
      raise exception 'Stock insuficiente en %: disponible %, solicitado %', p_location, v_qty, -p_delta;
    end if;
    update pallet_inventory_articulo set quantity = v_qty + p_delta where id = v_id;
  end if;

  update pallet_articulos set stock = stock + p_delta where id = p_articulo_id;
end;
$$;

/* 4) Traslado: enruta la tienda al lado que sea `tienda` --------------------- */
drop function if exists mrp_articulo_transfer(
  text, text, uuid, text, text, uuid, integer, text, text, text, uuid
);

create or replace function mrp_articulo_transfer(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_origin_location text, p_destination_location text,
  p_articulo_id uuid, p_quantity integer, p_reason text,
  p_user_id text, p_user_email text,
  p_tienda_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_mid uuid;
  v_task uuid;
  v_meta jsonb := null;
  v_origin_store uuid := null;
  v_dest_store uuid := null;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_origin_location = p_destination_location then
    raise exception 'El origen y el destino no pueden ser iguales'; end if;

  v_task := gen_random_uuid();

  -- La tienda (si se indica) aplica al lado cuya ubicación es `tienda`.
  if p_tienda_id is not null then
    if p_destination_location = 'tienda' then v_dest_store := p_tienda_id; end if;
    if p_origin_location = 'tienda' then v_origin_store := p_tienda_id; end if;
    v_meta := jsonb_build_object(
      'tienda_id', p_tienda_id,
      'tienda_nombre', (select nombre from pallet_tiendas t where t.id = p_tienda_id)
    );
  end if;

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, p_articulo_id, -p_quantity, v_origin_store);
  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_destination_location, p_articulo_id, p_quantity, v_dest_store);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
                                          origin_location, destination_location, articulo_id, quantity, reason, user_id, user_email, metadata)
  values (v_code, v_task, p_tenant_id, p_company, p_warehouse_id, 'traslado',
          p_origin_location, p_destination_location, p_articulo_id, p_quantity,
          nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email, v_meta)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'task_id', v_task);
end;
$$;

grant execute on function mrp_articulo_transfer(text,text,uuid,text,text,uuid,integer,text,text,text,uuid) to anon, authenticated;

-- ============================================================================
-- OPCIONAL — BACKFILL de saldos por tienda desde el historial
-- ----------------------------------------------------------------------------
-- Estado tras los pasos 1-4: el stock que YA estaba en `tienda` queda en la
-- fila store_id = NULL ("Sin asignar"); los traslados NUEVOS sí quedan por
-- tienda. Si quieres repartir el stock actual entre tiendas usando el historial
-- (suma de traslados con destino `tienda` menos salidas de `tienda`, ambos con
-- tienda sellada en metadata), REVISA y ejecuta el bloque de abajo.
--
-- Es idempotente (parte del total actual y lo reparte; correrlo dos veces da el
-- mismo resultado). El remanente no atribuible permanece en "Sin asignar".
--
-- ⚠️ Modifica cantidades reales de inventario. Revisa los resultados antes de
--    darlo por bueno. Descomenta para ejecutar.
-- ============================================================================
-- do $$
-- declare
--   g record;   -- (warehouse_id, articulo_id)
--   s record;   -- neto histórico por tienda
--   v_total integer;
--   v_hsum  integer;
--   v_assigned integer;
--   v_qty integer;
-- begin
--   for g in
--     select warehouse_id, articulo_id, sum(quantity) as total
--     from pallet_inventory_articulo
--     where location = 'tienda'
--     group by warehouse_id, articulo_id
--     having sum(quantity) > 0
--   loop
--     v_total := g.total;
--     -- Neto histórico por tienda para este (almacén, artículo).
--     select coalesce(sum(net), 0) into v_hsum from (
--       select (m.metadata->>'tienda_id')::uuid as store_id,
--              sum(case when m.destination_location = 'tienda' then m.quantity
--                       when m.origin_location = 'tienda' then -m.quantity
--                       else 0 end) as net
--       from pallet_movimientos_articulo m
--       where m.warehouse_id = g.warehouse_id
--         and m.articulo_id = g.articulo_id
--         and m.metadata ? 'tienda_id'
--       group by 1
--     ) t where net > 0;
--
--     -- Limpia filas por tienda previas de este (almacén, artículo) para recalcular.
--     delete from pallet_inventory_articulo
--       where warehouse_id = g.warehouse_id and articulo_id = g.articulo_id
--         and location = 'tienda' and store_id is not null;
--
--     v_assigned := 0;
--     if v_hsum > 0 then
--       for s in
--         select (m.metadata->>'tienda_id')::uuid as store_id,
--                sum(case when m.destination_location = 'tienda' then m.quantity
--                         when m.origin_location = 'tienda' then -m.quantity
--                         else 0 end) as net
--         from pallet_movimientos_articulo m
--         where m.warehouse_id = g.warehouse_id
--           and m.articulo_id = g.articulo_id
--           and m.metadata ? 'tienda_id'
--         group by 1
--         having sum(case when m.destination_location = 'tienda' then m.quantity
--                         when m.origin_location = 'tienda' then -m.quantity
--                         else 0 end) > 0
--       loop
--         -- Reparte proporcional al neto histórico, sin exceder el total actual.
--         v_qty := floor(s.net::numeric * least(v_total, v_hsum) / v_hsum);
--         if v_qty > 0 then
--           insert into pallet_inventory_articulo(
--             tenant_id, company, warehouse_id, location, articulo_id, quantity, store_id)
--           select tenant_id, company, g.warehouse_id, 'tienda', g.articulo_id, v_qty, s.store_id
--           from pallet_inventory_articulo
--           where warehouse_id = g.warehouse_id and articulo_id = g.articulo_id and location = 'tienda'
--           limit 1;
--           v_assigned := v_assigned + v_qty;
--         end if;
--       end loop;
--     end if;
--
--     -- El remanente queda en "Sin asignar" (store_id = null).
--     update pallet_inventory_articulo
--       set quantity = greatest(0, v_total - v_assigned)
--       where warehouse_id = g.warehouse_id and articulo_id = g.articulo_id
--         and location = 'tienda' and store_id is null;
--   end loop;
-- end $$;
-- ============================================================================
