-- ============================================================================
-- Boletas de salida — RPCs para Appolo Desk (Servicios Generales)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase (proyecto AppOLO). NO DESTRUCTIVO e
-- idempotente. Las TABLAS (despacho_dev_boletas, despacho_dev_choferes,
-- despacho_dev_actividad) ya existen; este archivo (re)crea la SECUENCIA del
-- consecutivo y las funciones SECURITY DEFINER de escritura.
--
-- DIFERENCIA CLAVE con el sistema de referencia:
--   El sistema original resuelve el scope desde los claims del JWT
--   (dd_tenant_id()/dd_company()/dd_bodega_id()). Appolo Desk NO usa Supabase
--   Auth: opera con la clave anónima y pasa tenant/company/bodega como
--   PARÁMETROS EXPLÍCITOS a cada RPC (igual que las funciones mrp_*). Por eso
--   estas funciones reciben p_tenant_id / p_company / p_bodega_id y validan el
--   scope contra los parámetros, no contra el JWT. Se otorga execute a
--   anon + authenticated, siguiendo el patrón vigente del repo.
--
-- Estados de la boleta: 'pendiente_validacion' -> ('despachado'|'rechazado'|'anulada')
-- ============================================================================

-- Consecutivo global de boletas: numero -> 'BS-' || lpad(numero, 6, '0').
create sequence if not exists despacho_dev_boleta_seq;

-- ----------------------------------------------------------------------------
-- Guard de scope: exige los tres campos no vacíos.
-- Nombre propio (dd_boletas_exigir_scope) para NO colisionar con el
-- dd_exigir_scope preexistente del sistema de referencia (basado en JWT),
-- que puede seguir usándose por las boletas nacidas de un despacho.
-- ----------------------------------------------------------------------------
create or replace function dd_boletas_exigir_scope(
  p_tenant_id text,
  p_company   text,
  p_bodega_id text
) returns void
language plpgsql immutable as $$
begin
  if coalesce(btrim(p_tenant_id), '') = ''
     or coalesce(btrim(p_company), '') = ''
     or coalesce(btrim(p_bodega_id), '') = '' then
    raise exception 'Scope incompleto: tenant/company/bodega son obligatorios';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Generar boleta MANUAL (sin despacho de origen).
