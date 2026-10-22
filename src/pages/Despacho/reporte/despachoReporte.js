// Reporte de despachos — consulta completa por rango de fechas y agregados.
//
// A diferencia del tablero (máx. 50 por estado), el reporte trae TODOS los
// despachos del rango, paginando de a 1000 sobre public.despacho_dev_despachos
// con el mismo scope explícito (tenant / company / bodega) que usa el tablero.
// Solo lectura y con el cliente anónimo de src/supabase.js.
//
// Tarimas: `tarimas_s` = sencillas, `tarimas_d` = dobles (mismo criterio que el
// consumo automático del MRP en functions/mrpDespachoConsumption.js).

import { supabase } from "../../../supabase";

const PAGE = 1000;
const ESTADO_ELIMINADO = "eliminado";

/** Columnas del despacho que usa el reporte (sin campos internos). */
const DESPACHO_COLUMNS = [
  "id",
  "tenant_id",
  "company",
  "bodega_id",
  "bodega_nombre",
  "tipo",
  "referencia",
  "tienda",
  "placa",
  "placa_contenedor",
  "marchamo",
  "puerta",
  "transportista",
  "con_dua",
  "numero_dua",
  "estado",
  "estado_motivo",
  "tarimas_s",
  "tarimas_d",
  "fotos_count",
  "notas",
  "fecha",
  "finalized_at",
  "reopened_at",
  "mrp_traslado",
  "mrp_traslado_at",
  "chofer_id",
  "created_at",
].join(",");

/** Inicio del día local (00:00) de una fecha "YYYY-MM-DD". */
function startOfLocalDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/** "YYYY-MM-DD" local de un Date. */
export function toIsoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Trae todos los despachos del rango [desde, hasta] (días locales, inclusive)
 * dentro del scope, más los choferes referenciados.
 *
 * @param {{ tenantId?: string, company?: string, bodegaId?: string, desde: string, hasta: string }} params
 * @returns {Promise<{ despachos: object[], choferes: Map<string, object>, catalogo: object[] }>}
 */
