-- ============================================================================
-- MRP Tarimas — esquema Supabase (Fase 1)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase del proyecto.
--
-- NO DESTRUCTIVO: usa CREATE ... IF NOT EXISTS y CREATE OR REPLACE. No hay
-- DROP ni TRUNCATE. (Un teardown opcional queda comentado al final; NO ejecutar
-- salvo que se quiera borrar TODO el módulo.)
--
-- REGLA DE NEGOCIO CRÍTICA:
--   * `merma` es una UBICACIÓN OPERATIVA -> su stock cuenta en el global por marca.
--   * `descartes` (pallet_discards) es un REGISTRO ADMINISTRATIVO de ajustes
--     negativos. Los ajustes negativos descuentan stock de una ubicación origen
--     operativa (por defecto `pend`) y se registran en pallet_discards.
--     NUNCA crean stock en `merma` ni en ninguna ubicación operativa.
--
-- Seguridad: la app usa la ANON KEY con auth de Firebase (Supabase no conoce al
-- usuario). El gating por usuario/permiso vive en el cliente. RLS aquí da
-- scoping básico por tenant/company. Las escrituras de inventario/movimientos
-- pasan por funciones SECURITY DEFINER que garantizan atomicidad.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Secuencia y helper para el código legible de movimiento (MOV-YYYYMMDD-000001)
-- ---------------------------------------------------------------------------
create sequence if not exists mrp_movement_code_seq;

create or replace function mrp_next_movement_code()
returns text language sql as $$
  select 'MOV-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
         lpad(nextval('mrp_movement_code_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- Trigger genérico de updated_at
-- ---------------------------------------------------------------------------
create or replace function mrp_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- TABLAS
-- ===========================================================================

-- Marcas -------------------------------------------------------------------
-- Cada marca pertenece a UN almacén. La FK y la unicidad por almacén se
-- agregan tras crear pallet_warehouses (ver abajo), porque esta tabla se
-- declara antes que la de almacenes.
create table if not exists pallet_brands (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  company      text not null,
  warehouse_id uuid,
  name         text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Tiendas ------------------------------------------------------------------
-- Cada tienda pertenece a UN almacén (FK + unicidad por almacén se agregan
-- tras crear pallet_warehouses, más abajo).
create table if not exists pallet_stores (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  warehouse_id  uuid,
  store_number  text not null,
  name          text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Almacenes ----------------------------------------------------------------
create table if not exists pallet_warehouses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  company     text not null,
  name        text not null,
  code        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, company, name)
);

-- Marcas: FK + unicidad por almacén (pallet_warehouses ya existe aquí).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pallet_brands_warehouse_fk'
  ) then
    alter table pallet_brands
      add constraint pallet_brands_warehouse_fk
      foreign key (warehouse_id) references pallet_warehouses(id);
  end if;
end $$;

create unique index if not exists pallet_brands_uniq_wh_name
  on pallet_brands (tenant_id, company, warehouse_id, name);
create index if not exists pallet_brands_warehouse_idx
  on pallet_brands (tenant_id, company, warehouse_id);

-- Tiendas: FK + unicidad por almacén.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pallet_stores_warehouse_fk'
  ) then
    alter table pallet_stores
      add constraint pallet_stores_warehouse_fk
      foreign key (warehouse_id) references pallet_warehouses(id);
  end if;
end $$;

create unique index if not exists pallet_stores_uniq_wh_number
  on pallet_stores (tenant_id, company, warehouse_id, store_number);
create index if not exists pallet_stores_warehouse_idx
  on pallet_stores (tenant_id, company, warehouse_id);

