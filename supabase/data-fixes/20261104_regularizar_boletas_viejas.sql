-- Regularización 04/11/2026 — boletas viejas pegadas en "pendiente_validacion".
--
-- Contexto: antes de arrancar el Registro de salida en casetilla quedaban 11
-- boletas de agosto/septiembre que nadie validó. Ese día se probó el flujo en la
-- app con dos de ellas (de prueba, chofer "Justin Campos"):
--   BS-000043 → validada en la app (checklist + firma "PRUEBA") → despachado.
--   BS-000046 → rechazada en la app (motivo "PRUEBA de rechazo …") → rechazado.
-- Las 9 restantes se cierran como regularización: sin firma ni checklist (no se
-- firma a nombre de choferes reales), con la nota en checklist.regularizacion.
-- No se tocan las recientes (BS-000047 y posteriores): las valida operación.

do $$
declare
  c_actor constant uuid := 'c1ee39ef-4ef0-47fd-9c16-c8488361384a'; -- aplicacionesolo@ologistics.com
  c_nota  constant text := 'Regularización 04/11/2026: boleta antigua sin validar en casetilla; cerrada sin checklist ni firma antes de arrancar el Registro de salida.';
  c_nums  constant text[] := array['BS-000032','BS-000035','BS-000036','BS-000037','BS-000038','BS-000039','BS-000040','BS-000042','BS-000045'];
  n int;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', c_actor, 'role', 'authenticated', 'email', 'aplicacionesolo@ologistics.com',
                      'tenant_id', 'CR', 'company', 'OLO', 'bodega_id', 'CR-OLO-CLIRO')::text,
    true
  );

  create temp table _bol on commit drop as
    select id, despacho_id, numero_formateado, tenant_id, company, bodega_id
      from public.despacho_dev_boletas
     where numero_formateado = any (c_nums) and estado = 'pendiente_validacion';

  select count(*) into n from _bol;
  if n <> array_length(c_nums, 1) then
    raise exception 'Se esperaban % boletas pendientes y hay %; no se aplica nada.', array_length(c_nums, 1), n;
  end if;

  update public.despacho_dev_boletas b
     set estado = 'despachado',
         checklist = jsonb_build_object('regularizacion', c_nota),
         validated_by = c_actor,
         validated_at = now()
    from _bol x where b.id = x.id;

  update public.despacho_dev_despachos d
     set estado = 'despachado', estado_motivo = c_nota, updated_by = c_actor
    from _bol x where d.id = x.despacho_id and d.estado = 'pendiente_validacion';

  perform public.dd_registrar_actividad(
           x.tenant_id, x.company, x.bodega_id, 'boleta', x.id, 'boleta_validada',
           'Boleta ' || x.numero_formateado || ' cerrada por regularización',
           jsonb_build_object('numero', x.numero_formateado, 'regularizacion', true, 'nota', c_nota))
    from _bol x;

  raise notice 'Regularizadas: % boletas.', n;
end $$;