export async function fetchReporteDespachos({ tenantId, company, bodegaId, desde, hasta }) {
  const from = startOfLocalDay(desde);
  const to = startOfLocalDay(hasta);
  to.setDate(to.getDate() + 1); // fin exclusivo: día siguiente 00:00

  const catRes = await supabase
    .from("despacho_dev_estados")
    .select("*")
    .order("orden", { ascending: true });
  if (catRes.error) throw catRes.error;
  const catalogo = Array.isArray(catRes.data) ? catRes.data : [];

  const despachos = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase.from("despacho_dev_despachos").select(DESPACHO_COLUMNS);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (company) q = q.eq("company", company);
    if (bodegaId) q = q.eq("bodega_id", bodegaId);
    const { data, error } = await q
      .is("deleted_at", null)
      .neq("estado", ESTADO_ELIMINADO)
      .gte("fecha", from.toISOString())
      .lt("fecha", to.toISOString())
      .order("fecha", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    despachos.push(...rows);
    if (rows.length < PAGE) break;
  }

  const choferIds = [...new Set(despachos.map((d) => d.chofer_id).filter(Boolean))];
  const choferes = new Map();
  for (let i = 0; i < choferIds.length; i += 200) {
    const { data, error } = await supabase
      .from("despacho_dev_choferes")
      .select("id,nombre,cedula,placa_camion,compania")
      .in("id", choferIds.slice(i, i + 200));
    // Sin choferes el reporte sigue siendo útil: no se corta por esto.
    if (error) break;
    for (const c of data || []) choferes.set(c.id, c);
  }

  return { despachos, choferes, catalogo };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Total de tarimas de un despacho (sencillas + dobles). */
export function totalTarimas(d) {
  return num(d?.tarimas_s) + num(d?.tarimas_d);
}

/** Clave de tienda normalizada para agrupar ("—" si no tiene). */
export function tiendaKey(d) {
  const t = String(d?.tienda ?? "").trim();
  return t || "—";
}

/**
 * Filtros en memoria del reporte (sobre el rango ya cargado).
 * @param {object[]} despachos
 * @param {{ estados?: string[], tiendas?: string[], texto?: string }} filtros
 */
export function filtrarReporte(despachos, { estados = [], tiendas = [], texto = "" } = {}) {
  const q = String(texto || "").trim().toLowerCase();
  const estSet = new Set(estados);
  const tiendaSet = new Set(tiendas);
  return (despachos || []).filter((d) => {
    if (estSet.size && !estSet.has(d.estado)) return false;
    if (tiendaSet.size && !tiendaSet.has(tiendaKey(d))) return false;
    if (!q) return true;
    return [d.referencia, d.tienda, d.placa, d.placa_contenedor, d.marchamo, d.puerta, d.transportista, d.numero_dua, d.notas]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

/**
 * Totales generales.
 * @returns {{ despachos: number, sencillas: number, dobles: number, total: number, tiendas: number, promedio: number }}
 */
export function resumenGeneral(despachos) {
  const rows = despachos || [];
  const sencillas = rows.reduce((a, d) => a + num(d.tarimas_s), 0);
  const dobles = rows.reduce((a, d) => a + num(d.tarimas_d), 0);
  const total = sencillas + dobles;
  const tiendas = new Set(rows.map(tiendaKey)).size;
  return {
    despachos: rows.length,
    sencillas,
    dobles,
    total,
    tiendas,
    promedio: rows.length ? total / rows.length : 0,
  };
}

/**
 * Agrupa por tienda, ordenado por total de tarimas desc.
 * @returns {Array<{ tienda: string, despachos: number, sencillas: number, dobles: number, total: number, promedio: number, ultimo: string|null }>}
 */
export function resumenPorTienda(despachos) {
  const map = new Map();
  for (const d of despachos || []) {
    const k = tiendaKey(d);
    const cur = map.get(k) || { tienda: k, despachos: 0, sencillas: 0, dobles: 0, total: 0, ultimo: null };
    cur.despachos += 1;
    cur.sencillas += num(d.tarimas_s);
    cur.dobles += num(d.tarimas_d);
    cur.total += totalTarimas(d);
    if (d.fecha && (!cur.ultimo || d.fecha > cur.ultimo)) cur.ultimo = d.fecha;
    map.set(k, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, promedio: r.despachos ? r.total / r.despachos : 0 }))
    .sort((a, b) => b.total - a.total || a.tienda.localeCompare(b.tienda, "es", { numeric: true }));
}

/**
 * Agrupa por día local de `fecha`, del más reciente al más antiguo.
 * @returns {Array<{ dia: string, despachos: number, sencillas: number, dobles: number, total: number }>}
 */
export function resumenPorDia(despachos) {
  const map = new Map();
  for (const d of despachos || []) {
    if (!d.fecha) continue;
    const k = toIsoDay(new Date(d.fecha));
    const cur = map.get(k) || { dia: k, despachos: 0, sencillas: 0, dobles: 0, total: 0 };
    cur.despachos += 1;
    cur.sencillas += num(d.tarimas_s);
    cur.dobles += num(d.tarimas_d);
    cur.total += totalTarimas(d);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1));
}

/** Rangos rápidos para el filtro de fechas. */
export function rangoRapido(key, now = new Date()) {
  const hoy = toIsoDay(now);
  if (key === "hoy") return { desde: hoy, hasta: hoy };
  if (key === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { desde: toIsoDay(d), hasta: hoy };
  }
  if (key === "mes") {
    return { desde: toIsoDay(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: hoy };
  }
  if (key === "mesAnterior") {
    const ini = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fin = new Date(now.getFullYear(), now.getMonth(), 0);
    return { desde: toIsoDay(ini), hasta: toIsoDay(fin) };
  }
  if (key === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { desde: toIsoDay(d), hasta: hoy };
  }
  return { desde: hoy, hasta: hoy };
}
