-- ============================================================================
-- MRP Tarimas — código MANUAL opcional al crear artículo insumo
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- `mrp_create_insumo` gana `p_codigo text default null` (7º arg):
--   • p_codigo con valor → se usa tal cual (normalizado: trim + MAYÚSCULAS).
--                          Es la opción por defecto del formulario.
--   • p_codigo NULL/''  → se autogenera el correlativo AI### (comportamiento
--                          previo, sin cambios).
--
-- Se DROPEA la firma de 6 args antes de recrear para no dejar dos overloads
-- (PostgREST y plpgsql fallarían con "function is not unique"). El cliente solo
-- manda p_codigo cuando hay código manual, así que si esta migración no está
-- aplicada el alta automática sigue funcionando.
--
-- Nota sobre el correlativo: el autogenerado sale de max(codigo) sobre los que
-- casan '^AI[0-9]+$'. Si alguien teclea manualmente un código con esa forma
-- (p. ej. AI500), el siguiente automático continuará DESPUÉS de ese número. Es
-- a propósito: así el manual y el automático nunca colisionan.
-- ============================================================================

drop function if exists mrp_create_insumo(text, text, text, text, numeric, text);

create or replace function mrp_create_insumo(
  p_tenant_id  text,
  p_company    text,
  p_nombre     text,
  p_detalle    text,
  p_price      numeric,
  p_price_mode text,
  p_codigo     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next   integer;
  v_code   text;
  v_row    mrp_insumos;
  v_manual text := nullif(btrim(coalesce(p_codigo, '')), '');
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

  if v_manual is null then
    -- ------------------------------------------------------------------ AUTO
    -- Serializa la generación de código por tenant/company.
    perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|mrp_insumos'));

    select coalesce(max((substring(codigo from 3))::int), 0) + 1
      into v_next
      from mrp_insumos
      where tenant_id = p_tenant_id
        and company = p_company
        and codigo ~ '^AI[0-9]+$';

    v_code := 'AI' || lpad(v_next::text, 3, '0');
  else
    -- ---------------------------------------------------------------- MANUAL
    v_code := upper(v_manual);

    if length(v_code) > 24 then
      raise exception 'El código no puede tener más de 24 caracteres';
    end if;

    -- Debe empezar por letra o dígito; luego letras, dígitos, . _ / o -
    if v_code !~ '^[A-Z0-9][A-Z0-9._/-]*$' then
      raise exception 'Código inválido: use solo letras, números y . _ / - (sin espacios)';
    end if;

    -- Chequeo explícito para dar un mensaje claro en vez del 23505 crudo.
    -- El unique (tenant_id, company, codigo) sigue siendo la autoridad ante
    -- carreras concurrentes; ese caso se traduce en el EXCEPTION de abajo.
    if exists (
      select 1 from mrp_insumos
      where tenant_id = p_tenant_id and company = p_company and codigo = v_code
    ) then
      raise exception 'El código % ya está en uso por otro insumo', v_code;
    end if;
  end if;

  begin
    insert into mrp_insumos (tenant_id, company, codigo, nombre, detalle, price, price_mode)
    values (p_tenant_id, p_company, v_code, btrim(p_nombre),
            nullif(btrim(coalesce(p_detalle, '')), ''), p_price, p_price_mode)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'El código % ya está en uso por otro insumo', v_code;
  end;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_insumo(text, text, text, text, numeric, text, text)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verificación: debe listar UNA sola firma, la de 7 args.
-- ----------------------------------------------------------------------------
select p.oid::regprocedure as firma
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'mrp_create_insumo';
