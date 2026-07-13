-- ============================================================================
-- MRP Tarimas — vínculo Bodega (Firebase) ↔ Almacén (pallet_warehouses)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Contexto:
--   El MRP no usa el scope tenantId+company+bodega de Firebase. En su lugar cada
--   BODEGA del catálogo Firebase (src/config/bodegas.js, p.ej. "CR-OLO-CLIRO") se
--   liga a UN almacén del MRP. Al cambiar de bodega, el módulo resuelve solo el
--   almacén ligado (ya no se selecciona a mano).
--
-- Cambios:
--   * pallet_warehouses gana la columna `bodega_id text` (id de la bodega Firebase).
--   * Índice único parcial: una bodega ↔ un solo almacén.
--   * Se AMPLÍA la RLS de pallet_warehouses de tenant_id='CR' a company='OLO'
--     para permitir bodegas/almacenes de todos los tenants (CR y VNZ). La config
--     lee/escribe vínculos de todos los tenants y el workspace resuelve el almacén
--     de la bodega activa sin importar el país.
--
-- NOTA: si además querés operar inventario/movimientos de VNZ (no solo ligar el
--   almacén), hay que ampliar igual la RLS de pallet_brands / pallet_stores /
--   pallet_inventory* / pallet_movimientos* / pallet_descartes* a company='OLO'.
--   Eso queda FUERA de este script (afecta más superficie); descomentá el bloque
--   final si lo necesitás.
-- ============================================================================

/* ------------------------------------------------- columna + unicidad 1:1 */
alter table pallet_warehouses add column if not exists bodega_id text;

create unique index if not exists pallet_warehouses_bodega_uniq
  on pallet_warehouses (bodega_id)
  where bodega_id is not null;

/* ------------------------------------------------- RLS: CR → todos (OLO) */
drop policy if exists pallet_warehouses_all on pallet_warehouses;
create policy pallet_warehouses_all on pallet_warehouses
  for all to anon, authenticated
  using (company = 'OLO')
  with check (company = 'OLO');

-- ----------------------------------------------------------------------------
-- OPCIONAL — habilitar operación completa de VNZ (inventario/movimientos):
-- descomentar para ampliar la RLS del resto de tablas del MRP a company='OLO'.
-- ----------------------------------------------------------------------------
-- drop policy if exists pallet_brands_all on pallet_brands;
-- create policy pallet_brands_all on pallet_brands
--   for all to anon, authenticated using (company='OLO') with check (company='OLO');
-- drop policy if exists pallet_stores_all on pallet_stores;
-- create policy pallet_stores_all on pallet_stores
--   for all to anon, authenticated using (company='OLO') with check (company='OLO');
-- ============================================================================
