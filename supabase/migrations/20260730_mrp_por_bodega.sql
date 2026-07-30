-- ============================================================================
-- MRP — Alcance por BODEGA para insumos, BOM y eventos
-- ----------------------------------------------------------------------------
-- Decisión: el catálogo de insumos y las recetas BOM pasan a ser POR BODEGA
-- (además de tenant/company). Cada fila de insumo/BOM pertenece a una bodega;
-- el `stock` sigue siendo columna de mrp_insumos (ahora por fila = por bodega).
--
-- Backfill: todo lo existente se asigna a la bodega CR-OLO-CLIRO (CLIRO).
--
-- Cambios (aditivos + reemplazo de la RPC de consumo):
--   1) Columnas bodega_id / bodega_nombre en mrp_insumos, mrp_boms,
--      mrp_bom_insumos y mrp_eventos (nullable; el front las setea al crear).
--   2) Backfill a CR-OLO-CLIRO donde estén nulas.
--   3) Índices por (tenant, company, bodega).
--   4) Reemplazo de mrp_consume_insumos por la versión con bodega
--      (descuenta el stock del insumo de la bodega y sella la bodega en el evento).
--
-- Idempotente. NO fija NOT NULL para no romper inserts existentes; el front
-- garantiza la bodega en las nuevas filas.
--
-- IMPORTANTE: aplicar DESPUÉS de 20260729_mrp_consume_insumos.sql (esta versión
-- reemplaza esa RPC). El web ya llama la RPC con p_bodega_id/p_bodega_nombre.
-- ============================================================================

begin;

-- 1) Columnas de bodega ------------------------------------------------------
alter table public.mrp_insumos     add column if not exists bodega_id     text;
alter table public.mrp_insumos     add column if not exists bodega_nombre text;
alter table public.mrp_boms         add column if not exists bodega_id     text;
alter table public.mrp_boms         add column if not exists bodega_nombre text;
alter table public.mrp_bom_insumos  add column if not exists bodega_id     text;
alter table public.mrp_bom_insumos  add column if not exists bodega_nombre text;
alter table public.mrp_eventos      add column if not exists bodega_id     text;
alter table public.mrp_eventos      add column if not exists bodega_nombre text;

-- 2) Backfill a CR-OLO-CLIRO -------------------------------------------------
update public.mrp_insumos
   set bodega_id = 'CR-OLO-CLIRO', bodega_nombre = coalesce(bodega_nombre, 'CLIRO')
 where bodega_id is null;
update public.mrp_boms
   set bodega_id = 'CR-OLO-CLIRO', bodega_nombre = coalesce(bodega_nombre, 'CLIRO')
 where bodega_id is null;
update public.mrp_bom_insumos
   set bodega_id = 'CR-OLO-CLIRO', bodega_nombre = coalesce(bodega_nombre, 'CLIRO')
 where bodega_id is null;
update public.mrp_eventos
   set bodega_id = 'CR-OLO-CLIRO', bodega_nombre = coalesce(bodega_nombre, 'CLIRO')
 where bodega_id is null;

-- 3) Índices -----------------------------------------------------------------
create index if not exists mrp_insumos_scope_idx
  on public.mrp_insumos (tenant_id, company, bodega_id, codigo);
create index if not exists mrp_boms_scope_idx
  on public.mrp_boms (tenant_id, company, bodega_id, codigo);
create index if not exists mrp_bom_insumos_bom_idx
  on public.mrp_bom_insumos (bom_id);
create index if not exists mrp_eventos_scope_idx
  on public.mrp_eventos (tenant_id, company, bodega_id, entity_type, created_at desc);

-- 4) RPC de consumo por bodega ----------------------------------------------
-- Reemplaza la versión tenant/company (20260729). Elimina la firma anterior
-- (10 args) para evitar ambigüedad de sobrecarga en PostgREST.
drop function if exists public.mrp_consume_insumos(text, text, jsonb, text, date, text, text, uuid, text, numeric);

