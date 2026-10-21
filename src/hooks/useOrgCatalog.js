import { useCallback, useEffect, useState } from "react";
import { fetchOrgCatalog } from "../services/orgCatalog";
import { BODEGA_OPTIONS, COMPANY_OPTIONS, TENANT_OPTIONS } from "../config/bodegas";

// Catálogo estático de respaldo (src/config/bodegas.js) con la forma del de Supabase.
// Se usa solo si Supabase no responde, para que el selector de almacén nunca quede vacío.
export const FALLBACK_CATALOG = {
  tenants: TENANT_OPTIONS.map((t) => ({ id: t.id, name: t.label, active: true })),
  companies: COMPANY_OPTIONS.map((c) => ({ id: c.id, name: c.label, active: true })),
  bodegas: BODEGA_OPTIONS.map((b) => ({
    id: b.id,
    tenantId: b.tenantId,
    companyId: b.company,
    code: b.id.split("-").slice(2).join("-"),
    name: b.label,
    sroWarehouseId: b.warehouseId || null,
    active: true,
  })),
};

// Cache de módulo: una sola lectura por sesión de navegador (se puede forzar con reload()).
let cached = null;
let inflight = null;

function load(force = false) {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  inflight = fetchOrgCatalog()
    .then((catalog) => {
      cached = { catalog, fallback: false, error: "" };
      return cached;
    })
    .catch((e) => {
      console.warn("Catálogo de Supabase no disponible, uso el respaldo local:", e?.message);
      // No se cachea el respaldo: el próximo montaje vuelve a intentar Supabase.
      return { catalog: FALLBACK_CATALOG, fallback: true, error: e?.message || "" };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Catálogo de países, compañías y almacenes.
 * @returns {{ catalog, loading, fallback, error, reload }}
 */
export default function useOrgCatalog() {
  const [state, setState] = useState(() =>
    cached ? { ...cached, loading: false } : { catalog: FALLBACK_CATALOG, fallback: true, error: "", loading: true }
  );

  const reload = useCallback(async (force = true) => {
    const res = await load(force);
    setState({ ...res, loading: false });
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((res) => alive && setState({ ...res, loading: false }));
    return () => {
      alive = false;
    };
  }, []);

  return { ...state, reload };
}

/** Limpia la cache (tras editar el catálogo, y en pruebas). */
export function invalidateOrgCatalogCache() {
  cached = null;
  inflight = null;
}
