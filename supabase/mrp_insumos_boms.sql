-- ============================================================================
-- MRP Tarimas — Insumos y BOM (mrp_insumos, mrp_boms, mrp_bom_insumos)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente
-- (CREATE ... IF NOT EXISTS / CREATE OR REPLACE; sin DROP ni TRUNCATE de datos
--  salvo el teardown opcional comentado al final).
--
-- Un BOM (Bill of Materials) es la composición de materiales que consume
-- insumos del catálogo `mrp_insumos`.
--
-- Scope: como el resto del módulo MRP, todo se fija a tenant_id = 'CR' /
-- company = 'OLO'. La app usa la ANON KEY con auth de Firebase; el gating por
-- usuario/permiso vive en el cliente. RLS aquí da scoping básico por
-- tenant/company. Los códigos correlativos (AI###, BOM###) se generan en
-- funciones SECURITY DEFINER con advisory lock para evitar duplicados.
--
-- Depende de mrp_set_updated_at() (definida en supabase/mrp_pallets.sql).
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ===========================================================================
-- MIGRACIÓN receta → BOM (solo si aplica; preserva datos)
-- ===========================================================================
-- Instalaciones previas usaban mrp_recetas / mrp_receta_insumos y códigos
-- 'RP###'. Se renombran a mrp_boms / mrp_bom_insumos, la columna receta_id a
-- bom_id, y los códigos 'RP###' a 'BOM###'. Se eliminan las RPC viejas.
do $$
begin
  if to_regclass('public.mrp_recetas') is not null
     and to_regclass('public.mrp_boms') is null then
    alter table mrp_recetas rename to mrp_boms;
  end if;

  if to_regclass('public.mrp_receta_insumos') is not null
     and to_regclass('public.mrp_bom_insumos') is null then
    alter table mrp_receta_insumos rename to mrp_bom_insumos;
    if exists (
      select 1 from information_schema.columns
      where table_name = 'mrp_bom_insumos' and column_name = 'receta_id'
    ) then
      alter table mrp_bom_insumos rename column receta_id to bom_id;
    end if;
  end if;
end $$;

drop function if exists mrp_create_receta(text, text, text, jsonb);
drop function if exists mrp_create_receta(text, text, text, uuid[]);
drop function if exists mrp_update_receta(text, text, uuid, text, jsonb);

-- ===========================================================================
-- TABLAS
-- ===========================================================================

-- Artículos insumo ---------------------------------------------------------
-- Código autogenerado 'AI' + 3 dígitos correlativos (AI001, AI002, …) por
-- tenant/company. price_mode: 'unit' (por unidad) | 'batch' (por lote).
create table if not exists mrp_insumos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  company      text not null,
  codigo       text not null,
  nombre       text not null,
  detalle      text,
  price        numeric(12,2) not null default 0 check (price >= 0),
  price_mode   text not null check (price_mode in ('unit','batch')),
  stock        integer not null default 0 check (stock >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, company, codigo)
);

-- stock: cada insumo arranca en 0. Idempotente para tablas creadas antes de
-- esta columna.
alter table mrp_insumos
  add column if not exists stock integer not null default 0;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mrp_insumos_stock_check'
  ) then
    alter table mrp_insumos
      add constraint mrp_insumos_stock_check check (stock >= 0);
  end if;
end $$;

create index if not exists mrp_insumos_scope_idx
  on mrp_insumos (tenant_id, company);

-- BOM ----------------------------------------------------------------------
-- Código autogenerado 'BOM' + 3 dígitos correlativos (BOM001, BOM002, …).
create table if not exists mrp_boms (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  company      text not null,
  codigo       text not null,
  nombre       text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, company, codigo)
);

create index if not exists mrp_boms_scope_idx
  on mrp_boms (tenant_id, company);

-- Re-codifica códigos 'RP###' heredados a 'BOM###' (idempotente).
update mrp_boms
  set codigo = 'BOM' || substring(codigo from 3)
  where codigo ~ '^RP[0-9]+$';

-- BOM ↔ Insumos (tabla de unión) -------------------------------------------
-- Cascade delete desde el BOM. Par bom/insumo único.
create table if not exists mrp_bom_insumos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null,
  company     text not null,
  bom_id      uuid not null references mrp_boms(id) on delete cascade,
  insumo_id   uuid not null references mrp_insumos(id),
  quantity    integer not null default 1 check (quantity > 0),
  position    integer,
  created_at  timestamptz not null default now(),
  unique (bom_id, insumo_id)
);

