-- Integración AppOLO → SRO Proceso 3D (contrato v1, etapa A: despachos).
-- Contrato: SRO/docs/integracion-appolo-proceso3d.md
--
-- 1. Equivalencia almacén SRO → bodega AppOLO (la usa la Edge Function
--    ops-3d-snapshot con service role; sin acceso para anon/authenticated).
-- 2. Avisos en tiempo real: broadcast privado al canal "ops3d:<bodega_id>" cuando
--    cambia un despacho o su acomodo. Solo { entity, id, at }: sin datos.
-- 3. Política de lectura del canal: solo un token cuyo claim ops3d_channel
--    coincida con el canal. (Hoy la función no emite ese token porque el proyecto
--    firma con llaves ES256; SRO consulta cada 2 min. Queda listo para cuando se emita.)
-- Es solo lectura respecto de los datos de despacho: no modifica filas existentes.

-- ── 1. Equivalencia ──────────────────────────────────────────────────────────
create table if not exists public.ops3d_bodega_sro (
  sro_warehouse_id uuid primary key,
  bodega_id        text not null,
  nombre           text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.ops3d_bodega_sro is
  'Proceso 3D de SRO: almacén de SRO (warehouses.id) → bodega_id de AppOLO. Lo lee ops-3d-snapshot.';

alter table public.ops3d_bodega_sro enable row level security;
-- Sin políticas: solo service role (la Edge Function) puede leerla.

insert into public.ops3d_bodega_sro (sro_warehouse_id, bodega_id, nombre) values
  ('9d0ed657-f928-4d6d-a4c4-524483c14038', 'CR-OLO-CLIRO',      'OLO (CLIRO)'),
  ('5026e93b-821a-4ff8-9c95-dcd1246b9729', 'CR-OLO-ELCOCO',     'EL COCO'),
  ('0cd760c5-7d31-4f9e-b45c-17138e9ad8b4', 'VNZ-OLO-SANDIEGO',  'SAN DIEGO'),
  ('b821c165-fc15-4ddc-b553-0c6a704dc4cf', 'VNZ-OLO-MICHELENA', 'AVENIDA MICHELENA')
on conflict (sro_warehouse_id) do nothing;

-- ── 2. Avisos ────────────────────────────────────────────────────────────────
create or replace function public.ops3d_notify_despacho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     text;
  v_bodega text;
begin
  if tg_table_name = 'despacho_dev_layout' then
    v_id := new.despacho_id::text;
  else
    v_id := new.id::text;
  end if;
  v_bodega := new.bodega_id;
  if v_bodega is null or v_bodega = '' then
    return new;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object('entity', 'dispatch', 'id', v_id, 'at', now()),
      'change',
      'ops3d:' || v_bodega,
      true  -- canal privado
    );
  exception when others then
    -- Un aviso que no sale nunca debe frenar el guardado del despacho.
    raise warning 'ops3d_notify_despacho: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_ops3d_despacho on public.despacho_dev_despachos;
create trigger trg_ops3d_despacho
  after insert or update on public.despacho_dev_despachos
  for each row execute function public.ops3d_notify_despacho();

drop trigger if exists trg_ops3d_layout on public.despacho_dev_layout;
create trigger trg_ops3d_layout
  after insert or update on public.despacho_dev_layout
  for each row execute function public.ops3d_notify_despacho();

-- ── 3. Lectura del canal ─────────────────────────────────────────────────────
drop policy if exists ops3d_listen on realtime.messages;
create policy ops3d_listen on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'ops3d:%'
    and (auth.jwt() ->> 'ops3d_channel') = realtime.topic()
  );
