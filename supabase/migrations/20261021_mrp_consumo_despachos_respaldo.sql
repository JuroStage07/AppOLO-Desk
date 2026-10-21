-- ============================================================================
-- Respaldo automático en Supabase del consumo de tarimas MRP de los despachos.
--
-- Flujo normal: al finalizar un despacho, la app móvil llama a la Cloud Function
-- consumeTarimasFromExternalApp, que registra el consumo y la app marca
-- despacho_dev_despachos.mrp_traslado = 'ok'.
--
-- Respaldo (este archivo): si eso no ocurrió (sin señal, error, permiso), pg_cron
-- corre cada 5 minutos y registra el consumo de los despachos finalizados que no
-- quedaron en 'ok', con la FECHA REAL de finalización. Es idempotente: usa el mismo
-- external_event_id que la app (DESPACHO-<id>-ARTICULO-<código>), así que nunca
-- duplica un consumo aunque la app lo reintente después.
--
--   - Tarimas sencillas (tarimas_s) → articulo_s; dobles (tarimas_d) → articulo_d
--     según despacho_dev_mrp_tarimas_config del tenant/compañía.
--   - Un error (p. ej. stock insuficiente) no bloquea nada: queda en
--     mrp_traslado_detalle.errores y se reintenta cada 5 min durante ~1 hora y
--     después una vez por hora (se resuelve solo al corregir el inventario).
--   - Solo cambia campos mrp_*; el trigger de actividad los ignora.
-- Idempotente.
-- ============================================================================

-- Consume un despacho (si corresponde) y deja el resultado en el propio despacho.
create or replace function public.mrp_consume_despacho(p_despacho_id uuid, p_origen text default 'respaldo-servidor')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d          public.despacho_dev_despachos%rowtype;
  v_cfg      record;
  v_email    text;
  v_items    jsonb := '[]'::jsonb;
  v_errores  jsonb := '[]'::jsonb;
  v_res      jsonb;
  v_ok       boolean;
  v_intentos int;
  it         record;
  v_event    text;
begin
  select * into d from public.despacho_dev_despachos where id = p_despacho_id for update;
  if not found or d.deleted_at is not null or d.finalized_at is null then
    return jsonb_build_object('ok', false, 'omitido', 'no-finalizado');
  end if;
  if d.mrp_traslado = 'ok' then
    return jsonb_build_object('ok', true, 'omitido', 'ya-ok');
  end if;

  select articulo_s, articulo_d into v_cfg
    from public.despacho_dev_mrp_tarimas_config
   where tenant_id = d.tenant_id and company = d.company;
  if not found then
    return jsonb_build_object('ok', false, 'omitido', 'sin-config');
  end if;

  select email into v_email from auth.users where id = d.updated_by;

  for it in
    select v.art, v.q
      from (values (v_cfg.articulo_s, coalesce(d.tarimas_s, 0)),
                   (v_cfg.articulo_d, coalesce(d.tarimas_d, 0))) as v(art, q)
     where v.q > 0 and coalesce(v.art, '') <> ''
  loop
    v_event := 'DESPACHO-' || d.id || '-ARTICULO-' || upper(it.art);
    begin
      v_res := public.mrp_consume_tarimas_external(
        d.tenant_id, d.company, v_event, d.bodega_id, upper(it.art), it.q,
        format('Consumo despacho %s (%s)', coalesce(nullif(d.referencia, ''), d.id::text), p_origen),
        coalesce(d.updated_by::text, p_origen), v_email, d.tienda, d.finalized_at
      );
      v_items := v_items || jsonb_build_object(
        'cantidad', it.q,
        'articuloCodigo', upper(it.art),
        'externalEventId', v_event,
        'movementId', v_res ->> 'movement_id',
        'movementCode', v_res ->> 'movement_code',
        'idempotent', coalesce((v_res ->> 'idempotent')::boolean, false),
        'respuesta', jsonb_build_object('ok', true, 'result', v_res,
                                        'idempotent', coalesce((v_res ->> 'idempotent')::boolean, false))
      );
    exception when others then
      v_errores := v_errores || jsonb_build_object(
        'code', 'servidor/' || sqlstate, 'message', sqlerrm,
        'cantidad', it.q, 'articuloCodigo', upper(it.art), 'externalEventId', v_event
      );
    end;
  end loop;

  v_ok := jsonb_array_length(v_errores) = 0 and jsonb_array_length(v_items) > 0;
  v_intentos := coalesce((d.mrp_traslado_detalle ->> 'intentosServidor')::int, 0) + 1;

  update public.despacho_dev_despachos
     set mrp_traslado = case when v_ok then 'ok' else 'error' end,
         mrp_traslado_at = case when v_ok then now() else mrp_traslado_at end,
         mrp_traslado_detalle = jsonb_build_object(
           'at', now(), 'ok', v_ok, 'errores', v_errores, 'movimientos', v_items,
           'origen', p_origen, 'intentoAt', now(), 'reintento', true,
           'intentosServidor', v_intentos
         )
   where id = d.id;

  return jsonb_build_object('ok', v_ok, 'despacho', d.id, 'movimientos', jsonb_array_length(v_items),
                            'errores', v_errores);
end;
$$;

-- Busca despachos finalizados sin consumo 'ok' y los procesa en orden cronológico.
create or replace function public.mrp_consume_despachos_pendientes(
  p_limit int default 50,
  p_min_edad interval default interval '5 minutes',
  p_origen text default 'respaldo-servidor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_res jsonb;
  v_ok int := 0;
  v_err int := 0;
  v_errores jsonb := '[]'::jsonb;
begin
  for r in
    select d.id
      from public.despacho_dev_despachos d
      join public.despacho_dev_mrp_tarimas_config c
        on c.tenant_id = d.tenant_id and c.company = d.company
     where d.deleted_at is null
       and d.finalized_at is not null
       and d.finalized_at < now() - p_min_edad
       and d.finalized_at > now() - interval '60 days'
       and (d.reopened_at is null or d.reopened_at < d.finalized_at)
       and coalesce(d.mrp_traslado, '') <> 'ok'
       and (coalesce(d.tarimas_s, 0) > 0 or coalesce(d.tarimas_d, 0) > 0)
       -- 12 intentos seguidos (~1 h) y después uno por hora: un error de stock se
       -- resuelve solo cuando se corrige el inventario, sin martillar cada 5 minutos.
       and (
         coalesce((d.mrp_traslado_detalle ->> 'intentosServidor')::int, 0) < 12
         or coalesce((d.mrp_traslado_detalle ->> 'at')::timestamptz, '-infinity') < now() - interval '1 hour'
       )
     order by d.finalized_at
     limit p_limit
  loop
    v_res := public.mrp_consume_despacho(r.id, p_origen);
    if (v_res ->> 'ok')::boolean then
      v_ok := v_ok + 1;
    else
      v_err := v_err + 1;
      v_errores := v_errores || jsonb_build_object('despacho', r.id, 'detalle', v_res -> 'errores');
    end if;
  end loop;
  return jsonb_build_object('procesados_ok', v_ok, 'con_error', v_err, 'errores', v_errores);
end;
$$;

-- Solo el servidor (pg_cron / service role) puede ejecutarlas.
revoke all on function public.mrp_consume_despacho(uuid, text) from public, anon, authenticated;
revoke all on function public.mrp_consume_despachos_pendientes(int, interval, text) from public, anon, authenticated;

-- Tarea programada cada 5 minutos.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'mrp-despachos-respaldo';
select cron.schedule(
  'mrp-despachos-respaldo',
  '*/5 * * * *',
  $cron$select public.mrp_consume_despachos_pendientes(50)$cron$
);
