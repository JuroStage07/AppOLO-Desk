-- ============================================================================
-- Catálogo organizacional: países (tenants), compañías y almacenes (bodegas).
--
-- Fuente única de verdad del scope tenant/company/bodega que hoy está escrito a
-- mano en src/config/bodegas.js. Los IDs son los mismos que ya usan los
-- documentos de Firestore (tenantId, company, bodegaId), así que no hay que
-- migrar datos existentes.
--
-- Seguridad:
--   - Lectura pública (anon/authenticated): el catálogo no es información sensible
--     y la app lo necesita antes de que el usuario elija almacén.
--   - Sin políticas de escritura: solo la service role escribe, a través de la
--     Cloud Function `orgCatalogAdmin`, que valida en servidor que quien llama
--     tiene role = 'dev' en profiles/{uid}.
--   - Nunca se borra: se desactiva (active = false) para no romper documentos
--     históricos que referencian el ID.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================================

create table if not exists public.org_tenants (
  id          text primary key check (id ~ '^[A-Z]{2,5}$'),
  name        text not null check (length(trim(name)) between 2 and 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.org_companies (
  id          text primary key check (id ~ '^[A-Z0-9]{2,10}$'),
  name        text not null check (length(trim(name)) between 2 and 80),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.org_bodegas (
  id                text primary key,
  tenant_id         text not null references public.org_tenants (id),
  company_id        text not null references public.org_companies (id),
  code              text not null check (code ~ '^[A-Z0-9]{2,20}$'),
  name              text not null check (length(trim(name)) between 2 and 80),
  -- warehouse del sistema SRO (filtra reservas en Tareas de Apertura); opcional.
  sro_warehouse_id  uuid,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        text,
  -- El ID sigue el patrón histórico <tenant>-<company>-<CODE>.
  constraint org_bodegas_id_pattern check (id = tenant_id || '-' || company_id || '-' || code),
  constraint org_bodegas_unique_code unique (tenant_id, company_id, code)
);

create index if not exists org_bodegas_scope_idx on public.org_bodegas (tenant_id, company_id);

-- updated_at automático
create or replace function public.org_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists org_tenants_updated_at on public.org_tenants;
create trigger org_tenants_updated_at before update on public.org_tenants
  for each row execute function public.org_set_updated_at();

drop trigger if exists org_companies_updated_at on public.org_companies;
create trigger org_companies_updated_at before update on public.org_companies
  for each row execute function public.org_set_updated_at();

drop trigger if exists org_bodegas_updated_at on public.org_bodegas;
create trigger org_bodegas_updated_at before update on public.org_bodegas
  for each row execute function public.org_set_updated_at();

-- RLS: solo lectura para clientes; la service role (Cloud Function) bypassa RLS.
alter table public.org_tenants   enable row level security;
alter table public.org_companies enable row level security;
alter table public.org_bodegas   enable row level security;

drop policy if exists org_tenants_read on public.org_tenants;
create policy org_tenants_read on public.org_tenants
  for select to anon, authenticated using (true);

drop policy if exists org_companies_read on public.org_companies;
create policy org_companies_read on public.org_companies
  for select to anon, authenticated using (true);

drop policy if exists org_bodegas_read on public.org_bodegas;
create policy org_bodegas_read on public.org_bodegas
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.org_tenants, public.org_companies, public.org_bodegas from anon, authenticated;
grant select on public.org_tenants, public.org_companies, public.org_bodegas to anon, authenticated;

-- Datos iniciales = lo que hoy está en src/config/bodegas.js.
insert into public.org_tenants (id, name, updated_by) values
  ('CR',  'Costa Rica', 'migracion-inicial'),
  ('VNZ', 'Venezuela',  'migracion-inicial')
on conflict (id) do nothing;

insert into public.org_companies (id, name, updated_by) values
  ('OLO', 'OLO', 'migracion-inicial')
on conflict (id) do nothing;

insert into public.org_bodegas (id, tenant_id, company_id, code, name, sro_warehouse_id, updated_by) values
  ('CR-OLO-CLIRO',      'CR',  'OLO', 'CLIRO',     'CLIRO',     '9d0ed657-f928-4d6d-a4c4-524483c14038', 'migracion-inicial'),
  ('CR-OLO-ELCOCO',     'CR',  'OLO', 'ELCOCO',    'El Coco',   '5026e93b-821a-4ff8-9c95-dcd1246b9729', 'migracion-inicial'),
  ('VNZ-OLO-SANDIEGO',  'VNZ', 'OLO', 'SANDIEGO',  'San Diego', '0cd760c5-7d31-4f9e-b45c-17138e9ad8b4', 'migracion-inicial'),
  ('VNZ-OLO-MICHELENA', 'VNZ', 'OLO', 'MICHELENA', 'Michelena', 'b821c165-fc15-4ddc-b553-0c6a704dc4cf', 'migracion-inicial')
on conflict (id) do nothing;
