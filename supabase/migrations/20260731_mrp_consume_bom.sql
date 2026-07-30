-- ============================================================================
-- MRP — Consumo de una receta BOM (RPC), por bodega
-- ----------------------------------------------------------------------------
-- Expande la receta del BOM en el servidor (cantidad_requerida * multiplicador)
-- y delega en `mrp_consume_insumos`, que descuenta el stock de la bodega de
-- forma atómica (sin negativos) y registra un evento por insumo.
--
-- Al correr dentro de una sola transacción: si CUALQUIER insumo no alcanza,
-- se revierte TODO el consumo del BOM.
--
-- Requiere: 20260730_mrp_por_bodega.sql (columnas de bodega + RPC de consumo).
-- Idempotente.
-- ============================================================================

begin;

create or replace function public.mrp_consume_bom(
  p_tenant_id     text,
  p_company       text,
  p_bodega_id     text,
  p_bodega_nombre text,
  p_bom_id        uuid,
  p_multiplier    integer default 1,
  p_reason        text default null,
  p_fecha         date default null,
  p_user_id       text default null,
  p_user_email    text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_bom   public.mrp_boms%rowtype;
  v_items jsonb;
begin
  if p_multiplier is null or p_multiplier <= 0 then
    raise exception 'El multiplicador debe ser un entero mayor a 0.';
  end if;

  -- Cabecera del BOM dentro del scope (tenant/company/bodega).
  select * into v_bom
  from public.mrp_boms
  where id = p_bom_id
    and tenant_id = p_tenant_id
    and company = p_company
    and (p_bodega_id is null or bodega_id = p_bodega_id);

  if not found then
    raise exception 'BOM % no encontrado en la bodega indicada.', p_bom_id;
  end if;

  -- Expande la receta: [{ insumo_id, quantity: requerido * multiplicador }].
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'insumo_id', insumo_id,
               'quantity', (quantity * p_multiplier)
             )
             order by position
           ),
           '[]'::jsonb
         )
    into v_items
  from public.mrp_bom_insumos
  where bom_id = p_bom_id
    and tenant_id = p_tenant_id
    and company = p_company
    and (p_bodega_id is null or bodega_id = p_bodega_id);

  if v_items = '[]'::jsonb then
    raise exception 'El BOM % no tiene insumos.', v_bom.codigo;
  end if;

  -- Delega en el consumo atómico (misma transacción → rollback total si falla).
  return public.mrp_consume_insumos(
    p_tenant_id, p_company, p_bodega_id, p_bodega_nombre,
    v_items,
    p_reason, p_fecha, p_user_id, p_user_email,
    p_bom_id, v_bom.codigo, p_multiplier::numeric
  );
end;
$$;

comment on function public.mrp_consume_bom(text, text, text, text, uuid, integer, text, date, text, text)
  is 'Consume una receta BOM por bodega: expande cantidad_requerida * multiplicador y delega en mrp_consume_insumos (atómico, sin negativos). Usada por web y app móvil.';

commit;
