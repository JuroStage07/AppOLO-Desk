-- ============================================================================
-- MRP Tarimas — migración: TODO se crea sobre un ALMACÉN
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente
-- (ALTER/ADD con guardas; seguro de re-ejecutar).
--
-- Cambios:
--   * pallet_brands  gana warehouse_id (FK) + unicidad (tenant, company, warehouse_id, name).
--   * pallet_stores  gana warehouse_id (FK) + unicidad (tenant, company, warehouse_id, store_number).
--
-- NOTA datos previos: las marcas/tiendas creadas antes quedan con warehouse_id
-- NULL (no se fuerza NOT NULL para no romper filas/inventario existentes). La app
-- exige almacén al crear nuevos. Asigna almacén a las filas viejas o recréalas.
-- ============================================================================

/* ----------------------------------------------------------------- MARCAS */
alter table pallet_brands add column if not exists warehouse_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pallet_brands_warehouse_fk') then
    alter table pallet_brands
      add constraint pallet_brands_warehouse_fk
      foreign key (warehouse_id) references pallet_warehouses(id);
  end if;
end $$;

alter table pallet_brands drop constraint if exists pallet_brands_tenant_id_company_name_key;

create unique index if not exists pallet_brands_uniq_wh_name
  on pallet_brands (tenant_id, company, warehouse_id, name);
create index if not exists pallet_brands_warehouse_idx
  on pallet_brands (tenant_id, company, warehouse_id);

/* ---------------------------------------------------------------- TIENDAS */
alter table pallet_stores add column if not exists warehouse_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pallet_stores_warehouse_fk') then
    alter table pallet_stores
      add constraint pallet_stores_warehouse_fk
      foreign key (warehouse_id) references pallet_warehouses(id);
  end if;
end $$;

alter table pallet_stores drop constraint if exists pallet_stores_tenant_id_company_store_number_key;

create unique index if not exists pallet_stores_uniq_wh_number
  on pallet_stores (tenant_id, company, warehouse_id, store_number);
create index if not exists pallet_stores_warehouse_idx
  on pallet_stores (tenant_id, company, warehouse_id);

-- ----------------------------------------------------------------------------
-- OPCIONAL: asignar un almacén a las marcas/tiendas demo existentes:
-- update pallet_brands b set warehouse_id = w.id
--   from pallet_warehouses w
--   where b.warehouse_id is null and w.tenant_id=b.tenant_id and w.company=b.company
--     and w.name='Almacén Central';
-- update pallet_stores s set warehouse_id = w.id
--   from pallet_warehouses w
--   where s.warehouse_id is null and w.tenant_id=s.tenant_id and w.company=s.company
--     and w.name='Almacén Central';
-- ============================================================================