-- quantity: unidades del insumo que requiere el BOM (> 0). Idempotente para
-- tablas creadas antes de esta columna.
alter table mrp_bom_insumos
  add column if not exists quantity integer not null default 1;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mrp_bom_insumos_quantity_check'
  ) then
    alter table mrp_bom_insumos
      add constraint mrp_bom_insumos_quantity_check check (quantity > 0);
  end if;
end $$;

create index if not exists mrp_bom_insumos_bom_idx
  on mrp_bom_insumos (bom_id);
create index if not exists mrp_bom_insumos_insumo_idx
  on mrp_bom_insumos (insumo_id);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at (reutilizan mrp_set_updated_at del esquema base).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_mrp_insumos_updated on mrp_insumos;
create trigger trg_mrp_insumos_updated before update on mrp_insumos
  for each row execute function mrp_set_updated_at();

drop trigger if exists trg_mrp_recetas_updated on mrp_boms;  -- limpia trigger viejo
drop trigger if exists trg_mrp_boms_updated on mrp_boms;
create trigger trg_mrp_boms_updated before update on mrp_boms
  for each row execute function mrp_set_updated_at();

-- ===========================================================================
-- FUNCIONES DE NEGOCIO (transaccionales)
-- ===========================================================================

-- Alta de insumo con código autogenerado correlativo (AI001, AI002, …).
create or replace function mrp_create_insumo(
  p_tenant_id  text,
  p_company    text,
  p_nombre     text,
  p_detalle    text,
  p_price      numeric,
  p_price_mode text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
  v_code text;
  v_row  mrp_insumos;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del insumo es obligatorio';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'El precio debe ser mayor o igual a 0';
  end if;
  if p_price_mode is null or p_price_mode not in ('unit','batch') then
    raise exception 'Modo de precio inválido: %', p_price_mode;
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|mrp_insumos'));

  select coalesce(max((substring(codigo from 3))::int), 0) + 1
    into v_next
    from mrp_insumos
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^AI[0-9]+$';

  v_code := 'AI' || lpad(v_next::text, 3, '0');

  insert into mrp_insumos (tenant_id, company, codigo, nombre, detalle, price, price_mode)
  values (p_tenant_id, p_company, v_code, btrim(p_nombre),
          nullif(btrim(coalesce(p_detalle, '')), ''), p_price, p_price_mode)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_insumo(text, text, text, text, numeric, text) to anon, authenticated;

-- Alta de BOM con código autogenerado (BOM001, …) + filas de unión con
-- cantidades, de forma transaccional. `p_items` es un arreglo jsonb de objetos
-- { "insumo_id": "...", "quantity": 4 }. Valida nombre, cantidades enteras > 0,
-- ausencia de duplicados y que los insumos pertenezcan al mismo tenant/company.
create or replace function mrp_create_bom(
  p_tenant_id  text,
  p_company    text,
  p_nombre     text,
  p_items      jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next     integer;
  v_code     text;
  v_total    integer;
  v_distinct integer;
  v_valid    integer;
  v_row      mrp_boms;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del BOM es obligatorio';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un artículo insumo';
  end if;

  -- Cada item: insumo_id presente y quantity entero > 0.
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where nullif(btrim(coalesce(e->>'insumo_id', '')), '') is null
       or (e->>'quantity') is null
       or (e->>'quantity') !~ '^[0-9]+$'
       or (e->>'quantity')::int <= 0
  ) then
    raise exception 'Cada insumo debe tener una cantidad entera mayor a 0';
  end if;

  -- No se permiten insumos duplicados en el mismo BOM.
  v_total := jsonb_array_length(p_items);
  select count(distinct (e->>'insumo_id')) into v_distinct
    from jsonb_array_elements(p_items) e;
  if v_distinct <> v_total then
    raise exception 'No se permiten insumos duplicados en el BOM';
  end if;

  -- Todos los insumos deben existir y pertenecer al mismo tenant/company.
  select count(*) into v_valid
    from mrp_insumos
    where tenant_id = p_tenant_id and company = p_company
      and id in (select (e->>'insumo_id')::uuid from jsonb_array_elements(p_items) e);
  if v_valid <> v_distinct then
    raise exception 'Uno o más insumos no existen o no pertenecen a este tenant/company';
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|mrp_boms'));

  select coalesce(max((substring(codigo from 4))::int), 0) + 1
    into v_next
    from mrp_boms
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^BOM[0-9]+$';

  v_code := 'BOM' || lpad(v_next::text, 3, '0');

  insert into mrp_boms (tenant_id, company, codigo, nombre)
  values (p_tenant_id, p_company, v_code, btrim(p_nombre))
  returning * into v_row;

  insert into mrp_bom_insumos (tenant_id, company, bom_id, insumo_id, quantity, position)
  select p_tenant_id, p_company, v_row.id,
         (e.item->>'insumo_id')::uuid,
         (e.item->>'quantity')::int,
         e.ord
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  return to_jsonb(v_row) || jsonb_build_object('insumo_count', v_total);
end;
$$;

grant execute on function mrp_create_bom(text, text, text, jsonb) to anon, authenticated;

-- Edición de BOM: actualiza el nombre y REEMPLAZA las filas de unión (con
-- cantidades) de forma transaccional. Mismas validaciones que el alta. El
-- código NO se toca.
create or replace function mrp_update_bom(
  p_tenant_id text,
  p_company   text,
  p_bom_id    uuid,
  p_nombre    text,
  p_items     jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total    integer;
  v_distinct integer;
  v_valid    integer;
  v_row      mrp_boms;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del BOM es obligatorio';
  end if;

  -- El BOM debe existir dentro del scope.
  select * into v_row from mrp_boms
    where id = p_bom_id and tenant_id = p_tenant_id and company = p_company;
  if not found then
    raise exception 'El BOM no existe o no pertenece a este tenant/company';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe seleccionar al menos un artículo insumo';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where nullif(btrim(coalesce(e->>'insumo_id', '')), '') is null
       or (e->>'quantity') is null
       or (e->>'quantity') !~ '^[0-9]+$'
       or (e->>'quantity')::int <= 0
  ) then
    raise exception 'Cada insumo debe tener una cantidad entera mayor a 0';
  end if;

  v_total := jsonb_array_length(p_items);
  select count(distinct (e->>'insumo_id')) into v_distinct
    from jsonb_array_elements(p_items) e;
  if v_distinct <> v_total then
    raise exception 'No se permiten insumos duplicados en el BOM';
  end if;

  select count(*) into v_valid
    from mrp_insumos
    where tenant_id = p_tenant_id and company = p_company
      and id in (select (e->>'insumo_id')::uuid from jsonb_array_elements(p_items) e);
  if v_valid <> v_distinct then
    raise exception 'Uno o más insumos no existen o no pertenecen a este tenant/company';
  end if;

  update mrp_boms set nombre = btrim(p_nombre)
    where id = p_bom_id
    returning * into v_row;

  delete from mrp_bom_insumos where bom_id = p_bom_id;

  insert into mrp_bom_insumos (tenant_id, company, bom_id, insumo_id, quantity, position)
  select p_tenant_id, p_company, p_bom_id,
         (e.item->>'insumo_id')::uuid,
         (e.item->>'quantity')::int,
         e.ord
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  return to_jsonb(v_row) || jsonb_build_object('insumo_count', v_total);
end;
$$;

grant execute on function mrp_update_bom(text, text, uuid, text, jsonb) to anon, authenticated;

-- ===========================================================================
-- RLS (scoping básico por tenant/company)
-- ===========================================================================
-- Lectura + escritura directa (CRUD) para anon/authenticated dentro del scope.
-- Las altas con código correlativo pasan por las RPC de arriba; el setActive,
-- la edición de insumo y los DELETE usan acceso directo (permitido por el
-- policy `for all`). La edición de BOM pasa por mrp_update_bom.
-- Nota: borrar un insumo referenciado por un BOM falla por la FK
-- (mrp_bom_insumos.insumo_id) → el cliente traduce el error 23503.

alter table mrp_insumos     enable row level security;
alter table mrp_boms        enable row level security;
alter table mrp_bom_insumos enable row level security;

drop policy if exists mrp_insumos_all on mrp_insumos;
create policy mrp_insumos_all on mrp_insumos
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

drop policy if exists mrp_recetas_all on mrp_boms;  -- limpia policy viejo
drop policy if exists mrp_boms_all on mrp_boms;
create policy mrp_boms_all on mrp_boms
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

drop policy if exists mrp_receta_insumos_all on mrp_bom_insumos;  -- limpia policy viejo
drop policy if exists mrp_bom_insumos_all on mrp_bom_insumos;
create policy mrp_bom_insumos_all on mrp_bom_insumos
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- ============================================================================
-- TEARDOWN OPCIONAL (NO ejecutar salvo que quieras borrar insumos y BOM):
-- drop function if exists mrp_update_bom(text,text,uuid,text,jsonb);
-- drop function if exists mrp_create_bom(text,text,text,jsonb);
-- drop function if exists mrp_create_insumo(text,text,text,text,numeric,text);
-- drop table if exists mrp_bom_insumos cascade;
-- drop table if exists mrp_boms cascade;
-- drop table if exists mrp_insumos cascade;
-- ============================================================================
