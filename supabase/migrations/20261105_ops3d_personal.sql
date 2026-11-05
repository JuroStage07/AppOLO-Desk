-- Proceso 3D de SRO: personal en sitio (reloj BIT2 de OLO / bodega CR-OLO-CLIRO).
-- Contrato: SRO/docs/integracion-appolo-proceso3d.md §1d.
--
-- Escribe: bit2-api (red interna de OLO) cada 60 s con la llave de servicio.
-- Lee:     Edge Function ops-3d-snapshot (?personal=1) con la llave de servicio.
-- anon / authenticated no tienen acceso: RLS activo sin políticas + revoke.
-- Nunca se guarda la cédula (codeEmployee de BIT2) ni datos de horas extra.

-- ── 1. Presencia del día, una fila por persona ───────────────────────────────
create table if not exists public.ops3d_personal_dia (
  fecha           date        not null,               -- día en America/Costa_Rica
  id_employee     text        not null,               -- employees.id de BIT2 (no la cédula)
  nombre          text        not null,
  puesto          text,
  departamento    text,
  escala          text        not null check (escala in ('gerente', 'coordinador', 'colaborador')),
  coordinador     text        not null,               -- texto para agrupar ("Sin coordinador" si no aplica)
  gerente         text        not null,               -- texto para agrupar ("Sin gerente" si no aplica)
  entrada         timestamptz,                         -- primera marca del día
  salida          timestamptz,                         -- última marca si el número de marcas es par; null = sigue en sitio
  marcas          timestamptz[] not null default '{}', -- marcas del día sin las dobles (≤ 2 min)
  horario_entrada text        check (horario_entrada ~ '^[0-2][0-9]:[0-5][0-9]$'),
  horario_salida  text        check (horario_salida  ~ '^[0-2][0-9]:[0-5][0-9]$'),
  machine_no      smallint,                            -- reloj de la última marca (GLogs.machineNo)
  bodega_id       text        not null,
  updated_at      timestamptz not null default now(),
  primary key (fecha, id_employee)
);

create index if not exists ops3d_personal_dia_bodega_fecha on public.ops3d_personal_dia (bodega_id, fecha);

comment on table public.ops3d_personal_dia is
  'Proceso 3D de SRO: personal marcado hoy en el reloj BIT2 (bodega CR-OLO-CLIRO). Lo escribe bit2-api; lo lee ops-3d-snapshot. Sin cédulas.';

-- ── 2. Estado de la sincronización, una fila por bodega ──────────────────────
create table if not exists public.ops3d_personal_sync (
  bodega_id    text primary key,
  ultima_sync  timestamptz,  -- última vuelta exitosa de bit2-api
  marcas_hasta timestamptz,  -- cuándo entró a GLogs la última marca (última descarga del reloj)
  ultimo_error text,         -- null si la última vuelta salió bien
  error_at     timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.ops3d_personal_sync is
  'Proceso 3D de SRO: frescura de ops3d_personal_dia (ultima_sync de bit2-api y marcas_hasta del reloj BIT2).';

-- ── 3. Acceso: solo service role ─────────────────────────────────────────────
alter table public.ops3d_personal_dia  enable row level security;
alter table public.ops3d_personal_sync enable row level security;
-- Sin políticas: anon y authenticated no ven ni escriben nada. El revoke es defensa extra.
revoke all on public.ops3d_personal_dia  from anon, authenticated;
revoke all on public.ops3d_personal_sync from anon, authenticated;
grant select, insert, update, delete on public.ops3d_personal_dia  to service_role;
grant select, insert, update, delete on public.ops3d_personal_sync to service_role;

-- ── 4. Aviso al canal del 3D ─────────────────────────────────────────────────
-- bit2-api lo llama una vez por vuelta, solo si cambió alguna persona (no un
-- trigger por fila: serían decenas de avisos por minuto). Mismo canal y evento que
-- los despachos (20261103_ops3d_etapa_a.sql); payload sin datos personales.
create or replace function public.ops3d_notify_personal(p_bodega text, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bodega is null or p_bodega = '' then
    return;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('entity', 'personal', 'id', p_fecha::text, 'at', now()),
      'change',
      'ops3d:' || p_bodega,
      true  -- canal privado
    );
  exception when others then
    raise warning 'ops3d_notify_personal: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.ops3d_notify_personal(text, date) from public, anon, authenticated;
grant execute on function public.ops3d_notify_personal(text, date) to service_role;
