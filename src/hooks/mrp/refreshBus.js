// MRP Tarimas — bus de refresco en memoria.
//
// Las mutaciones (ajustes, traslados, alta de catálogos) emiten en un "canal";
// los hooks de lectura suscritos a ese canal hacen refetch automático. Evita
// pasar callbacks de refresco por props entre pantallas (mismo espíritu que el
// store compartido de usePinnedModules).
//
// Canales: "inventory" | "movements" | "discards" | "brands" | "stores" |
//          "warehouses" | "articulos" | "insumos" | "boms".

const buses = Object.create(null);

export function onRefresh(channel, fn) {
  (buses[channel] ||= new Set()).add(fn);
  return () => buses[channel]?.delete(fn);
}

export function bumpRefresh(...channels) {
  for (const c of channels) buses[c]?.forEach((fn) => fn());
}
