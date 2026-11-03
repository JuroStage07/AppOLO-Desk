// Reporte de despachos — consulta completa por rango de fechas y agregados.
//
// A diferencia del tablero (máx. 50 por estado), el reporte trae TODOS los
// despachos del rango, paginando de a 1000 sobre public.despacho_dev_despachos
// con el mismo scope explícito (tenant / company / bodega) que usa el tablero.
// Solo lectura y con el cliente anónimo de src/supabase.js.
//
// Tarimas: `tarimas_s` = sencillas, `tarimas_d` = dobles (mismo criterio que el
// consumo automático del MRP en functions/mrpDespachoConsumption.js).

import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { supabase } from "../../../supabase";
import { andenKey, compareAnden, matchAnden } from "../../../utils/andenes";
import { filterByUserScope } from "../../../utils/dataScope";

/**
 * Historial: hasta el 13/08/2026 los despachos vivían en Firestore `despachos`
 * (sep-2025 → 13/08/2026); desde ese día en Supabase. Para rangos que tocan
 * fechas anteriores a este corte, el reporte también lee Firestore (solo
 * lectura) y une ambos. Fin exclusivo, en hora local.
 */
export const HISTORIAL_HASTA = "2026-08-14";

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

const tsToIso = (v) => {
  if (!v) return null;
  const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Despacho de Firestore (camelCase) con la misma forma que una fila de Supabase. */
export function mapDespachoHistorial(id, x) {
  return {
    id: `historial-${id}`,
    origen: "historial",
    tenant_id: x.tenantId ?? null,
    company: x.company ?? null,
    bodega_id: x.bodegaId ?? null,
    bodega_nombre: x.bodegaNombre ?? null,
    tipo: x.tipo ?? null,
    referencia: x.referencia ?? null,
    tienda: x.tienda ?? null,
    placa: x.placa ?? null,
    placa_contenedor: null,
    marchamo: x.marchamo ?? null,
    puerta: x.puerta ?? null,
    transportista: x.transportista ?? null,
    con_dua: x.conDua ?? null,
    numero_dua: x.numeroDua ?? null,
    estado: x.estado ?? null,
    estado_motivo: null,
    tarimas_s: x.tarimasS ?? 0,
    tarimas_d: x.tarimasD ?? 0,
    fotos_count: x.fotosCount ?? 0,
    notas: x.notas ?? null,
    fecha: tsToIso(x.fecha) || tsToIso(x.createdAt),
    finalized_at: tsToIso(x.finalizedAt),
    reopened_at: null,
    mrp_traslado: typeof x.mrpTraslado === "string" ? x.mrpTraslado : x.mrpTraslado?.estado ?? null,
    mrp_traslado_at: null,
    chofer_id: null,
    created_at: tsToIso(x.createdAt),
  };
}

/**
 * Tarimas a partir del acomodo del camión (`despachos/{id}/layout`.slots): cada
 * tarima es un `lotId`; tipo S = sencilla, D = doble (ocupa 2 posiciones) y T
 * (ocupa 3) se cuenta como doble. Se usa solo para despachos viejos que no
 * guardaban `tarimasS`/`tarimasD` (antes de feb-2026). Validado contra 1.095
 * despachos con ambos datos: +1,3 % sencillas y +1,0 % dobles en el total.
 * @param {Array<{ type?: string, lotId?: string }>} slots
 * @returns {{ s: number, d: number }}
 */
export function tarimasDesdeLayout(slots) {
  const s = new Set();
  const d = new Set();
  for (const slot of slots || []) {
    if (!slot?.lotId) continue;
    if (slot.type === "S") s.add(slot.lotId);
    else if (slot.type === "D" || slot.type === "T") d.add(slot.lotId);
  }
  return { s: s.size, d: d.size };
}

/** Completa con el acomodo las tarimas de los despachos viejos que no las guardaban. */
async function completarTarimasDesdeLayout(rows) {
  const pendientes = rows.filter((r) => !(Number(r.tarimas_s) > 0) && !(Number(r.tarimas_d) > 0));
  const LOTE = 20;
  for (let i = 0; i < pendientes.length; i += LOTE) {
    await Promise.all(
      pendientes.slice(i, i + LOTE).map(async (r) => {
        const snap = await getDocs(collection(db, "despachos", r.id.replace(/^historial-/, ""), "layout"));
        const slots = snap.docs.flatMap((d) => d.data()?.slots || []);
        if (!slots.length) return;
        const t = tarimasDesdeLayout(slots);
        r.tarimas_s = t.s;
        r.tarimas_d = t.d;
        r.tarimas_estimadas = true;
      })
    );
  }
  return rows;
}

/**
 * Despachos del historial de Firestore en [from, min(to, corte)), dentro del scope.
 *
 * `fecha` está guardada a veces como Timestamp y a veces como texto ISO, así que
 * no sirve para consultar por rango; `createdAt` es Timestamp en todos. Se
 * consulta por `createdAt` con un día de margen (índice simple) y luego se
 * filtra por la `fecha` real del despacho. El scope se filtra en cliente.
 */
async function fetchHistorialFirestore({ tenantId, company, bodegaId, from, to }) {
  const corte = startOfLocalDay(HISTORIAL_HASTA);
  const hasta = to < corte ? to : corte;
  if (from >= hasta) return [];
  const DIA = 24 * 60 * 60 * 1000;
  const snap = await getDocs(
    query(
      collection(db, "despachos"),
      where("createdAt", ">=", Timestamp.fromDate(new Date(from.getTime() - DIA))),
      where("createdAt", "<", Timestamp.fromDate(new Date(hasta.getTime() + DIA))),
      orderBy("createdAt", "desc")
    )
  );
  const desdeIso = from.toISOString();
  const hastaIso = hasta.toISOString();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rows = filterByUserScope(docs, tenantId, company, bodegaId)
    .filter((x) => x.estado !== ESTADO_ELIMINADO && !x.deletedAt)
    .map(({ id, ...x }) => mapDespachoHistorial(id, x))
    .filter((d) => d.fecha && d.fecha >= desdeIso && d.fecha < hastaIso);
  return completarTarimasDesdeLayout(rows);
}

/**
 * Trae todos los despachos del rango [desde, hasta] (días locales, inclusive)
 * dentro del scope, más los choferes referenciados. Si el rango toca fechas
 * anteriores a HISTORIAL_HASTA, suma el historial de Firestore.
 *
 * @param {{ tenantId?: string, company?: string, bodegaId?: string, desde: string, hasta: string }} params
 * @returns {Promise<{ despachos: object[], choferes: Map<string, object>, catalogo: object[], historial: { incluido: boolean, cantidad: number, error: string } }>}
 */
export async function fetchReporteDespachos({ tenantId, company, bodegaId, desde, hasta }) {
  const from = startOfLocalDay(desde);
  const to = startOfLocalDay(hasta);
  to.setDate(to.getDate() + 1); // fin exclusivo: día siguiente 00:00
  const tocaHistorial = from < startOfLocalDay(HISTORIAL_HASTA);
  // El historial no debe tumbar el reporte (p. ej. reglas de Firestore sin permiso «despacho»).
  const historialPromise = tocaHistorial
    ? fetchHistorialFirestore({ tenantId, company, bodegaId, from, to }).then(
        (rows) => ({ rows, error: "" }),
        (e) => ({ rows: [], error: e?.code === "permission-denied" ? "sin-permiso" : "error" })
      )
    : Promise.resolve({ rows: [], error: "" });

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

  // Unir historial sin duplicar (si una referencia está en ambos, gana Supabase).
  const historial = await historialPromise;
  const refs = new Set(despachos.map((d) => d.referencia).filter(Boolean));
  const extra = historial.rows.filter((d) => !d.referencia || !refs.has(d.referencia));
  const todos = extra.length
    ? [...despachos, ...extra].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    : despachos;

  return {
    despachos: todos,
    choferes,
    catalogo,
    historial: {
      incluido: tocaHistorial,
      cantidad: extra.length,
      estimados: extra.filter((d) => d.tarimas_estimadas).length,
      error: historial.error,
    },
  };
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
 * @param {{ estados?: string[], tiendas?: string[], texto?: string, andenes?: Set<number> }} filtros
 *   andenes: números de andén (la `puerta` "Puerta 14" es el andén 14); vacío = todos.
 */
export function filtrarReporte(despachos, { estados = [], tiendas = [], texto = "", andenes } = {}) {
  const q = String(texto || "").trim().toLowerCase();
  const estSet = new Set(estados);
  const tiendaSet = new Set(tiendas);
  return (despachos || []).filter((d) => {
    if (estSet.size && !estSet.has(d.estado)) return false;
    if (tiendaSet.size && !tiendaSet.has(tiendaKey(d))) return false;
    if (!matchAnden(d.puerta, andenes)) return false;
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
 * Agrupa por andén (número de la `puerta`), ascendente; "Sin andén" al final.
 * @returns {Array<{ anden: number|null, despachos: number, sencillas: number, dobles: number, total: number, promedio: number, tiendas: number, ultimo: string|null }>}
 */
export function resumenPorAnden(despachos) {
  const map = new Map();
  for (const d of despachos || []) {
    const k = andenKey(d.puerta);
    const cur = map.get(k) || { anden: k, despachos: 0, sencillas: 0, dobles: 0, total: 0, tiendaSet: new Set(), ultimo: null };
    cur.despachos += 1;
    cur.sencillas += num(d.tarimas_s);
    cur.dobles += num(d.tarimas_d);
    cur.total += totalTarimas(d);
    cur.tiendaSet.add(tiendaKey(d));
    if (d.fecha && (!cur.ultimo || d.fecha > cur.ultimo)) cur.ultimo = d.fecha;
    map.set(k, cur);
  }
  return [...map.values()]
    .map(({ tiendaSet, ...r }) => ({ ...r, tiendas: tiendaSet.size, promedio: r.despachos ? r.total / r.despachos : 0 }))
    .sort((a, b) => compareAnden(a.anden, b.anden));
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