-- Inventario (saldo agregado por combinación) ------------------------------
create table if not exists pallet_inventory (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  warehouse_id  uuid not null references pallet_warehouses(id),
  location      text not null
                  check (location in ('tienda','almacen','patio','reparacion','merma','pend')),
  store_id      uuid references pallet_stores(id),
  brand_id      uuid not null references pallet_brands(id),
  pallet_type   text not null check (pallet_type in ('sencilla','doble')),
  quantity      integer not null default 0 check (quantity >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- si la ubicación es tienda, store_id es obligatorio
  constraint pallet_inventory_store_rule
    check (location <> 'tienda' or store_id is not null)
);

-- Unicidad de la combinación (store_id nullable -> dos índices parciales).
create unique index if not exists pallet_inventory_uniq_nostore
  on pallet_inventory (tenant_id, company, warehouse_id, location, brand_id, pallet_type)
  where store_id is null;

create unique index if not exists pallet_inventory_uniq_store
  on pallet_inventory (tenant_id, company, warehouse_id, location, brand_id, pallet_type, store_id)
  where store_id is not null;

create index if not exists pallet_inventory_brand_idx
  on pallet_inventory (tenant_id, company, brand_id);
create index if not exists pallet_inventory_location_idx
  on pallet_inventory (tenant_id, company, location);

-- Movimientos (historial inmutable, append-only) ---------------------------
create table if not exists pallet_movements (
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
  brand_id              uuid not null references pallet_brands(id),
  pallet_type           text not null check (pallet_type in ('sencilla','doble')),
  quantity              integer not null check (quantity > 0),
  reason                text,
  user_id               text not null,
  user_email            text,
  metadata              jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists pallet_movements_scope_idx
  on pallet_movements (tenant_id, company, created_at desc);
create index if not exists pallet_movements_task_idx on pallet_movements (task_id);
create index if not exists pallet_movements_brand_idx on pallet_movements (brand_id);
create index if not exists pallet_movements_user_idx on pallet_movements (user_id);
create index if not exists pallet_movements_type_idx on pallet_movements (movement_type);

-- Descartes (registro administrativo de ajustes negativos) -----------------
create table if not exists pallet_discards (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  company       text not null,
  warehouse_id  uuid not null references pallet_warehouses(id),
  brand_id      uuid not null references pallet_brands(id),
  pallet_type   text not null check (pallet_type in ('sencilla','doble')),
  quantity      integer not null check (quantity > 0),
  reason        text not null,
  movement_id   uuid not null references pallet_movements(id),
  user_id       text not null,
  user_email    text,
  created_at    timestamptz not null default now()
);

create index if not exists pallet_discards_scope_idx
  on pallet_discards (tenant_id, company, created_at desc);
create index if not exists pallet_discards_brand_idx on pallet_discards (brand_id);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_pallet_brands_updated on pallet_brands;
create trigger trg_pallet_brands_updated before update on pallet_brands
  for each row execute function mrp_set_updated_at();

drop trigger if exists trg_pallet_stores_updated on pallet_stores;
create trigger trg_pallet_stores_updated before update on pallet_stores
  for each row execute function mrp_set_updated_at();

drop trigger if exists trg_pallet_warehouses_updated on pallet_warehouses;
create trigger trg_pallet_warehouses_updated before update on pallet_warehouses
  for each row execute function mrp_set_updated_at();

drop trigger if exists trg_pallet_inventory_updated on pallet_inventory;
create trigger trg_pallet_inventory_updated before update on pallet_inventory
  for each row execute function mrp_set_updated_at();

-- ===========================================================================
-- FUNCIONES DE NEGOCIO (transaccionales)
-- ===========================================================================

-- Helper interno: aplica un delta de stock a una ubicación de forma atómica,
-- bloqueando la fila. Impide inventario negativo. store_id null-safe.
create or replace function mrp_apply_stock_delta(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_location     text,
  p_store_id     uuid,
  p_brand_id     uuid,
  p_pallet_type  text,
  p_delta        integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id  uuid;
  v_qty integer;
begin
  if p_location = 'tienda' and p_store_id is null then
    raise exception 'La ubicación tienda requiere store_id';
  end if;

  select id, quantity into v_id, v_qty
  from pallet_inventory
  where tenant_id = p_tenant_id and company = p_company
    and warehouse_id = p_warehouse_id and location = p_location
    and brand_id = p_brand_id and pallet_type = p_pallet_type
    and store_id is not distinct from p_store_id
  for update;

  if v_id is null then
    if p_delta < 0 then
      raise exception 'Stock insuficiente en %: no existe inventario para esa combinación', p_location;
    end if;
    insert into pallet_inventory(tenant_id, company, warehouse_id, location, store_id, brand_id, pallet_type, quantity)
    values (p_tenant_id, p_company, p_warehouse_id, p_location, p_store_id, p_brand_id, p_pallet_type, p_delta);
  else
    if v_qty + p_delta < 0 then
      raise exception 'Stock insuficiente en %: disponible %, solicitado %', p_location, v_qty, -p_delta;
    end if;
    update pallet_inventory set quantity = v_qty + p_delta where id = v_id;
  end if;
end;
$$;

-- Ajuste positivo: ingresa tarimas a `pend` + movimiento ajuste_positivo.
create or replace function mrp_positive_adjustment(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_brand_id     uuid,
  p_pallet_type  text,
  p_quantity     integer,
  p_reason       text,
  p_user_id      text,
  p_user_email   text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El motivo es obligatorio'; end if;

  perform mrp_apply_stock_delta(p_tenant_id, p_company, p_warehouse_id, 'pend', null,
                                p_brand_id, p_pallet_type, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movements(movement_code, tenant_id, company, warehouse_id, movement_type,
                               destination_location, brand_id, pallet_type, quantity, reason,
                               user_id, user_email)
  values (v_code, p_tenant_id, p_company, p_warehouse_id, 'ajuste_positivo',
          'pend', p_brand_id, p_pallet_type, p_quantity, btrim(p_reason),
          p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'intake_location', 'pend');
end;
$$;

-- Ajuste negativo (descarte): descuenta de la ubicación origen operativa,
-- registra en pallet_discards y crea movimiento ajuste_negativo.
-- NUNCA toca `merma` como destino ni crea stock operativo.
create or replace function mrp_negative_adjustment(
  p_tenant_id       text,
  p_company         text,
  p_warehouse_id    uuid,
  p_brand_id        uuid,
  p_pallet_type     text,
  p_quantity        integer,
  p_reason          text,
  p_origin_location text,
  p_user_id         text,
  p_user_email      text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid; v_did uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_origin_location is null then p_origin_location := 'pend'; end if;
  if p_origin_location = 'tienda' then raise exception 'El descarte no puede tener origen en una tienda'; end if;
  if p_origin_location not in ('almacen','patio','reparacion','merma','pend') then
    raise exception 'Ubicación origen inválida para descarte: %', p_origin_location;
  end if;

  -- Descuenta del inventario operativo (impide negativo). No crea stock en merma.
  perform mrp_apply_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, null,
                                p_brand_id, p_pallet_type, -p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movements(movement_code, tenant_id, company, warehouse_id, movement_type,
                               origin_location, brand_id, pallet_type, quantity, reason,
                               user_id, user_email, metadata)
  values (v_code, p_tenant_id, p_company, p_warehouse_id, 'ajuste_negativo',
          p_origin_location, p_brand_id, p_pallet_type, p_quantity, btrim(p_reason),
          p_user_id, p_user_email, jsonb_build_object('discard', true))
  returning id into v_mid;

  insert into pallet_discards(tenant_id, company, warehouse_id, brand_id, pallet_type, quantity,
                              reason, movement_id, user_id, user_email)
  values (p_tenant_id, p_company, p_warehouse_id, p_brand_id, p_pallet_type, p_quantity,
          btrim(p_reason), v_mid, p_user_id, p_user_email)
  returning id into v_did;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'discard_id', v_did);
end;
$$;

-- Traslado: descuenta de origen, suma a destino, valida stock, crea task_id.
create or replace function mrp_transfer(
  p_tenant_id            text,
  p_company              text,
  p_warehouse_id         uuid,
  p_origin_location      text,
  p_destination_location text,
  p_origin_store_id      uuid,
  p_destination_store_id uuid,
  p_brand_id             uuid,
  p_pallet_type          text,
  p_quantity             integer,
  p_reason               text,
  p_user_id              text,
  p_user_email           text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_mid uuid; v_task uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_origin_location = 'tienda' and p_origin_store_id is null then
    raise exception 'Debe indicar la tienda origen'; end if;
  if p_destination_location = 'tienda' and p_destination_store_id is null then
    raise exception 'Debe indicar la tienda destino'; end if;
  if p_origin_location = p_destination_location
     and p_origin_store_id is not distinct from p_destination_store_id then
    raise exception 'El origen y el destino no pueden ser iguales'; end if;

  v_task := gen_random_uuid();

  perform mrp_apply_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location,
                                p_origin_store_id, p_brand_id, p_pallet_type, -p_quantity);
  perform mrp_apply_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_destination_location,
                                p_destination_store_id, p_brand_id, p_pallet_type, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movements(movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
                               origin_location, destination_location, origin_store_id, destination_store_id,
                               brand_id, pallet_type, quantity, reason, user_id, user_email)
  values (v_code, v_task, p_tenant_id, p_company, p_warehouse_id, 'traslado',
          p_origin_location, p_destination_location, p_origin_store_id, p_destination_store_id,
          p_brand_id, p_pallet_type, p_quantity, nullif(btrim(coalesce(p_reason,'')), ''),
          p_user_id, p_user_email)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'task_id', v_task);
end;
$$;

-- ===========================================================================
-- RLS (scoping básico por tenant/company)
-- ===========================================================================
-- Catálogos: lectura + escritura directa (CRUD) para anon/authenticated.
-- Inventario / movimientos / descartes: SOLO lectura directa; las escrituras
-- pasan por las funciones SECURITY DEFINER de arriba.

alter table pallet_brands     enable row level security;
alter table pallet_stores     enable row level security;
alter table pallet_warehouses enable row level security;
alter table pallet_inventory  enable row level security;
alter table pallet_movements  enable row level security;
alter table pallet_discards   enable row level security;

-- Catálogos (ALL)
drop policy if exists pallet_brands_all on pallet_brands;
create policy pallet_brands_all on pallet_brands
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_stores_all on pallet_stores;
create policy pallet_stores_all on pallet_stores
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_warehouses_all on pallet_warehouses;
create policy pallet_warehouses_all on pallet_warehouses
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- Inventario / movimientos / descartes (solo SELECT directo)
drop policy if exists pallet_inventory_select on pallet_inventory;
create policy pallet_inventory_select on pallet_inventory
  for select to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_movements_select on pallet_movements;
create policy pallet_movements_select on pallet_movements
  for select to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO');

drop policy if exists pallet_discards_select on pallet_discards;
create policy pallet_discards_select on pallet_discards
  for select to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO');

-- ===========================================================================
-- GRANTS de ejecución de las RPC
-- ===========================================================================
grant execute on function mrp_positive_adjustment(text,text,uuid,uuid,text,integer,text,text,text) to anon, authenticated;
grant execute on function mrp_negative_adjustment(text,text,uuid,uuid,text,integer,text,text,text,text) to anon, authenticated;
grant execute on function mrp_transfer(text,text,uuid,text,text,uuid,uuid,uuid,text,integer,text,text,text) to anon, authenticated;

-- ============================================================================
-- TEARDOWN OPCIONAL (NO ejecutar salvo que quieras borrar TODO el módulo)
-- ----------------------------------------------------------------------------
-- drop table if exists pallet_discards cascade;
-- drop table if exists pallet_movements cascade;
-- drop table if exists pallet_inventory cascade;
-- drop table if exists pallet_warehouses cascade;
-- drop table if exists pallet_stores cascade;
-- drop table if exists pallet_brands cascade;
-- drop function if exists mrp_positive_adjustment(text,text,uuid,uuid,text,integer,text,text,text);
-- drop function if exists mrp_negative_adjustment(text,text,uuid,uuid,text,integer,text,text,text,text);
-- drop function if exists mrp_transfer(text,text,uuid,text,text,uuid,uuid,uuid,text,integer,text,text,text);
-- drop function if exists mrp_apply_stock_delta(text,text,uuid,text,uuid,uuid,text,integer);
-- drop function if exists mrp_next_movement_code();
-- drop function if exists mrp_set_updated_at();
-- drop sequence if exists mrp_movement_code_seq;
-- ============================================================================
