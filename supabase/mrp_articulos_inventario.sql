-- ============================================================================
-- MRP Tarimas — Inventario por ARTÍCULO (reemplaza el modelo por marca+tipo)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- El inventario, ajustes, traslados, historial y descartes pasan a ser POR
-- ARTÍCULO + UBICACIÓN. El stock total del artículo (pallet_articulos.stock) se
-- mantiene como la suma de sus ubicaciones operativas (incluye merma).
--
-- Las tablas viejas (pallet_inventory / pallet_movements / pallet_discards por
-- marca+tipo) quedan SIN USO; puedes borrarlas con el teardown del final.
-- ============================================================================

-- Inventario por artículo y ubicación ---------------------------------------
create table if not exists pallet_inventory_articulo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  warehouse_id  uuid not null references pallet_warehouses(id),
  location      text not null
                  check (location in ('tienda','almacen','patio','reparacion','merma','pend')),
  store_id      uuid references pallet_stores(id),
  articulo_id   uuid not null references pallet_articulos(id),
  quantity      integer not null default 0 check (quantity >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pallet_inv_art_store_rule
    check (location <> 'tienda' or store_id is not null)
);

create unique index if not exists pallet_inv_art_uniq_nostore
  on pallet_inventory_articulo (tenant_id, company, warehouse_id, location, articulo_id)
  where store_id is null;
create unique index if not exists pallet_inv_art_uniq_store
  on pallet_inventory_articulo (tenant_id, company, warehouse_id, location, articulo_id, store_id)
  where store_id is not null;
create index if not exists pallet_inv_art_articulo_idx
  on pallet_inventory_articulo (tenant_id, company, articulo_id);
create index if not exists pallet_inv_art_location_idx
  on pallet_inventory_articulo (tenant_id, company, location);

drop trigger if exists trg_pallet_inv_art_updated on pallet_inventory_articulo;
create trigger trg_pallet_inv_art_updated before update on pallet_inventory_articulo
  for each row execute function mrp_set_updated_at();

-- Movimientos por artículo (historial) --------------------------------------
create table if not exists pallet_movimientos_articulo (
  id                    uuid primary key default gen_random_uuid(),
  movement_code         text not null unique,
  task_id               uuid,
  tenant_id             text not null,
  company               text not null,
  warehouse_id          uuid not null references pallet_warehouses(id),
  movement_type         text not null
                          check (movement_type in ('ajuste_positivo','ajuste_negativo','traslado')),
  origin_location       text check (origin_location in ('tienda','almacen','patio','reparacion','merma','pend')),
  destination_location  text check (destination_location in ('tienda','almacen','patio','reparacion','merma','pend')),
  origin_store_id       uuid references pallet_stores(id),
  destination_store_id  uuid references pallet_stores(id),
  articulo_id           uuid not null references pallet_articulos(id),
  quantity              integer not null check (quantity > 0),
  reason                text,
  user_id               text not null,
  user_email            text,
  metadata              jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists pallet_mov_art_scope_idx
  on pallet_movimientos_articulo (tenant_id, company, created_at desc);
create index if not exists pallet_mov_art_task_idx on pallet_movimientos_articulo (task_id);
create index if not exists pallet_mov_art_articulo_idx on pallet_movimientos_articulo (articulo_id);
create index if not exists pallet_mov_art_user_idx on pallet_movimientos_articulo (user_id);
create index if not exists pallet_mov_art_type_idx on pallet_movimientos_articulo (movement_type);

-- Descartes por artículo (registro administrativo) --------------------------
create table if not exists pallet_descartes_articulo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  warehouse_id  uuid not null references pallet_warehouses(id),
  articulo_id   uuid not null references pallet_articulos(id),
  quantity      integer not null check (quantity > 0),
  reason        text not null,
  movement_id   uuid not null references pallet_movimientos_articulo(id),
  user_id       text not null,
  user_email    text,
  created_at    timestamptz not null default now()
);

create index if not exists pallet_desc_art_scope_idx
  on pallet_descartes_articulo (tenant_id, company, created_at desc);
create index if not exists pallet_desc_art_articulo_idx on pallet_descartes_articulo (articulo_id);

-- ===========================================================================
-- FUNCIONES DE NEGOCIO (transaccionales) — por artículo
-- ===========================================================================