create or replace function public.mrp_consume_insumos(
  p_tenant_id     text,
  p_company       text,
  p_bodega_id     text,
  p_bodega_nombre text,
  p_items         jsonb,                 -- [{ "insumo_id": uuid, "quantity": int }]
  p_reason        text default null,
  p_fecha         date default null,     -- día de negocio (default hoy)
  p_user_id       text default null,
  p_user_email    text default null,
  p_bom_id        uuid default null,
  p_bom_codigo    text default null,
  p_multiplier    numeric default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_fecha       date := coalesce(p_fecha, current_date);
  v_item        jsonb;
  v_insumo_id   uuid;
  v_qty         integer;
  v_row         public.mrp_insumos%rowtype;
  v_detail      text;
  v_bom_suffix  text := '';
  v_results     jsonb := '[]'::jsonb;
  v_total       integer := 0;
begin
  if p_tenant_id is null or p_company is null then
    raise exception 'Falta tenant/company para el consumo de insumos.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe indicar al menos un insumo a consumir.';
  end if;

  if p_bom_codigo is not null then
    v_bom_suffix := ' · BOM ' || p_bom_codigo
      || case when p_multiplier is not null then ' x' || trim(to_char(p_multiplier, 'FM999999990.####')) else '' end;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_insumo_id := (v_item->>'insumo_id')::uuid;
    exception when others then
      raise exception 'insumo_id inválido en el consumo.';
    end;

    v_qty := floor((v_item->>'quantity')::numeric)::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'La cantidad a consumir debe ser un entero mayor a 0.';
    end if;

    -- Bloqueo de la fila del insumo dentro del scope (tenant/company/bodega).
    select * into v_row
    from public.mrp_insumos
    where id = v_insumo_id
      and tenant_id = p_tenant_id
      and company = p_company
      and (p_bodega_id is null or bodega_id = p_bodega_id)
    for update;

    if not found then
      raise exception 'Insumo % no encontrado en la bodega indicada.', v_insumo_id;
    end if;

    if coalesce(v_row.stock, 0) < v_qty then
      raise exception 'Stock insuficiente para % (%): disponible %, requerido %.',
        v_row.codigo, v_row.nombre, coalesce(v_row.stock, 0), v_qty;
    end if;

    update public.mrp_insumos
    set stock = coalesce(stock, 0) - v_qty
    where id = v_insumo_id;

    v_detail := 'Consumo −' || v_qty
      || case when v_row.codigo is not null then ' · ' || v_row.codigo else '' end
      || case when p_reason is not null and length(btrim(p_reason)) > 0 then ' · ' || btrim(p_reason) else '' end
      || ' · ' || to_char(v_fecha, 'YYYY-MM-DD')
      || v_bom_suffix;

    insert into public.mrp_eventos (
      tenant_id, company, bodega_id, bodega_nombre,
      entity_type, entity_id, entity_codigo, entity_nombre,
      action, detail, user_id, user_email
    ) values (
      p_tenant_id, p_company, coalesce(p_bodega_id, v_row.bodega_id), coalesce(p_bodega_nombre, v_row.bodega_nombre),
      'insumo', v_insumo_id, v_row.codigo, v_row.nombre,
      'consume', v_detail, p_user_id, p_user_email
    );

    v_total := v_total + v_qty;
    v_results := v_results || jsonb_build_object(
      'insumo_id', v_insumo_id,
      'codigo', v_row.codigo,
      'nombre', v_row.nombre,
      'consumed', v_qty,
      'stock_after', coalesce(v_row.stock, 0) - v_qty
    );
  end loop;

  return jsonb_build_object(
    'fecha', to_char(v_fecha, 'YYYY-MM-DD'),
    'bodega_id', p_bodega_id,
    'count', jsonb_array_length(v_results),
    'total_consumed', v_total,
    'items', v_results
  );
end;
$$;

comment on function public.mrp_consume_insumos(text, text, text, text, jsonb, text, date, text, text, uuid, text, numeric)
  is 'Consume insumos por bodega (descuenta stock sin negativos) y registra eventos entity_type=insumo, action=consume con bodega. Usada por web y app móvil.';

commit;
