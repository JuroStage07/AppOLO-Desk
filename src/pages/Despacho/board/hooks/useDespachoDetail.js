// Hook de datos del Detalle de "Despachos Dev" (solo lectura).
//
// Responsabilidades:
// - Cargar el Despacho activo (`despacho_dev_despachos`) aplicando filtros de
//   scope (tenant/company/bodega) cuando están disponibles.
// - Resolver el Chofer (`despacho_dev_choferes`) solo cuando hay `chofer_id`.
//   Un fallo aquí es NO bloqueante: se expone en `choferError` sin romper el
//   resto del Detalle (Requirement 5.6, 5.7).
// - Cargar el Historial (`despacho_dev_actividad`) filtrando por
//   `entidad = 'despacho'` y `entidad_id = <id>`, ordenado de forma estable en
//   cliente con `sortHistorial` (Requirement 6.1, 6.8, 6.2).
// - Suscribirse a Realtime del historial del despacho activo y limpiar el canal
//   al cerrar/desmontar o al cambiar `despachoId` (Requirement 7.4, 7.5).
// - Timeout de 30s por consulta (Requirement 5.10, 9.7).
//
// Usa exclusivamente el cliente anónimo de `src/supabase.js`; nunca service role.
//
// _Requirements: 5.6, 5.7, 5.10, 6.1, 6.8, 7.4, 7.5_

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../../supabase";
import { sortHistorial } from "../lib/despachoGrouping";

/** Tiempo máximo por consulta antes de tratarla como error (Requirement 9.7). */
const QUERY_TIMEOUT_MS = 30000;

/** Estados de canal Realtime que se consideran degradados/no disponibles. */
const REALTIME_INACTIVE = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

/**
 * Corre una promesa de consulta con un límite de tiempo. Al vencer, rechaza
 * con un error de timeout tratado como fallo de consulta (Requirement 9.7).
 * @template T
 * @param {Promise<T> | PromiseLike<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("La consulta excedió el tiempo de espera")),
      ms,
    );
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() =>
    clearTimeout(timeoutId),
  );
}

/**
 * Construye la consulta del historial de un despacho.
 * @param {string} despachoId
 */
function historialQuery(despachoId) {
  return supabase
    .from("despacho_dev_actividad")
    .select("*")
    .eq("entidad", "despacho")
    .eq("entidad_id", despachoId)
    .order("created_at", { ascending: false });
}

/**
 * Hook de datos del Detalle de un despacho.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.despachoId Id del despacho activo. Si es
 *   nulo/indefinido no se consulta ni se suscribe nada.
 * @param {string|null|undefined} [params.tenantId] Filtro de scope opcional.
 * @param {string|null|undefined} [params.company] Filtro de scope opcional.
 * @param {string|null|undefined} [params.bodegaId] Filtro de scope opcional.
 * @returns {{
 *   despacho: object|null,
 *   chofer: object|null,
 *   choferError: Error|null,
 *   historial: object[],
 *   loading: boolean,
 *   error: Error|null,
 *   realtimeStatus: "activo"|"inactivo",
 *   reload: () => void,
 * }}
 */
export function useDespachoDetail({ despachoId, tenantId, company, bodegaId }) {
  const [despacho, setDespacho] = useState(null);
  const [chofer, setChofer] = useState(null);
  const [choferError, setChoferError] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState("inactivo");

  // Identifica la solicitud vigente para descartar respuestas obsoletas
  // (cambio de `despachoId` o desmontaje) sin llamar a setState fuera de tiempo.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isStale = () => requestId !== requestIdRef.current;

    // Sin despacho seleccionado: limpiar estado y no consultar nada.
    if (!despachoId) {
      setDespacho(null);
      setChofer(null);
      setChoferError(null);
      setHistorial([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setChoferError(null);

    try {
      // 1) Despacho con filtros de scope (aprovecha el índice de scope/estado).
      let despachoQuery = supabase
        .from("despacho_dev_despachos")
        .select("*")
        .eq("id", despachoId);
      if (tenantId) despachoQuery = despachoQuery.eq("tenant_id", tenantId);
      if (company) despachoQuery = despachoQuery.eq("company", company);
      if (bodegaId) despachoQuery = despachoQuery.eq("bodega_id", bodegaId);

      const { data: despachoData, error: despachoErr } = await withTimeout(
        despachoQuery.maybeSingle(),
        QUERY_TIMEOUT_MS,
      );
      if (isStale()) return;
      if (despachoErr) throw despachoErr;

      // 2) Historial del despacho (orden estable en cliente).
      const { data: historialData, error: historialErr } = await withTimeout(
        historialQuery(despachoId),
        QUERY_TIMEOUT_MS,
      );
      if (isStale()) return;
      if (historialErr) throw historialErr;

      // 3) Chofer (no bloqueante): solo cuando hay `chofer_id`.
      let choferData = null;
      let choferErr = null;
      const choferId = despachoData?.chofer_id;
      if (choferId) {
        try {
          const { data, error: err } = await withTimeout(
            supabase
              .from("despacho_dev_choferes")
              .select("*")
              .eq("id", choferId)
              .maybeSingle(),
            QUERY_TIMEOUT_MS,
          );
          if (err) throw err;
          choferData = data ?? null;
          if (!choferData) {
            // Chofer asignado pero no resoluble (Requirement 5.7).
            choferErr = new Error("Datos del chofer no disponibles");
          }
        } catch (e) {
          choferErr = e instanceof Error ? e : new Error(String(e));
        }
      }
      if (isStale()) return;

      setDespacho(despachoData ?? null);
      setHistorial(sortHistorial(historialData || []));
      setChofer(choferData);
      setChoferError(choferErr);
    } catch (e) {
      if (isStale()) return;
      // Nunca datos parciales: se conserva el estado previo y se marca error.
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [despachoId, tenantId, company, bodegaId]);

  // Refresco solo del historial ante eventos realtime (no bloqueante).
  const refreshHistorial = useCallback(async () => {
    if (!despachoId) return;
    try {
      const { data, error: err } = await withTimeout(
        historialQuery(despachoId),
        QUERY_TIMEOUT_MS,
      );
      if (err) throw err;
      setHistorial(sortHistorial(data || []));
    } catch {
      // El refresco por realtime es no bloqueante: se conserva el historial
      // ya mostrado sin propagar el error a la UI.
    }
  }, [despachoId]);

  // Carga inicial y recarga ante cambios de despacho/scope.
  useEffect(() => {
    load();
  }, [load]);

  // Al desmontar, invalida cualquier solicitud en vuelo.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  // Suscripción realtime del historial del despacho activo (Requirement 7.4/7.5).
  useEffect(() => {
    if (!despachoId) {
      setRealtimeStatus("inactivo");
      return undefined;
    }

    const channel = supabase
      .channel(`despacho-dev-actividad-${despachoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "despacho_dev_actividad",
          filter: `entidad_id=eq.${despachoId}`,
        },
        () => {
          refreshHistorial();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("activo");
        } else if (REALTIME_INACTIVE.has(status)) {
          setRealtimeStatus("inactivo");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [despachoId, refreshHistorial]);

  return {
    despacho,
    chofer,
    choferError,
    historial,
    loading,
    error,
    realtimeStatus,
    reload: load,
  };
}

export default useDespachoDetail;
