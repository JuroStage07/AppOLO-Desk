// Feature: despachos-dev — hook de datos y realtime del listado.
//
// Carga el Catalogo_Estados (public.despacho_dev_estados) y el listado de
// despachos agrupable por estado (public.despacho_dev_despachos), aplicando
// filtros de scope explícitos derivados de AuthCtx como mecanismo primario de
// enforcement dentro de la SPA (defensa en profundidad, ver design.md D1), más
// filtrado defensivo en cliente. Mantiene el listado actualizado en tiempo real
// vía Supabase Realtime con degradación elegante y reintento periódico.
//
// Solo lectura. Usa exclusivamente el cliente anónimo de src/supabase.js;
// NUNCA la clave de servicio (service role).
//
// _Requirements: 1.1, 1.2, 2.1, 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 9.5, 9.6, 9.7_

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../supabase";
import { buildMapaEstados } from "../lib/mapaEstados";
import { realtimeReducer } from "../lib/realtimeReducer";
import { filterRowsByScope } from "../lib/scopeFilter";

// Límite específico de 5s para el catálogo (Requirement 1.1/1.2).
const CATALOGO_TIMEOUT_MS = 5000;
// Timeout general de 30s por consulta del listado (Requirement 8.3, 9.7).
const QUERY_TIMEOUT_MS = 30000;
// Máximo de registros por estado; paginación vía .range (Requirement 9.5).
const PAGE_SIZE = 50;
// Reintento de restablecimiento de realtime cada 15s (Requirement 7.7).
const REALTIME_RETRY_MS = 15000;
// Código de estado que nunca se lista.
const ESTADO_ELIMINADO = "eliminado";

/**
 * Envuelve una consulta (thenable de Supabase) con un timeout que la rechaza al
 * vencer, para tratar el exceso de tiempo como error sin datos parciales.
 * @template T
 * @param {PromiseLike<T>} query
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
function withTimeout(query, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([query, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Hook de datos y realtime del listado de "Despachos Dev".
 *
 * @param {{ tenantId?: string|null, company?: string|null, bodegaId?: string|null }} [params]
 * @returns {{
 *   catalogo: object[],
 *   despachos: object[],
 *   mapaEstados: ReturnType<typeof buildMapaEstados>,
 *   loading: boolean,
 *   error: Error|null,
 *   realtimeStatus: "activo"|"inactivo",
 *   reload: () => Promise<void>,
 * }}
 * _Requirements: 1.1, 1.2, 2.1, 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 9.5, 9.6, 9.7_
 */