-- ----------------------------------------------------------------------------
-- Se crea como SOBRECARGA (firma con scope explícito). No se elimina la versión
-- basada en JWT que pudiera existir: conviven y PostgREST resuelve por los
-- nombres de parámetros enviados desde el frontend.
create or replace function dd_generar_boleta_manual(
  p_tenant_id text,
  p_company   text,
  p_bodega_id text,
  p_created_by text,
  p_payload   jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tipo      text;
  v_cargado   boolean;
  v_destino   text;
  v_marchamo  text;
  v_placa     text;
  v_placa_cont text;
  v_numero    bigint;
  v_numero_fmt text;
  v_snapshot  jsonb;
  v_chofer_id uuid;
  v_row       despacho_dev_boletas;
begin
  perform dd_boletas_exigir_scope(p_tenant_id, p_company, p_bodega_id);
  if p_payload is null then
    raise exception 'Payload vacío';
  end if;

  v_tipo    := lower(btrim(coalesce(p_payload->>'tipoVehiculo', '')));
  v_cargado := coalesce((p_payload->>'cargado')::boolean, false);
  v_destino := nullif(btrim(coalesce(p_payload->>'destino', '')), '');
  v_placa   := nullif(btrim(coalesce(p_payload->>'placaCamion', '')), '');
  v_placa_cont := nullif(btrim(coalesce(p_payload->>'placaContenedor', '')), '');

  -- Reglas de negocio (espejo de la UI):
  if v_tipo not in ('camion', 'plataforma', 'furgon') then
    raise exception 'Tipo de vehículo inválido: %', v_tipo;
  end if;
  if v_placa is null then
    raise exception 'La placa del camión es obligatoria';
  end if;
  if v_tipo = 'furgon' then
    if v_placa_cont is null then
      raise exception 'El furgón exige placa de contenedor';
    end if;
  else
    -- Los demás tipos NO llevan contenedor.
    v_placa_cont := null;
  end if;
  if v_cargado then
    if v_destino is null then
      raise exception 'El destino es obligatorio cuando el vehículo va cargado';
    end if;
    v_marchamo := coalesce(nullif(btrim(coalesce(p_payload->>'marchamo', '')), ''), 'N/A');
  else
    -- El marchamo solo aplica si va cargado.
    v_marchamo := 'N/A';
    v_destino  := null;
  end if;

  v_chofer_id := nullif(btrim(coalesce(p_payload->>'choferId', '')), '')::uuid;

  -- Consecutivo global.
  v_numero := nextval('despacho_dev_boleta_seq');
  v_numero_fmt := 'BS-' || lpad(v_numero::text, 6, '0');

  -- Snapshot inmutable con la forma estable (misma que boletas de despacho).
  v_snapshot := jsonb_build_object(
    'despacho', jsonb_build_object(
      'id', null,
      'referencia', '',
      'tienda', '',
      'placa', coalesce(v_placa, ''),
      'marchamo', coalesce(v_marchamo, ''),
      'puerta', '',
      'placaContenedor', coalesce(v_placa_cont, ''),
      'transportista', coalesce(p_payload->>'compania', ''),
      'tarimasS', 0,
      'tarimasD', 0,
      'fecha', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'estado', 'manual'
    ),
    'chofer', jsonb_build_object(
      'id', v_chofer_id,
      'nombre', coalesce(p_payload->>'choferNombre', ''),
      'cedula', coalesce(p_payload->>'choferCedula', ''),
      'placaCamion', coalesce(v_placa, ''),
      'placaContenedor', coalesce(v_placa_cont, ''),
      'cedulaFotoPath', nullif(btrim(coalesce(p_payload->>'cedulaFotoPath', '')), ''),
      'compania', coalesce(p_payload->>'compania', '')
    ),
    'manual', jsonb_build_object(
      'tipoVehiculo', v_tipo,
      'cargado', v_cargado,
      'destino', coalesce(v_destino, '')
    ),
    'generadoEn', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  insert into despacho_dev_boletas (
    tenant_id, company, bodega_id, despacho_id,
    numero, numero_formateado, estado, snapshot,
    despacho_referencia, chofer_nombre, chofer_cedula,
    placa_camion, placa_contenedor,
    origen, tipo_vehiculo, cargado, destino, marchamo,
    created_by, created_at, updated_at
  ) values (
    p_tenant_id, p_company, p_bodega_id, null,
    v_numero, v_numero_fmt, 'pendiente_validacion', v_snapshot,
    null, coalesce(p_payload->>'choferNombre', ''), coalesce(p_payload->>'choferCedula', ''),
    v_placa, v_placa_cont,
    'manual', v_tipo, v_cargado, v_destino, v_marchamo,
    nullif(btrim(coalesce(p_created_by, '')), ''), now(), now()
  ) returning * into v_row;

  -- Log de actividad (best-effort: no bloquea la generación si el esquema difiere).
  begin
    insert into despacho_dev_actividad (
      tenant_id, company, bodega_id, boleta_id, tipo, detalle, created_by, created_at
    ) values (
      p_tenant_id, p_company, p_bodega_id, v_row.id, 'boleta_generada',
      jsonb_build_object('numero', v_numero_fmt, 'origen', 'manual'),
      nullif(btrim(coalesce(p_created_by, '')), ''), now()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'boletaId', v_row.id,
    'numero', v_numero,
    'numeroFormateado', v_numero_fmt,
    'estado', v_row.estado
  );
end;
$$;

revoke all on function dd_generar_boleta_manual(text, text, text, text, jsonb) from public;
grant execute on function dd_generar_boleta_manual(text, text, text, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Validar boleta (checklist completo en 'si' + firma). Sirve para ambos orígenes.
-- ----------------------------------------------------------------------------
create or replace function dd_validar_boleta(
  p_tenant_id  text,
  p_company    text,
  p_bodega_id  text,
  p_boleta_id  uuid,
  p_checklist  jsonb,
  p_firma_path text,
  p_validated_by text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row   despacho_dev_boletas;
  v_val   text;
  v_count integer := 0;
begin
  perform dd_boletas_exigir_scope(p_tenant_id, p_company, p_bodega_id);

  select * into v_row
    from despacho_dev_boletas
    where id = p_boleta_id
      and tenant_id = p_tenant_id
      and company = p_company
      and bodega_id = p_bodega_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Boleta no encontrada en el scope actual';
  end if;
  if v_row.estado <> 'pendiente_validacion' then
    raise exception 'La boleta no está pendiente de validación (estado: %)', v_row.estado;
  end if;

  -- Firma obligatoria.
  if coalesce(btrim(p_firma_path), '') = '' then
    raise exception 'La firma es obligatoria para validar';
  end if;

  -- Checklist: debe existir y TODAS las respuestas ser 'si' (case-insensitive).
  if p_checklist is null or jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'El checklist es obligatorio';
  end if;
  for v_val in select value::text from jsonb_each_text(p_checklist)
  loop
    v_count := v_count + 1;
    if lower(btrim(v_val)) <> 'si' then
      raise exception 'Todas las respuestas del checklist deben ser "sí"';
    end if;
  end loop;
  if v_count = 0 then
    raise exception 'El checklist no puede estar vacío';
  end if;

  update despacho_dev_boletas
     set estado = 'despachado',
         checklist = p_checklist,
         firma_path = btrim(p_firma_path),
         validated_by = nullif(btrim(coalesce(p_validated_by, '')), ''),
         validated_at = now(),
         updated_at = now()
   where id = p_boleta_id
   returning * into v_row;

  -- Si la boleta nació de un despacho, avanzar el despacho (inofensivo si NULL).
  if v_row.despacho_id is not null then
    begin
      update despacho_dev_despachos
         set estado = 'despachado', updated_at = now()
       where id = v_row.despacho_id;
    exception when others then
      null;
    end;
  end if;

  begin
    insert into despacho_dev_actividad (
      tenant_id, company, bodega_id, boleta_id, tipo, detalle, created_by, created_at
    ) values (
      p_tenant_id, p_company, p_bodega_id, v_row.id, 'boleta_validada',
      jsonb_build_object('numero', v_row.numero_formateado),
      nullif(btrim(coalesce(p_validated_by, '')), ''), now()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('boletaId', v_row.id, 'estado', v_row.estado);
end;
$$;

revoke all on function dd_validar_boleta(text, text, text, uuid, jsonb, text, text) from public;
grant execute on function dd_validar_boleta(text, text, text, uuid, jsonb, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Rechazar boleta (motivo >= 10 caracteres).
-- ----------------------------------------------------------------------------
create or replace function dd_rechazar_boleta(
  p_tenant_id text,
  p_company   text,
  p_bodega_id text,
  p_boleta_id uuid,
  p_motivo    text,
  p_rejected_by text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row despacho_dev_boletas;
begin
  perform dd_boletas_exigir_scope(p_tenant_id, p_company, p_bodega_id);

  if coalesce(char_length(btrim(p_motivo)), 0) < 10 then
    raise exception 'El motivo de rechazo debe tener al menos 10 caracteres';
  end if;

  select * into v_row
    from despacho_dev_boletas
    where id = p_boleta_id
      and tenant_id = p_tenant_id
      and company = p_company
      and bodega_id = p_bodega_id
      and deleted_at is null
    for update;

  if not found then
    raise exception 'Boleta no encontrada en el scope actual';
  end if;
  if v_row.estado <> 'pendiente_validacion' then
    raise exception 'La boleta no está pendiente de validación (estado: %)', v_row.estado;
  end if;

  update despacho_dev_boletas
     set estado = 'rechazado',
         rechazo_motivo = btrim(p_motivo),
         rejected_by = nullif(btrim(coalesce(p_rejected_by, '')), ''),
         rejected_at = now(),
         updated_at = now()
   where id = p_boleta_id
   returning * into v_row;

  begin
    insert into despacho_dev_actividad (
      tenant_id, company, bodega_id, boleta_id, tipo, detalle, created_by, created_at
    ) values (
      p_tenant_id, p_company, p_bodega_id, v_row.id, 'boleta_rechazada',
      jsonb_build_object('numero', v_row.numero_formateado, 'motivo', btrim(p_motivo)),
      nullif(btrim(coalesce(p_rejected_by, '')), ''), now()
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('boletaId', v_row.id, 'estado', v_row.estado);
end;
$$;

revoke all on function dd_rechazar_boleta(text, text, text, uuid, text, text) from public;
grant execute on function dd_rechazar_boleta(text, text, text, uuid, text, text) to anon, authenticated;

-- ============================================================================
-- STORAGE (bucket privado 'despacho-dev-fotos')
-- ----------------------------------------------------------------------------
-- Rutas con prefijo {tenant}/{company}/{bodega}/... Las lecturas usan signed
-- URLs. Como Appolo opera con la clave anónima, se habilita a anon+authenticated
-- sobre ese bucket. Ajustar según la política de seguridad deseada.
-- (Descomentar si aún no existen las políticas; requiere permisos sobre storage.)
--
-- drop policy if exists dd_fotos_rw on storage.objects;
-- create policy dd_fotos_rw on storage.objects
--   for all to anon, authenticated
--   using (bucket_id = 'despacho-dev-fotos')
--   with check (bucket_id = 'despacho-dev-fotos');
-- ============================================================================
