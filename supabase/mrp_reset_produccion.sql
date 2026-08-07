-- ============================================================================
-- MRP Tarimas — RESET para arranque de PRODUCCIÓN
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase.
--
-- ⚠️⚠️ DESTRUCTIVO E IRREVERSIBLE. Borra TODOS los datos del MRP de TODOS los
--      tenants/companies/bodegas. No hay soft-delete ni papelera. Saca un
--      backup antes (Supabase Dashboard › Database › Backups) si quieres poder
--      volver atrás.
--
-- QUÉ SE BORRA (tabla rasa):
--   pallet_articulos              artículos (catálogo + stock)
--   pallet_clientes               "Compañías" en la UI (CL####)
--   pallet_tiendas                "Clientes"/tiendas en la UI (TD####)
--   pallet_inventory_articulo     saldos por almacén/ubicación/artículo/tienda
--   pallet_movimientos_articulo   historial de movimientos
--   pallet_descartes_articulo     descartes
--   pallet_external_consumptions  consumos de la app externa
--   mrp_eventos                   registro de eventos (bitácora de catálogos)
--   mrp_insumos                   insumos (AI###)
--   mrp_boms / mrp_bom_insumos    recetas (BOM###) y sus líneas
--
-- QUÉ SE CONSERVA (a propósito):
--   pallet_warehouses  almacenes — mantienen el vínculo bodega_id con las
--                      bodegas de Firebase. Si se borraran, el workspace del
--                      MRP no podría resolver el almacén de la bodega activa.
--   pallet_motivos     catálogo de motivos de traslado/descarte (configuración).
--
-- CORRELATIVOS: los códigos de catálogo (A####, CL####, TD####, AI###, BOM###)
--   se derivan de max(código existente) + 1, así que al vaciar las tablas
--   vuelven solos a A0001 / CL0001 / TD0001 / AI001 / BOM001. El código de
--   movimiento sí usa una secuencia real y se reinicia explícitamente al final.
--
-- NOTA: el MRP vive 100% en Supabase; no hay nada que limpiar en Firestore.
-- ============================================================================


-- ============================================================================
-- PASO 1 — INVENTARIO PREVIO (solo lectura). Ejecuta ESTO primero y revisa.
-- ============================================================================
select 'pallet_articulos'             as tabla, count(*) as filas from pallet_articulos
union all select 'pallet_clientes',              count(*) from pallet_clientes
union all select 'pallet_tiendas',               count(*) from pallet_tiendas
union all select 'pallet_inventory_articulo',    count(*) from pallet_inventory_articulo
union all select 'pallet_movimientos_articulo',  count(*) from pallet_movimientos_articulo
union all select 'pallet_descartes_articulo',    count(*) from pallet_descartes_articulo
union all select 'pallet_external_consumptions', count(*) from pallet_external_consumptions
union all select 'mrp_eventos',                  count(*) from mrp_eventos
union all select 'mrp_insumos',                  count(*) from mrp_insumos
union all select 'mrp_boms',                     count(*) from mrp_boms
union all select 'mrp_bom_insumos',              count(*) from mrp_bom_insumos
union all select '-- SE CONSERVA: pallet_warehouses', count(*) from pallet_warehouses
union all select '-- SE CONSERVA: pallet_motivos',    count(*) from pallet_motivos
order by 1;


-- ============================================================================
-- PASO 2 — EL BORRADO. Ejecuta este bloque cuando el PASO 1 te cuadre.
-- ----------------------------------------------------------------------------
-- Un solo TRUNCATE atómico. Se listan TODAS las tablas que referencian a las
-- demás, así que NO hace falta CASCADE: si Postgres se queja de una FK es
-- porque existe una tabla que no está contemplada aquí — lee el error en vez de
-- añadir CASCADE a ciegas.
--
-- El bloque salta las tablas que no existan en este proyecto (idempotente).
-- ============================================================================
do $$
declare
  v_tables text[] := array[
    -- Orden irrelevante en un TRUNCATE conjunto, pero se listan hijas → padres.
    'pallet_descartes_articulo',
    'pallet_external_consumptions',
    'pallet_movimientos_articulo',
    'pallet_inventory_articulo',
    'pallet_tiendas',
    'pallet_articulos',
    'pallet_clientes',
    'mrp_bom_insumos',
    'mrp_boms',
    'mrp_insumos',
    'mrp_eventos',
    -- Modelo viejo por marca+tipo. Normalmente ya lo dropeó
    -- mrp_cleanup_marca_tienda_tipo.sql; se incluye por si quedó vivo.
    'pallet_discards',
    'pallet_movements',
    'pallet_inventory',
    'pallet_stores',
    'pallet_brands'
  ];
  t          text;
  v_present  text[] := '{}';
begin
  foreach t in array v_tables loop
    if to_regclass('public.' || t) is not null then
      v_present := v_present || quote_ident(t);
    else
      raise notice 'omitida (no existe): %', t;
    end if;
  end loop;

  if array_length(v_present, 1) is null then
    raise notice 'No hay tablas MRP que vaciar.';
    return;
  end if;

  raise notice 'TRUNCATE de % tablas: %', array_length(v_present, 1),
    array_to_string(v_present, ', ');

  execute 'truncate table ' || array_to_string(v_present, ', ') || ' restart identity';
end $$;

-- Correlativo de movimientos: vuelve a MOV-YYYYMMDD-000001.
-- (Es una secuencia independiente, no la toca el RESTART IDENTITY de arriba.)
alter sequence if exists mrp_movement_code_seq restart with 1;


-- ============================================================================
-- PASO 3 — VERIFICACIÓN. Todo debe dar 0 salvo lo que se conserva.
-- ============================================================================
select 'pallet_articulos'             as tabla, count(*) as filas from pallet_articulos
union all select 'pallet_clientes',              count(*) from pallet_clientes
union all select 'pallet_tiendas',               count(*) from pallet_tiendas
union all select 'pallet_inventory_articulo',    count(*) from pallet_inventory_articulo
union all select 'pallet_movimientos_articulo',  count(*) from pallet_movimientos_articulo
union all select 'pallet_descartes_articulo',    count(*) from pallet_descartes_articulo
union all select 'pallet_external_consumptions', count(*) from pallet_external_consumptions
union all select 'mrp_eventos',                  count(*) from mrp_eventos
union all select 'mrp_insumos',                  count(*) from mrp_insumos
union all select 'mrp_boms',                     count(*) from mrp_boms
union all select 'mrp_bom_insumos',              count(*) from mrp_bom_insumos
union all select '-- SE CONSERVA: pallet_warehouses', count(*) from pallet_warehouses
union all select '-- SE CONSERVA: pallet_motivos',    count(*) from pallet_motivos
order by 1;

-- Los almacenes deben seguir ligados a su bodega. Si bodega_id sale NULL,
-- re-vincúlalo antes de operar (el workspace resuelve el almacén por bodega).
-- OJO: pallet_warehouses es la tabla más vieja del MRP y usa columnas en
-- inglés (name/code/active), no `nombre` como las tablas nuevas.
select id, name, code, active, bodega_id, tenant_id, company
from pallet_warehouses
order by name;

-- ============================================================================
-- DESPUÉS DEL RESET — orden de carga para producción:
--   1) Catálogos › Compañías  → crear las compañías reales (CL0001…)
--   2) Catálogos › Clientes   → crear clientes/tiendas y asignarles compañía
--                               (+ código de tienda de la app externa si aplica)
--   3) Catálogos › Artículos  → crear artículos asignados a su compañía
--   4) Insumos y BOMs         → si se usan
--   5) Inventario             → cargar saldos iniciales con Traslado/Ajuste
--                               (queda registrado en el Historial, lo cual es
--                                lo correcto para la trazabilidad de arranque)
-- ============================================================================