-- Helper: aplica delta de stock a una ubicación y mantiene el stock total del
-- artículo (suma de ubicaciones). Impide inventario negativo.
create or replace function mrp_apply_articulo_stock_delta(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_location     text,
  p_store_id     uuid,
  p_articulo_id  uuid,
  p_delta        integer
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_qty integer;
begin
  if p_location = 'tienda' and p_store_id is null then
    raise exception 'La ubicación tienda requiere store_id';
  end if;

  select id, quantity into v_id, v_qty
  from pallet_inventory_articulo
  where tenant_id = p_tenant_id and company = p_company
    and warehouse_id = p_warehouse_id and location = p_location
    and articulo_id = p_articulo_id
    and store_id is not distinct from p_store_id
  for update;

  if v_id is null then
    if p_delta < 0 then
      raise exception 'Stock insuficiente en %: no existe inventario para el artículo', p_location;
    end if;
    insert into pallet_inventory_articulo(tenant_id, company, warehouse_id, location, store_id, articulo_id, quantity)
    values (p_tenant_id, p_company, p_warehouse_id, p_location, p_store_id, p_articulo_id, p_delta);
  else
    if v_qty + p_delta < 0 then
      raise exception 'Stock insuficiente en %: disponible %, solicitado %', p_location, v_qty, -p_delta;
    end if;
    update pallet_inventory_articulo set quantity = v_qty + p_delta where id = v_id;
  end if;

  -- mantiene el stock total del artículo
  update pallet_articulos set stock = stock + p_delta where id = p_articulo_id;
end;
$$;

-- Ajuste positivo: ingresa a `pend`.
create or replace function mrp_articulo_ajuste_positivo(
  p_tenant_id text, p_company text, p_warehouse_id uuid, p_articulo_id uuid,
  p_quantity integer, p_reason text, p_user_id text, p_user_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El motivo es obligatorio'; end if;

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, 'pend', null, p_articulo_id, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, tenant_id, company, warehouse_id, movement_type,
                                          destination_location, articulo_id, quantity, reason, user_id, user_email)
  values (v_code, p_tenant_id, p_company, p_warehouse_id, 'ajuste_positivo',
          'pend', p_articulo_id, p_quantity, btrim(p_reason), p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'intake_location', 'pend');
end;
$$;

-- Ajuste negativo (descarte): descuenta de origin_location, registra descarte.
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

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, null, p_articulo_id, -p_quantity);

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

-- Traslado entre ubicaciones.
create or replace function mrp_articulo_transfer(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_origin_location text, p_destination_location text,
  p_origin_store_id uuid, p_destination_store_id uuid,
  p_articulo_id uuid, p_quantity integer, p_reason text,
  p_user_id text, p_user_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid; v_task uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_origin_location = 'tienda' and p_origin_store_id is null then raise exception 'Debe indicar la tienda origen'; end if;
  if p_destination_location = 'tienda' and p_destination_store_id is null then raise exception 'Debe indicar la tienda destino'; end if;
  if p_origin_location = p_destination_location
     and p_origin_store_id is not distinct from p_destination_store_id then
    raise exception 'El origen y el destino no pueden ser iguales'; end if;

  v_task := gen_random_uuid();

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, p_origin_store_id, p_articulo_id, -p_quantity);
  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_destination_location, p_destination_store_id, p_articulo_id, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
                                          origin_location, destination_location, origin_store_id, destination_store_id,
                                          articulo_id, quantity, reason, user_id, user_email)
  values (v_code, v_task, p_tenant_id, p_company, p_warehouse_id, 'traslado',
          p_origin_location, p_destination_location, p_origin_store_id, p_destination_store_id,
          p_articulo_id, p_quantity, nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'task_id', v_task);
end;
$$;

grant execute on function mrp_articulo_ajuste_positivo(text,text,uuid,uuid,integer,text,text,text) to anon, authenticated;
grant execute on function mrp_articulo_ajuste_negativo(text,text,uuid,uuid,integer,text,text,text,text) to anon, authenticated;
grant execute on function mrp_articulo_transfer(text,text,uuid,text,text,uuid,uuid,uuid,integer,text,text,text) to anon, authenticated;

-- RLS (lectura directa por tenant; escrituras vía RPC SECURITY DEFINER) ------
alter table pallet_inventory_articulo   enable row level security;
alter table pallet_movimientos_articulo enable row level security;
alter table pallet_descartes_articulo   enable row level security;

drop policy if exists pallet_inv_art_select on pallet_inventory_articulo;
create policy pallet_inv_art_select on pallet_inventory_articulo
  for select to anon, authenticated using (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_mov_art_select on pallet_movimientos_articulo;
create policy pallet_mov_art_select on pallet_movimientos_articulo
  for select to anon, authenticated using (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_desc_art_select on pallet_descartes_articulo;
create policy pallet_desc_art_select on pallet_descartes_articulo
  for select to anon, authenticated using (tenant_id = 'CR' and company = 'OLO');

-- ============================================================================
-- TEARDOWN OPCIONAL del modelo viejo por marca+tipo (no ejecutar a la ligera):
-- drop table if exists pallet_discards cascade;
-- drop table if exists pallet_movements cascade;
-- drop table if exists pallet_inventory cascade;
-- ============================================================================