export function useDespachoData({ tenantId, company, bodegaId } = {}) {
  const [catalogo, setCatalogo] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState("inactivo");

  // Scope estable derivado de AuthCtx. tenant_id/company/bodega_id quedan
  // preparados como filtros para una futura vista multi-scope (Requirement 9.2).
  const scope = useMemo(
    () => ({
      tenantId: tenantId ?? null,
      company: company ?? null,
      bodegaId: bodegaId ?? null,
    }),
    [tenantId, company, bodegaId],
  );

  // mapaEstados se deriva del catálogo (nombre/orden como fuente de verdad).
  const mapaEstados = useMemo(() => buildMapaEstados(catalogo), [catalogo]);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    // Marca de petición para descartar respuestas obsoletas (cambios de scope
    // o recargas concurrentes) y evitar setState tras desmontaje.
    const requestId = ++requestIdRef.current;
    const isCurrent = () =>
      mountedRef.current && requestId === requestIdRef.current;

    if (isCurrent()) {
      setLoading(true);
      setError(null);
    }

    try {
      // 1) Catálogo de estados (límite 5s). Orden ascendente por `orden`.
      const catRes = await withTimeout(
        supabase
          .from("despacho_dev_estados")
          .select("*")
          .order("orden", { ascending: true }),
        CATALOGO_TIMEOUT_MS,
        "El catálogo de estados no pudo cargarse.",
      );
      if (catRes.error) throw catRes.error;
      const catalogoData = Array.isArray(catRes.data) ? catRes.data : [];

      // 2) Listado por estado. Una consulta por estado presente (excluyendo
      //    `eliminado`), estructurada para el índice compuesto
      //    (tenant_id, company, bodega_id, estado, created_at desc).
      const estados = catalogoData
        .map((e) => (e && typeof e.codigo === "string" ? e.codigo : null))
        .filter((codigo) => codigo && codigo !== ESTADO_ELIMINADO);

      const buildListadoQuery = (codigo) => {
        let q = supabase.from("despacho_dev_despachos").select("*");
        // Filtros de scope explícitos (solo cuando el valor existe) para
        // aprovechar el índice y aplicar enforcement en la SPA.
        if (scope.tenantId) q = q.eq("tenant_id", scope.tenantId);
        if (scope.company) q = q.eq("company", scope.company);
        if (scope.bodegaId) q = q.eq("bodega_id", scope.bodegaId);
        return q
          .is("deleted_at", null)
          .neq("estado", ESTADO_ELIMINADO)
          .eq("estado", codigo)
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1); // máx. 50 por estado, con paginación
      };

      const results = await Promise.all(
        estados.map((codigo) =>
          withTimeout(
            buildListadoQuery(codigo),
            QUERY_TIMEOUT_MS,
            "Los despachos no pudieron cargarse.",
          ),
        ),
      );

      const aggregated = [];
      for (const res of results) {
        if (res.error) throw res.error;
        if (Array.isArray(res.data)) aggregated.push(...res.data);
      }

      // Filtrado defensivo en cliente por scope completo (Requirement 7.3/9.1).
      const inScope = filterRowsByScope(aggregated, scope);

      if (isCurrent()) {
        setCatalogo(catalogoData);
        setDespachos(inScope);
      }
    } catch (e) {
      // Nunca datos parciales: se conserva el último estado válido y solo se
      // marca el error (Requirement 9.7).
      if (isCurrent()) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [scope]);

  // Carga inicial y recarga ante cambios de scope. Limpieza de montaje.
  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  // Suscripción realtime al listado con degradación y reintento.
  useEffect(() => {
    let channel = null;
    let retryTimer = null;
    let cancelled = false;
    let active = false;

    const handleEvent = (payload) => {
      // Mapea el evento de Supabase a la forma del reductor puro. El reductor
      // aplica el filtrado defensivo por scope (ignora eventos fuera de scope).
      const event = {
        type: payload?.eventType,
        new: payload?.new,
        old: payload?.old,
      };
      setDespachos((prev) => realtimeReducer(prev, event, scope));
    };

    const handleStatus = (status) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        active = true;
        setRealtimeStatus("activo");
      } else {
        // CHANNEL_ERROR, TIMED_OUT, CLOSED, etc.: degradación no bloqueante.
        active = false;
        setRealtimeStatus("inactivo");
      }
    };

    const subscribe = () => {
      const changeConfig = {
        event: "*",
        schema: "public",
        table: "despacho_dev_despachos",
      };
      // Filtro por bodega cuando el scope lo permite (Requirement 7.1).
      if (scope.bodegaId) {
        changeConfig.filter = `bodega_id=eq.${scope.bodegaId}`;
      }
      const ch = supabase.channel("despachos-dev-list");
      ch.on("postgres_changes", changeConfig, handleEvent);
      ch.subscribe(handleStatus);
      return ch;
    };

    channel = subscribe();

    // Mientras la conexión esté inactiva, reintentar cada 15s (Requirement 7.7).
    retryTimer = setInterval(() => {
      if (cancelled || active) return;
      if (channel) supabase.removeChannel(channel);
      channel = subscribe();
    }, REALTIME_RETRY_MS);

    // Limpieza completa: cancela el reintento y libera el canal (Requirement 7.5).
    return () => {
      cancelled = true;
      if (retryTimer) clearInterval(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [scope]);

  return {
    catalogo,
    despachos,
    mapaEstados,
    loading,
    error,
    realtimeStatus,
    reload: loadData,
  };
}

export default useDespachoData;
