-- ============================================================================
-- MRP Tarimas — Backfill de eventos "create" para catálogos ya cargados
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO e idempotente.
--
-- Contexto: las altas de artículos (pallet_articulos), compañías
-- (pallet_clientes) y clientes/tiendas (pallet_tiendas) se hacen vía RPC
-- (mrp_create_articulo / mrp_create_cliente / mrp_create_tienda). Esas RPCs NO
-- escribían en mrp_eventos, por lo que la data real ya cargada no dejó rastro
-- en el "Registro de eventos". Este script inserta un evento `create` por cada
-- fila existente que aún no lo tenga.
--
-- Mapeo de terminología (igual que en el frontend):
--   pallet_articulos  -> entity_type = 'articulo'
--   pallet_clientes   -> entity_type = 'compania'   (UI: "Compañías")
--   pallet_tiendas    -> entity_type = 'cliente'    (UI: "Clientes"/tiendas)
--
-- Bodega en la bitácora (mrp_eventos filtra por bodega_id en la UI):
--   • Artículos: se toma la bodega de su almacén (pallet_warehouses.bodega_id).
--   • Compañías y clientes son por tenant/company (no tienen almacén): se sellan
--     con la bodega POR DEFECTO del tenant, para que sean visibles con la bodega
--     activa habitual. Ajustá el mapa `def_bodega` si tu default es otro.
--
-- Idempotencia: solo inserta si no existe ya un evento (entity_type, entity_id,
-- action='create'). Se puede re-ejecutar sin duplicar.
--
-- Nota RLS: el editor SQL corre como rol privilegiado y omite RLS, por lo que
-- también backfillea filas de VNZ aunque la policy anon/authenticated sea CR/OLO.
-- ============================================================================

-- 1) Artículos --------------------------------------------------------------
insert into mrp_eventos (
  tenant_id, company, bodega_id, bodega_nombre,
  entity_type, entity_id, entity_codigo, entity_nombre,
  action, detail, created_at
)
select
  a.tenant_id, a.company, w.bodega_id,
  coalesce(bm.nombre, w.bodega_id),
  'articulo', a.id, a.codigo, a.nombre,
  'create', 'Backfill inicial de eventos', a.created_at
from pallet_articulos a
left join pallet_warehouses w on w.id = a.warehouse_id
left join (values
  ('CR-OLO-CLIRO',    'CLIRO'),
  ('CR-OLO-ELCOCO',   'El Coco'),
  ('VNZ-OLO-SANDIEGO','San Diego'),
  ('VNZ-OLO-MICHELENA','Michelena')
) as bm(id, nombre) on bm.id = w.bodega_id
where not exists (
  select 1 from mrp_eventos e
  where e.entity_type = 'articulo' and e.entity_id = a.id and e.action = 'create'
);

-- 2) Compañías (pallet_clientes) --------------------------------------------
insert into mrp_eventos (
  tenant_id, company, bodega_id, bodega_nombre,
  entity_type, entity_id, entity_codigo, entity_nombre,
  action, detail, created_at
)
select
  c.tenant_id, c.company, db.bodega_id, db.bodega_nombre,
  'compania', c.id, c.codigo, c.nombre,
  'create', 'Backfill inicial de eventos', c.created_at
from pallet_clientes c
left join (values
  ('CR', 'CR-OLO-CLIRO',     'CLIRO'),
  ('VNZ','VNZ-OLO-SANDIEGO', 'San Diego')
) as db(tenant_id, bodega_id, bodega_nombre) on db.tenant_id = c.tenant_id
where not exists (
  select 1 from mrp_eventos e
  where e.entity_type = 'compania' and e.entity_id = c.id and e.action = 'create'
);

-- 3) Clientes / tiendas (pallet_tiendas) ------------------------------------
insert into mrp_eventos (
  tenant_id, company, bodega_id, bodega_nombre,
  entity_type, entity_id, entity_codigo, entity_nombre,
  action, detail, created_at
)
select
  t.tenant_id, t.company, db.bodega_id, db.bodega_nombre,
  'cliente', t.id, t.codigo, t.nombre,
  'create', 'Backfill inicial de eventos', t.created_at
from pallet_tiendas t
left join (values
  ('CR', 'CR-OLO-CLIRO',     'CLIRO'),
  ('VNZ','VNZ-OLO-SANDIEGO', 'San Diego')
) as db(tenant_id, bodega_id, bodega_nombre) on db.tenant_id = t.tenant_id
where not exists (
  select 1 from mrp_eventos e
  where e.entity_type = 'cliente' and e.entity_id = t.id and e.action = 'create'
);

-- ----------------------------------------------------------------------------
-- Verificación: conteo de eventos `create` por tipo de entidad tras el backfill.
-- ----------------------------------------------------------------------------
select entity_type, count(*) as eventos_create
from mrp_eventos
where action = 'create' and entity_type in ('articulo', 'compania', 'cliente')
group by entity_type
order by entity_type;
