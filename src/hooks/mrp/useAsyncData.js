// MRP Tarimas — fetcher genérico para hooks de lectura.
//
// Expone { data, loading, error, refetch, setData } y, opcionalmente, se
// suscribe a canales del refreshBus para refetch automático tras mutaciones.

import { useCallback, useEffect, useRef, useState } from "react";
import { onRefresh } from "./refreshBus";

export default function useAsyncData(
  fetcher,
  deps = [],
  { immediate = true, channels = [] } = {}
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    if (mounted.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await fetcherRef.current();
      if (mounted.current) setData(result);
      return result;
    } catch (e) {
      if (mounted.current) setError(e);
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Carga inicial + recarga cuando cambian las deps (filtros).
  useEffect(() => {
    mounted.current = true;
    if (immediate) refetch().catch(() => {});
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Refetch automático cuando una mutación emite en los canales suscritos.
  const channelsKey = channels.join("|");
  useEffect(() => {
    if (!channels.length) return undefined;
    const unsubs = channels.map((c) =>
      onRefresh(c, () => refetch().catch(() => {}))
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsKey, refetch]);

  return { data, setData, loading, error, refetch };
}
