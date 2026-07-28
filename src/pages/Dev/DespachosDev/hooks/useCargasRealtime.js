// Feature: despachos-dev — hook de "Cargas en tiempo real".
//
// Carga los despachos ACTIVOS (no finales, no eliminados, deleted_at null) que
// tienen un layout de contenedor (`despacho_dev_layout`) y los combina en una
// lista de cargas { despacho, slots }. Se mantiene en vivo vía Supabase Realtime
// suscribiéndose a cambios en `despacho_dev_layout` y `despacho_dev_despachos`.
//
// Solo se activa cuando `enabled` es verdadero (p. ej. modal abierto), para no
// mantener suscripciones ni consultas cuando la vista no está visible.
//
// Solo lectura. Cliente anónimo únicamente; nunca service role.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../../supabase";
import { isFinal } from "../lib/mapaEstados";
import { isRowInScope } from "../lib/scopeFilter";

const QUERY_TIMEOUT_MS = 30000;
const REALTIME_RETRY_MS = 15000;
const RELOAD_DEBOUNCE_MS = 300;
const ESTADO_ELIMINADO = "eliminado";

function withTimeout(query, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([query, timeout]).finally(() => clearTimeout(timer));
}

/** Un despacho es "carga activa" si no está borrado, no es 'eliminado' ni final. */
function isCargaActiva(despacho) {
  if (!despacho) return false;
  if (despacho.deleted_at != null) return false;
  if (despacho.estado === ESTADO_ELIMINADO) return false;
  return !isFinal(despacho.estado);
}

/**
 * @param {{ tenantId?:string|null, company?:string|null, bodegaId?:string|null, enabled?:boolean }} params
 * @returns {{ cargas: Array<{despacho:object, slots:object[]}>, loading:boolean, error:Error|null, realtimeStatus:"activo"|"inactivo", reload:()=>Promise<void> }}
 */
export function useCargasRealtime({ tenantId, company, bodegaId, enabled = true } = {}) {
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState("inactivo");

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const scopeKey = `${tenantId ?? ""}|${company ?? ""}|${bodegaId ?? ""}`;

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current;

    if (isCurrent()) {
      setLoading(true);
      setError(null);
    }

    try {
      const scope = { tenantId, company, bodegaId };

      // Despachos activos en scope.
      let dq = supabase
        .from("despacho_dev_despachos")
        .select("*")
        .is("deleted_at", null)
        .neq("estado", ESTADO_ELIMINADO);
      if (tenantId) dq = dq.eq("tenant_id", tenantId);
      if (company) dq = dq.eq("company", company);
      if (bodegaId) dq = dq.eq("bodega_id", bodegaId);

      // Layouts (grids) en scope.
      let lq = supabase.from("despacho_dev_layout").select("*");
      if (tenantId) lq = lq.eq("tenant_id", tenantId);
      if (company) lq = lq.eq("company", company);
      if (bodegaId) lq = lq.eq("bodega_id", bodegaId);

      const [despRes, layoutRes] = await Promise.all([
        withTimeout(dq, QUERY_TIMEOUT_MS, "No se pudieron cargar los despachos."),
        withTimeout(lq, QUERY_TIMEOUT_MS, "No se pudo cargar el acomodo de las cargas."),
      ]);
      if (despRes.error) throw despRes.error;
      if (layoutRes.error) throw layoutRes.error;

      // Índice de layouts por despacho_id (filtrados defensivamente por scope).
      const layoutById = new Map();
      for (const row of layoutRes.data || []) {
        if (isRowInScope(row, scope)) layoutById.set(row.despacho_id, row);
      }

      // Cargas = despachos activos con layout asociado.
      const result = [];
      for (const despacho of despRes.data || []) {
        if (!isRowInScope(despacho, scope)) continue;
        if (!isCargaActiva(despacho)) continue;
        const layout = layoutById.get(despacho.id);
        if (!layout) continue;
        result.push({ despacho, slots: Array.isArray(layout.slots) ? layout.slots : [] });
      }

      // Orden: actualización más reciente primero.
      result.sort((a, a2) => {
        const ta = Date.parse(a.despacho?.updated_at || "") || 0;
        const tb = Date.parse(a2.despacho?.updated_at || "") || 0;
        return tb - ta;
      });

      if (isCurrent()) setCargas(result);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (isCurrent()) setLoading(false);
    }
    // scope se representa con scopeKey para deps estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  // Carga inicial / recarga cuando cambia el scope o se habilita.
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      // Deshabilitado: limpiar y no consultar.
      setCargas([]);
      setError(null);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, load]);

  // Realtime: layout + despachos. Reintento cada 15s si degrada.
  useEffect(() => {
    if (!enabled) {
      setRealtimeStatus("inactivo");
      return undefined;
    }

    let channel = null;
    let retryTimer = null;
    let reloadTimer = null;
    let cancelled = false;
    let active = false;

    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (!cancelled) load();
      }, RELOAD_DEBOUNCE_MS);
    };

    const subscribe = () => {
      const ch = supabase.channel("despachos-dev-cargas");
      const layoutCfg = { event: "*", schema: "public", table: "despacho_dev_layout" };
      const despCfg = { event: "*", schema: "public", table: "despacho_dev_despachos" };
      if (bodegaId) {
        layoutCfg.filter = `bodega_id=eq.${bodegaId}`;
        despCfg.filter = `bodega_id=eq.${bodegaId}`;
      }
      ch.on("postgres_changes", layoutCfg, scheduleReload);
      ch.on("postgres_changes", despCfg, scheduleReload);
      ch.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          active = true;
          setRealtimeStatus("activo");
        } else {
          active = false;
          setRealtimeStatus("inactivo");
        }
      });
      return ch;
    };

    channel = subscribe();

    retryTimer = setInterval(() => {
      if (cancelled || active) return;
      if (channel) supabase.removeChannel(channel);
      channel = subscribe();
    }, REALTIME_RETRY_MS);

    return () => {
      cancelled = true;
      if (retryTimer) clearInterval(retryTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, bodegaId, load]);

  return { cargas, loading, error, realtimeStatus, reload: load };
}

export default useCargasRealtime;
