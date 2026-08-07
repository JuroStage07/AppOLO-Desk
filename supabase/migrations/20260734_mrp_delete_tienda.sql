-- ============================================================================
-- MRP Tarimas — Borrado seguro de cliente/tienda (mrp_delete_tienda)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase. NO DESTRUCTIVO del esquema e idempotente
-- (create or replace).
--
-- Problema: no se puede eliminar un cliente (pallet_tiendas) aunque ya no tenga
-- stock, porque `mrp_apply_articulo_stock_delta` NO borra las filas de
-- pallet_inventory_articulo que llegan a quantity = 0. Esas filas residuales
-- conservan store_id y la FK `pallet_inv_art_store_fk` bloquea el DELETE. Además
-- pallet_external_consumptions.store_id también referencia a pallet_tiendas.
--
-- Como pallet_inventory_articulo es solo-lectura para el cliente (escrituras vía
-- RPC SECURITY DEFINER), la limpieza debe hacerse aquí, del lado del servidor.
--
-- Esta RPC:
--   1) Valida que el cliente pertenezca al tenant/company.
--   2) BLOQUEA si el cliente aún tiene stock (> 0) en cualquier ubicación.
--   3) Borra las filas de inventario en cero de ese cliente (residuales).
--   4) Desliga los consumos externos históricos (store_id = null); se conserva
--      el registro y su código externo, solo se rompe la referencia al catálogo.
--   5) Elimina el cliente.
-- ============================================================================

create or replace function mrp_delete_tienda(
  p_tenant_id text,
  p_company   text,
  p_tienda_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_exists   boolean;
  v_positive integer;
begin
  select exists (
    select 1 from pallet_tiendas
    where id = p_tienda_id and tenant_id = p_tenant_id and company = p_company
  ) into v_exists;
  if not v_exists then
    raise exception 'El cliente no existe en este tenant/company';
  end if;

  -- Stock vivo (> 0) en cualquier almacén/ubicación de este cliente.
  select coalesce(sum(quantity), 0) into v_positive
  from pallet_inventory_articulo
  where tenant_id = p_tenant_id and company = p_company and store_id = p_tienda_id;

  if v_positive > 0 then
    raise exception
      'No se puede eliminar: el cliente tiene % unidad(es) de stock asignadas.', v_positive;
  end if;

  -- Residuales en cero: se pueden borrar sin afectar saldos.
  delete from pallet_inventory_articulo
  where tenant_id = p_tenant_id and company = p_company and store_id = p_tienda_id;

  -- Consumos externos históricos: se conservan, solo se desliga la referencia.
  update pallet_external_consumptions
     set store_id = null
   where store_id = p_tienda_id;

  delete from pallet_tiendas
  where id = p_tienda_id and tenant_id = p_tenant_id and company = p_company;
end;
$$;

grant execute on function mrp_delete_tienda(text, text, uuid) to anon, authenticated;
