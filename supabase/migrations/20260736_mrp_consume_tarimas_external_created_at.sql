-- ============================================================================
-- MRP Tarimas — Consumo externo con fecha del movimiento (carga histórica)
-- ----------------------------------------------------------------------------
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Contexto: `mrp_consume_tarimas_external` sella el movimiento con now(), lo
-- correcto para el consumo en vivo. Para IMPORTAR movimientos históricos (los
-- reportes "ReporteMovimientos 390/391" del WMS, que traen `Fecha Atención`)
-- hace falta poder fijar la fecha real del movimiento: si no, todo el histórico
-- aterriza con la fecha de la corrida y cualquier métrica por fecha queda mal.
-- `pallet_movimientos_articulo` solo tiene política SELECT para anon (las
-- escrituras van por RPC SECURITY DEFINER), así que el cliente NO puede
-- corregir la fecha después: tiene que hacerse acá dentro.
--
-- Cambio (ÚNICO): se añade `p_created_at timestamptz default null` al final.
--   - NULL (o ausente)  → comportamiento idéntico al actual: now().
--   - Con valor         → sella ese timestamp en el movimiento y en el registro
--                         de consumo externo.
-- Todo lo demás queda IDÉNTICO a 20260735: validaciones, catálogo compartido de
-- artículos, resolución de tienda por código externo, idempotencia por
-- external_event_id, contrato de retorno y metadata.
--
-- ⚠️ Se DROPEA la firma de 10 args y se recrea con 11. Es obligatorio: con
-- ambas firmas presentes, una llamada de 10 args sería ambigua y Postgres la
-- rechazaría. Los llamadores existentes (Cloud Function
-- `consumeTarimasFromExternalApp`, que llama con parámetros NOMBRADOS) siguen
-- funcionando por el valor por defecto.
--
-- Requiere: 20260735_mrp_consume_tarimas_external_shared_catalog.sql
-- ============================================================================

drop function if exists mrp_consume_tarimas_external(
  text, text, text, text, text, integer, text, text, text, text
);

