-- Regularización masiva 04/11/2026 — despachos pegados en "chofer_pendiente".
--
-- Contexto: casi ningún despacho tenía chofer asignado al finalizar, así que no
-- se generaba la boleta de salida y quedaban en "chofer_pendiente" para siempre
-- (463 en CR-OLO-CLIRO, del 13/08 al 03/11/2026). Decisión del usuario:
-- asignarles el chofer "Justin Campos" (placa F170505) y cerrarlos en "despachado".
--
-- Cómo:
--   1. Asignación de chofer con la MISMA función que usa la app (dd_asignar_chofer):
--      pasa el despacho a "completo" y genera la boleta con su consecutivo.
--      Se simula la sesión de aplicacionesolo con el scope de CLIRO para que la
--      función valide el scope y deje trazado quién lo hizo.
--   2. Validación como REGULARIZACIÓN: dd_validar_boleta exige firma y checklist
--      en "sí"; no se inventa ninguno de los dos. La boleta queda "despachado" sin
--      firma, con la nota en `checklist` y validated_by explícito.
--   3. Bitácora: actividad "boleta_validada" (dd_registrar_actividad) con
--      detalle.regularizacion = true.
--   La secuencia de boletas se alinea primero al último número emitido: un
--   intento fallido anterior (rollback) consumió números que nunca se emitieron.
--
-- Todo en un solo bloque: si algo falla, no se aplica nada.

do $$
declare
  c_chofer  constant uuid := 'b9381f04-ca84-469d-a730-21cd04ee6fdf'; -- Justin Campos · F170505
  c_actor   constant uuid := 'c1ee39ef-4ef0-47fd-9c16-c8488361384a'; -- aplicacionesolo@ologistics.com
  c_nota    constant text := 'Regularización masiva 04/11/2026: chofer asignado y cierre sin checklist ni firma (despacho pegado en chofer pendiente).';
  r         record;
  v_res     jsonb;
  n_asig    int := 0;
  n_val     int := 0;
begin
  perform setval('public.despacho_dev_boleta_seq', (select coalesce(max(numero), 0) from public.despacho_dev_boletas));

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', c_actor, 'role', 'authenticated', 'email', 'aplicacionesolo@ologistics.com',
      'tenant_id', 'CR', 'company', 'OLO', 'bodega_id', 'CR-OLO-CLIRO'
    )::text,
    true
  );

  create temp table _regularizados (despacho_id uuid primary key, boleta_id uuid) on commit drop;

  for r in
    select id from public.despacho_dev_despachos
     where estado = 'chofer_pendiente' and deleted_at is null and bodega_id = 'CR-OLO-CLIRO'
     order by fecha
  loop
    v_res := public.dd_asignar_chofer(r.id, c_chofer);
    insert into _regularizados values (r.id, nullif(v_res ->> 'boletaId', '')::uuid);
    n_asig := n_asig + 1;
  end loop;

  if exists (select 1 from _regularizados where boleta_id is null) then
    raise exception 'Algún despacho no generó boleta; no se aplica nada.';
  end if;

  update public.despacho_dev_boletas b
     set estado = 'despachado',
         checklist = jsonb_build_object('regularizacion', c_nota),
         validated_by = c_actor, -- aplicacionesolo; la nota va en checklist.regularizacion
         validated_at = now()
    from _regularizados x
   where b.id = x.boleta_id and b.estado = 'pendiente_validacion';
  get diagnostics n_val = row_count;

  update public.despacho_dev_despachos d
     set estado = 'despachado', estado_motivo = c_nota, updated_by = c_actor
    from _regularizados x
   where d.id = x.despacho_id;

  perform public.dd_registrar_actividad(
           b.tenant_id, b.company, b.bodega_id, 'boleta', b.id, 'boleta_validada',
           'Boleta ' || b.numero_formateado || ' validada por regularización masiva',
           jsonb_build_object('numero', b.numero_formateado, 'regularizacion', true, 'nota', c_nota, 'despacho_id', b.despacho_id))
    from public.despacho_dev_boletas b
    join _regularizados x on x.boleta_id = b.id;

  if n_val <> n_asig then
    raise exception 'Validadas % de % boletas; no se aplica nada.', n_val, n_asig;
  end if;

  raise notice 'Regularizados: % despachos, % boletas.', n_asig, n_val;
end $$;
