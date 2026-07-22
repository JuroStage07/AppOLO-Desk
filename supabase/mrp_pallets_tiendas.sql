-- ============================================================================
-- MRP Tarimas — Tiendas destino (pallet_tiendas) + tienda en el traslado
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Catálogo "Tienda Destino": cada tienda pertenece al tenant/company (NO a un
-- almacén). El código se genera automáticamente como 'TD' + 4 dígitos
-- correlativos por tenant/company (TD0001, TD0002, …).
--
-- Además: cuando un traslado tiene destino la ubicación `tienda`, se puede
-- indicar A QUÉ tienda va. La tienda se guarda en `metadata` del movimiento
-- (tienda_id + tienda_nombre). El parámetro es OPCIONAL para no romper al
-- consumidor de la app externa (que hoy llama con 10 args y sin tienda); la
-- obligatoriedad se aplica en la UI (TrasladoModal). Más adelante el
-- externalAppConsumer podrá pasar también la tienda.
-- ============================================================================

create table if not exists pallet_tiendas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null,
  company    text not null,
  codigo     text not null,
  nombre     text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, company, codigo)
);

create index if not exists pallet_tiendas_scope_idx
  on pallet_tiendas (tenant_id, company);

-- Trigger updated_at (reutiliza la función del esquema base).
drop trigger if exists trg_pallet_tiendas_updated on pallet_tiendas;
create trigger trg_pallet_tiendas_updated before update on pallet_tiendas
  for each row execute function mrp_set_updated_at();

-- Alta con código autogenerado correlativo (TD0001, TD0002, …).
create or replace function mrp_create_tienda(
  p_tenant_id text,
  p_company   text,
  p_nombre    text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
  v_code text;
  v_row  pallet_tiendas;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre de la tienda es obligatorio';
  end if;

  -- Serializa la generación de código por tenant/company.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || '|' || p_company || '|tiendas'));

  select coalesce(max((substring(codigo from 3))::int), 0) + 1
    into v_next
    from pallet_tiendas
    where tenant_id = p_tenant_id
      and company = p_company
      and codigo ~ '^TD[0-9]+$';

  v_code := 'TD' || lpad(v_next::text, 4, '0');

  insert into pallet_tiendas (tenant_id, company, codigo, nombre)
  values (p_tenant_id, p_company, v_code, btrim(p_nombre))
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function mrp_create_tienda(text, text, text) to anon, authenticated;

-- RLS (scoping básico por tenant/company).
alter table pallet_tiendas enable row level security;
drop policy if exists pallet_tiendas_all on pallet_tiendas;
create policy pallet_tiendas_all on pallet_tiendas
  for all to anon, authenticated
  using (tenant_id = 'CR' and company = 'OLO')
  with check (tenant_id = 'CR' and company = 'OLO');

-- ----------------------------------------------------------------------------
-- Traslado entre ubicaciones + tienda destino OPCIONAL.
-- Se recrea la función añadiendo `p_tienda_id` con DEFAULT NULL al final, de
-- modo que las llamadas existentes de 10 args (p.ej. el externalAppConsumer en
-- mrp_external_consumptions.sql) siguen funcionando por el valor por defecto.
-- ----------------------------------------------------------------------------
drop function if exists mrp_articulo_transfer(
  text, text, uuid, text, text, uuid, integer, text, text, text
);

create or replace function mrp_articulo_transfer(
  p_tenant_id text, p_company text, p_warehouse_id uuid,
  p_origin_location text, p_destination_location text,
  p_articulo_id uuid, p_quantity integer, p_reason text,
  p_user_id text, p_user_email text,
  p_tienda_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_mid uuid;
  v_task uuid;
  v_meta jsonb := null;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_origin_location = p_destination_location then
    raise exception 'El origen y el destino no pueden ser iguales'; end if;

  v_task := gen_random_uuid();

  -- Tienda destino (opcional): se sella en metadata para consumo posterior.
  if p_tienda_id is not null then
    v_meta := jsonb_build_object(
      'tienda_id', p_tienda_id,
      'tienda_nombre', (select nombre from pallet_tiendas t where t.id = p_tienda_id)
    );
  end if;

  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_origin_location, p_articulo_id, -p_quantity);
  perform mrp_apply_articulo_stock_delta(p_tenant_id, p_company, p_warehouse_id, p_destination_location, p_articulo_id, p_quantity);

  v_code := mrp_next_movement_code();
  insert into pallet_movimientos_articulo(movement_code, task_id, tenant_id, company, warehouse_id, movement_type,
                                          origin_location, destination_location, articulo_id, quantity, reason, user_id, user_email, metadata)
  values (v_code, v_task, p_tenant_id, p_company, p_warehouse_id, 'traslado',
          p_origin_location, p_destination_location, p_articulo_id, p_quantity,
          nullif(btrim(coalesce(p_reason,'')), ''), p_user_id, p_user_email, v_meta)
  returning id into v_mid;

  return jsonb_build_object('movement_id', v_mid, 'movement_code', v_code, 'task_id', v_task);
end;
$$;

grant execute on function mrp_articulo_transfer(text,text,uuid,text,text,uuid,integer,text,text,text,uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- TEARDOWN OPCIONAL (no ejecutar salvo que quieras borrar tiendas):
-- drop function if exists mrp_create_tienda(text,text,text);
-- drop table if exists pallet_tiendas cascade;
-- ============================================================================