create or replace function mrp_consume_tarimas_external(
  p_tenant_id text,
  p_company text,
  p_external_event_id text,
  p_bodega_id text,
  p_articulo_codigo text,
  p_quantity integer,
  p_reason text,
  p_user_id text,
  p_user_email text,
  p_tienda_externa text default null,
  p_created_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id text := btrim(coalesce(p_tenant_id, ''));
  v_company text := btrim(coalesce(p_company, ''));
  v_external_event_id text := btrim(coalesce(p_external_event_id, ''));
  v_bodega_id text := btrim(coalesce(p_bodega_id, ''));
  v_articulo_codigo text := upper(btrim(coalesce(p_articulo_codigo, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_user_id text := btrim(coalesce(p_user_id, ''));
  v_user_email text := nullif(btrim(coalesce(p_user_email, '')), '');
  v_tienda_externa text := nullif(upper(btrim(coalesce(p_tienda_externa, ''))), '');
  v_store_id uuid;
  v_warehouse_id uuid;
  v_warehouse_name text;
  v_articulo_id uuid;
  v_articulo_nombre text;
  v_consumption_id uuid;
  v_existing pallet_external_consumptions%rowtype;
  v_transfer jsonb;
  v_movement_id uuid;
  v_movement_code text;
  v_task_id uuid;
  v_result jsonb;
begin
  if v_tenant_id = '' then raise exception 'tenant_id es obligatorio'; end if;
  if v_company = '' then raise exception 'company es obligatorio'; end if;
  if v_external_event_id = '' then raise exception 'external_event_id es obligatorio'; end if;
  if v_bodega_id = '' then raise exception 'bodega_id es obligatorio'; end if;
  if v_articulo_codigo = '' then raise exception 'articulo_codigo es obligatorio'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if v_user_id = '' then raise exception 'user_id es obligatorio'; end if;

  select id, name
    into v_warehouse_id, v_warehouse_name
    from pallet_warehouses
   where tenant_id = v_tenant_id and company = v_company
     and bodega_id = v_bodega_id and active = true
   limit 1;
  if v_warehouse_id is null then
    raise exception 'No existe un almacen MRP activo ligado a la bodega %', v_bodega_id;
  end if;

  -- Catálogo COMPARTIDO: el artículo se resuelve por tenant/company + código
  -- (único por tenant/company). Ver 20260735.
  select id, nombre
    into v_articulo_id, v_articulo_nombre
    from pallet_articulos
   where tenant_id = v_tenant_id and company = v_company
     and upper(btrim(codigo)) = v_articulo_codigo and active = true
   limit 1;
  if v_articulo_id is null then
    raise exception 'No existe un articulo activo con codigo % en el tenant/company %/%',
      v_articulo_codigo, v_tenant_id, v_company;
  end if;

  -- Tienda destino (opcional): resuelve el código externo al cliente MRP.
  if v_tienda_externa is not null then
    select id into v_store_id
      from pallet_tiendas
     where tenant_id = v_tenant_id and company = v_company
       and active = true
       and upper(btrim(external_code)) = v_tienda_externa
     limit 1;
    if v_store_id is null then
      raise exception 'No existe un cliente MRP activo ligado al codigo externo %', v_tienda_externa;
    end if;
  end if;

  insert into pallet_external_consumptions (
    tenant_id, company, external_event_id, bodega_id, warehouse_id,
    articulo_id, articulo_codigo, quantity, origin_location,
    destination_location, reason, user_id, user_email, status,
    tienda_externa, store_id
  )
  values (
    v_tenant_id, v_company, v_external_event_id, v_bodega_id, v_warehouse_id,
    v_articulo_id, v_articulo_codigo, p_quantity, 'almacen',
    'tienda', v_reason, v_user_id, v_user_email, 'processing',
    v_tienda_externa, v_store_id
  )
  on conflict (tenant_id, company, external_event_id) do nothing
  returning id into v_consumption_id;

  if v_consumption_id is null then
    select *
      into v_existing
      from pallet_external_consumptions
     where tenant_id = v_tenant_id and company = v_company
       and external_event_id = v_external_event_id
     for update;

    if v_existing.id is null then
      raise exception 'No se pudo resolver el consumo externo %', v_external_event_id;
    end if;

    if v_existing.bodega_id <> v_bodega_id
       or v_existing.warehouse_id <> v_warehouse_id
       or v_existing.articulo_id <> v_articulo_id
       or v_existing.quantity <> p_quantity
       or v_existing.origin_location <> 'almacen'
       or v_existing.destination_location <> 'tienda'
       or coalesce(v_existing.store_id::text, '') <> coalesce(v_store_id::text, '') then
      raise exception 'El external_event_id % ya fue procesado con otro payload',
        v_external_event_id;
    end if;

    return coalesce(v_existing.result, '{}'::jsonb)
      || jsonb_build_object('ok', true, 'idempotent', true,
                            'external_event_id', v_external_event_id);
  end if;

  if v_reason is null then
    v_reason := 'Consumo app externa: ' || v_external_event_id;
  end if;

  v_transfer := mrp_articulo_transfer(
    v_tenant_id, v_company, v_warehouse_id,
    'almacen', 'tienda', v_articulo_id, p_quantity, v_reason,
    v_user_id, v_user_email, v_store_id
  );

  v_movement_id := (v_transfer->>'movement_id')::uuid;
  v_movement_code := v_transfer->>'movement_code';
  v_task_id := (v_transfer->>'task_id')::uuid;

  -- Metadata + fecha real del movimiento. `p_created_at` NULL deja el now() que
  -- puso mrp_articulo_transfer (comportamiento en vivo, sin cambios).
  update pallet_movimientos_articulo
     set metadata = coalesce(metadata, '{}'::jsonb)
       || jsonb_build_object(
            'external_consumption', true,
            'external_event_id', v_external_event_id,
            'bodega_id', v_bodega_id,
            'tienda_externa', v_tienda_externa,
            'source', 'consumeTarimasFromExternalApp'
          )
       || case
            when p_created_at is null then '{}'::jsonb
            else jsonb_build_object('backdated', true,
                                    'imported_at', now())
          end,
         created_at = coalesce(p_created_at, created_at)
   where id = v_movement_id;

  v_result := v_transfer
    || jsonb_build_object(
      'ok', true, 'idempotent', false,
      'external_event_id', v_external_event_id,
      'tenant_id', v_tenant_id, 'company', v_company,
      'bodega_id', v_bodega_id, 'warehouse_id', v_warehouse_id,
      'warehouse_name', v_warehouse_name,
      'articulo_id', v_articulo_id, 'articulo_codigo', v_articulo_codigo,
      'articulo_nombre', v_articulo_nombre, 'quantity', p_quantity,
      'origin_location', 'almacen', 'destination_location', 'tienda',
      'tienda_externa', v_tienda_externa, 'store_id', v_store_id,
      'created_at', coalesce(p_created_at, now())
    );

  update pallet_external_consumptions
     set status = 'completed', reason = v_reason,
         movement_id = v_movement_id, movement_code = v_movement_code,
         task_id = v_task_id, result = v_result,
         created_at = coalesce(p_created_at, created_at)
   where id = v_consumption_id;

  return v_result;
end;
$$;

grant execute on function mrp_consume_tarimas_external(
  text, text, text, text, text, integer, text, text, text, text, timestamptz
) to anon, authenticated;
-- ============================================================================
