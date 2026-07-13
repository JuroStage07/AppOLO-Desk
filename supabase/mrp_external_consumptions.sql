-- ============================================================================
-- MRP Tarimas - Consumo externo idempotente
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase despues de:
--   1) supabase/mrp_pallets.sql
--   2) supabase/mrp_pallets_articulos.sql
--   3) supabase/mrp_articulos_inventario.sql
--   4) supabase/mrp_cleanup_marca_tienda_tipo.sql
--   5) supabase/mrp_pallets_bodega_link.sql
--
-- Esta RPC es el punto de entrada para apps externas que consumen tarimas.
-- No inserta directo en inventario: usa mrp_articulo_transfer para mover stock
-- desde "almacen" hacia "tienda", deja historial en pallet_movimientos_articulo
-- y evita duplicados con external_event_id.
-- ============================================================================

create table if not exists pallet_external_consumptions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null,
  company           text not null,
  external_event_id text not null,
  bodega_id         text not null,
  warehouse_id      uuid not null references pallet_warehouses(id),
  articulo_id       uuid not null references pallet_articulos(id),
  articulo_codigo   text not null,
  quantity          integer not null check (quantity > 0),
  origin_location   text not null default 'almacen',
  destination_location text not null default 'tienda',
  reason            text,
  user_id           text not null,
  user_email        text,
  movement_id       uuid references pallet_movimientos_articulo(id),
  movement_code     text,
  task_id           uuid,
  status            text not null default 'completed'
                    check (status in ('processing', 'completed')),
  result            jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, company, external_event_id)
);

create index if not exists pallet_external_consumptions_scope_idx
  on pallet_external_consumptions (tenant_id, company, created_at desc);
create index if not exists pallet_external_consumptions_bodega_idx
  on pallet_external_consumptions (bodega_id, created_at desc);
create index if not exists pallet_external_consumptions_movement_idx
  on pallet_external_consumptions (movement_id);

drop trigger if exists trg_pallet_external_consumptions_updated
  on pallet_external_consumptions;
create trigger trg_pallet_external_consumptions_updated
  before update on pallet_external_consumptions
  for each row execute function mrp_set_updated_at();

create or replace function mrp_consume_tarimas_external(
  p_tenant_id text,
  p_company text,
  p_external_event_id text,
  p_bodega_id text,
  p_articulo_codigo text,
  p_quantity integer,
  p_reason text,
  p_user_id text,
  p_user_email text
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
  if v_tenant_id = '' then
    raise exception 'tenant_id es obligatorio';
  end if;
  if v_company = '' then
    raise exception 'company es obligatorio';
  end if;
  if v_external_event_id = '' then
    raise exception 'external_event_id es obligatorio';
  end if;
  if v_bodega_id = '' then
    raise exception 'bodega_id es obligatorio';
  end if;
  if v_articulo_codigo = '' then
    raise exception 'articulo_codigo es obligatorio';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a 0';
  end if;
  if v_user_id = '' then
    raise exception 'user_id es obligatorio';
  end if;

  select id, name
    into v_warehouse_id, v_warehouse_name
    from pallet_warehouses
   where tenant_id = v_tenant_id
     and company = v_company
     and bodega_id = v_bodega_id
     and active = true
   limit 1;

  if v_warehouse_id is null then
    raise exception 'No existe un almacen MRP activo ligado a la bodega %', v_bodega_id;
  end if;

  select id, nombre
    into v_articulo_id, v_articulo_nombre
    from pallet_articulos
   where tenant_id = v_tenant_id
     and company = v_company
     and warehouse_id = v_warehouse_id
     and upper(btrim(codigo)) = v_articulo_codigo
     and active = true
   limit 1;

  if v_articulo_id is null then
    raise exception 'No existe un articulo activo con codigo % en el almacen ligado a %',
      v_articulo_codigo, v_bodega_id;
  end if;

  insert into pallet_external_consumptions (
    tenant_id, company, external_event_id, bodega_id, warehouse_id,
    articulo_id, articulo_codigo, quantity, origin_location,
    destination_location, reason, user_id, user_email, status
  )
  values (
    v_tenant_id, v_company, v_external_event_id, v_bodega_id, v_warehouse_id,
    v_articulo_id, v_articulo_codigo, p_quantity, 'almacen',
    'tienda', v_reason, v_user_id, v_user_email, 'processing'
  )
  on conflict (tenant_id, company, external_event_id) do nothing
  returning id into v_consumption_id;

  if v_consumption_id is null then
    select *
      into v_existing
      from pallet_external_consumptions
     where tenant_id = v_tenant_id
       and company = v_company
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
       or v_existing.destination_location <> 'tienda' then
      raise exception 'El external_event_id % ya fue procesado con otro payload',
        v_external_event_id;
    end if;

    return coalesce(v_existing.result, '{}'::jsonb)
      || jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'external_event_id', v_external_event_id
      );
  end if;

  if v_reason is null then
    v_reason := 'Consumo app externa: ' || v_external_event_id;
  end if;

  v_transfer := mrp_articulo_transfer(
    v_tenant_id,
    v_company,
    v_warehouse_id,
    'almacen',
    'tienda',
    v_articulo_id,
    p_quantity,
    v_reason,
    v_user_id,
    v_user_email
  );

  v_movement_id := (v_transfer->>'movement_id')::uuid;
  v_movement_code := v_transfer->>'movement_code';
  v_task_id := (v_transfer->>'task_id')::uuid;

  update pallet_movimientos_articulo
     set metadata = coalesce(metadata, '{}'::jsonb)
       || jsonb_build_object(
            'external_consumption', true,
            'external_event_id', v_external_event_id,
            'bodega_id', v_bodega_id,
            'source', 'consumeTarimasFromExternalApp'
          )
   where id = v_movement_id;

  v_result := v_transfer
    || jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'external_event_id', v_external_event_id,
      'tenant_id', v_tenant_id,
      'company', v_company,
      'bodega_id', v_bodega_id,
      'warehouse_id', v_warehouse_id,
      'warehouse_name', v_warehouse_name,
      'articulo_id', v_articulo_id,
      'articulo_codigo', v_articulo_codigo,
      'articulo_nombre', v_articulo_nombre,
      'quantity', p_quantity,
      'origin_location', 'almacen',
      'destination_location', 'tienda'
    );

  update pallet_external_consumptions
     set status = 'completed',
         reason = v_reason,
         movement_id = v_movement_id,
         movement_code = v_movement_code,
         task_id = v_task_id,
         result = v_result
   where id = v_consumption_id;

  return v_result;
end;
$$;

alter table pallet_external_consumptions enable row level security;

drop policy if exists pallet_external_consumptions_select
  on pallet_external_consumptions;
create policy pallet_external_consumptions_select
  on pallet_external_consumptions
  for select to anon, authenticated
  using (company = 'OLO');

grant select on pallet_external_consumptions to anon, authenticated;
grant execute on function mrp_consume_tarimas_external(
  text, text, text, text, text, integer, text, text, text
) to anon, authenticated;

