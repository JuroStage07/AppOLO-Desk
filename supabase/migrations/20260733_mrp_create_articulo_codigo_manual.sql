-- ============================================================================
-- MRP Tarimas — código MANUAL opcional al crear artículo
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- `mrp_create_articulo` gana `p_codigo text default null` (6º arg):
--   • p_codigo NULL/''  → se autogenera el correlativo A#### (comportamiento
--                         actual, sin cambios).
--   • p_codigo con valor → se usa tal cual (normalizado: trim + MAYÚSCULAS).
--
-- Se DROPEA la firma de 5 args antes de recrear para no dejar dos overloads
-- (PostgREST y plpgsql fallarían con "function is not unique"). Las llamadas de
-- 4 args existentes —p. ej. mrp_articulo_warehouse_transfer, que auto-crea el
-- artículo en el almacén destino— siguen resolviéndose por los DEFAULT.
--
-- Nota sobre el correlativo: el autogenerado sale de max(codigo) sobre los que
-- casan '^A[0-9]+$'. Si alguien teclea manualmente un código con esa forma
-- (p. ej. A0500), el siguiente automático continuará DESPUÉS de ese número. Es
-- a propósito: así el manual y el automático nunca colisionan.
-- ============================================================================

drop function if exists mrp_create_articulo(text, text, uuid, text, uuid);

create or replace function mrp_create_articulo(
  p_tenant_id    text,
  p_company      text,
  p_warehouse_id uuid,
  p_nombre       text,
  p_cliente_id   uuid default null,
  p_codigo       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next int;
  v_code text;
  v_row  pallet_articulos;
  v_manual text := nullif(btrim(coalesce(p_codigo, '')), '');
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del artículo es obligatorio';
  end if;

  if v_manual is null then
    -- ------------------------------------------------------------------ AUTO
    -- Serializa la generación de código por tenant/company.
    perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|articulos'));

    select coalesce(max((substring(codigo from 2))::int), -1) + 1
      into v_next
      from pallet_articulos
      where tenant_id = p_tenant_id
        and company = p_company
        and codigo ~ '^A[0-9]+$';

    v_code := 'A' || lpad(v_next::text, 4, '0');
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
      select 1 from pallet_articulos
      where tenant_id = p_tenant_id and company = p_company and codigo = v_code
    ) then
      raise exception 'El código % ya está en uso por otro artículo', v_code;
    end if;
  end if;

  begin
    insert into pallet_articulos (tenant_id, company, warehouse_id, codigo, nombre, cliente_id)
    values (p_tenant_id, p_company, p_warehouse_id, v_code, btrim(p_nombre), p_cliente_id)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'El código % ya está en uso por otro artículo', v_code;
  end;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_articulo(text, text, uuid, text, uuid, text)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verificación: debe listar UNA sola firma, la de 6 args.
-- ----------------------------------------------------------------------------
select p.oid::regprocedure as firma
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'mrp_create_articulo';
