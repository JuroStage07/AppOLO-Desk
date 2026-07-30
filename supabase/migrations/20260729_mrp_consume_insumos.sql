-- ============================================================================
-- MRP — API de consumo de insumos (RPC atómica)
-- ----------------------------------------------------------------------------
-- Consume (da salida) uno o varios insumos en una sola transacción:
--   * bloquea cada fila con SELECT ... FOR UPDATE (evita carreras),
--   * valida cantidad entera > 0 y stock suficiente (nunca deja negativo),
--   * descuenta el stock,
--   * registra un evento por insumo en `mrp_eventos` con
--       entity_type = 'insumo', action = 'consume'
--     para que aparezca en el "Registro de insumos".
--
-- Pensado para ser llamada tanto por AppoloDesk (web) como por la app móvil
-- (React Native / Expo) contra el mismo proyecto Supabase.
--
-- security invoker: sujeta a RLS, igual que el resto de mutaciones MRP (la web
-- ya escribe mrp_insumos / mrp_eventos con la anon key).
--
-- Idempotente: create or replace.
-- ============================================================================

create or replace function public.mrp_consume_insumos(
  p_tenant_id  text,
  p_company    text,
  p_items      jsonb,                 -- [{ "insumo_id": uuid, "quantity": int }]
  p_reason     text default null,
  p_fecha      date default null,     -- día de negocio del consumo (default hoy)
  p_user_id    text default null,
  p_user_email text default null,
  p_bom_id     uuid default null,     -- opcional: consumo originado por una receta
  p_bom_codigo text default null,     -- opcional: código del BOM (BOM###)
  p_multiplier numeric default null   -- opcional: multiplicador de receta (para el detalle)
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
    -- Validación de forma.
    begin
      v_insumo_id := (v_item->>'insumo_id')::uuid;
    exception when others then
      raise exception 'insumo_id inválido en el consumo.';
    end;

    v_qty := floor((v_item->>'quantity')::numeric)::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'La cantidad a consumir debe ser un entero mayor a 0.';
    end if;

    -- Bloqueo de la fila del insumo dentro del scope (evita carreras).
    select * into v_row
    from public.mrp_insumos
    where id = v_insumo_id
      and tenant_id = p_tenant_id
      and company = p_company
    for update;

    if not found then
      raise exception 'Insumo % no encontrado en el scope indicado.', v_insumo_id;
    end if;

    if coalesce(v_row.stock, 0) < v_qty then
      raise exception 'Stock insuficiente para % (%): disponible %, requerido %.',
        v_row.codigo, v_row.nombre, coalesce(v_row.stock, 0), v_qty;
    end if;

    -- Descuento.
    update public.mrp_insumos
    set stock = coalesce(stock, 0) - v_qty
    where id = v_insumo_id;

    -- Detalle legible del evento.
    v_detail := 'Consumo −' || v_qty
      || case when v_row.codigo is not null then ' · ' || v_row.codigo else '' end
      || case when p_reason is not null and length(btrim(p_reason)) > 0 then ' · ' || btrim(p_reason) else '' end
      || ' · ' || to_char(v_fecha, 'YYYY-MM-DD')
      || v_bom_suffix;

    -- Registro en la bitácora (aparece en "Registro de insumos").
    insert into public.mrp_eventos (
      tenant_id, company, entity_type, entity_id, entity_codigo, entity_nombre,
      action, detail, user_id, user_email
    ) values (
      p_tenant_id, p_company, 'insumo', v_insumo_id, v_row.codigo, v_row.nombre,
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
    'count', jsonb_array_length(v_results),
    'total_consumed', v_total,
    'items', v_results
  );
end;
$$;

comment on function public.mrp_consume_insumos(text, text, jsonb, text, date, text, text, uuid, text, numeric)
  is 'Consume insumos atómicamente (descuenta stock sin negativos) y registra eventos entity_type=insumo, action=consume. Usada por web y app móvil.';
