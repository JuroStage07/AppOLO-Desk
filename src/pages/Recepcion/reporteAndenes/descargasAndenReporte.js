// Reporte de descargas por andén — consulta por rango de fechas y agregados.
//
// Fuente: Firestore `accion_descarga` (tenant / company del perfil; la bodega se
// filtra en cliente con filterByUserScope, igual que «Reportes de Descarga»).
// El andén es `idAnden` ("02" y "2" son el mismo: ver utils/andenes.js).
// Fecha de referencia: `creadoAt` (cuándo se registró la descarga).

import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { filterByUserScope } from "../../../utils/dataScope";
import { andenKey, compareAnden, matchAnden } from "../../../utils/andenes";

/** Inicio del día local (00:00) de una fecha "YYYY-MM-DD". */
function startOfLocalDay(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/** Date de un Timestamp / Date / número / string, o null. */
export function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Trae las descargas del rango [desde, hasta] (días locales, inclusive) del scope.
 * @param {{ tenantId: string, company: string, bodegaId?: string, desde: string, hasta: string }} params
 * @returns {Promise<object[]>}
 */
export async function fetchDescargasPorAnden({ tenantId, company, bodegaId, desde, hasta }) {
  const from = startOfLocalDay(desde);
  const to = startOfLocalDay(hasta);
  to.setDate(to.getDate() + 1); // fin exclusivo

  const q = query(
    collection(db, "accion_descarga"),
    where("tenantId", "==", tenantId),
    where("company", "==", company),
    where("creadoAt", ">=", Timestamp.fromDate(from)),
    where("creadoAt", "<", Timestamp.fromDate(to)),
    orderBy("creadoAt", "desc")
  );
  const snap = await getDocs(q);
  return filterByUserScope(
    snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    tenantId,
    company,
    bodegaId
  );
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Estado de una descarga: "Finalizada" / "En proceso" / "Pendiente". */
export function estadoDescarga(a) {
  if (a?.completedAt) return "Finalizada";
  if (a?.startedAt) return "En proceso";
  return "Pendiente";
}

/** Duración efectiva (ms) de una descarga finalizada, sin pausas; 0 si no aplica. */
export function duracionMs(a) {
  if (!a?.completedAt) return 0;
  const t = num(a.totalTimeMs);
  if (t > 0) return t;
  const ini = toDate(a.startedAt);
  const fin = toDate(a.completedAt);
  if (!ini || !fin) return 0;
  return Math.max(0, fin - ini - num(a.pausedTotalMs));
}

/** Tipo de descarga normalizado para filtrar ("Recepcion EPA", "Cofersa", "Traslado"…). */
export function tipoKey(a) {
  return String(a?.tipo ?? "").trim() || "Sin tipo";
}

/**
 * Filtros en memoria.
 * @param {object[]} rows
 * @param {{ andenes?: Set<number>, tipos?: string[], estados?: string[], texto?: string }} f
 */
export function filtrarDescargas(rows, { andenes, tipos = [], estados = [], texto = "" } = {}) {
  const q = String(texto || "").trim().toLowerCase();
  const tipoSet = new Set(tipos);
  const estSet = new Set(estados);
  return (rows || []).filter((a) => {
    if (!matchAnden(a.idAnden, andenes)) return false;
    if (tipoSet.size && !tipoSet.has(tipoKey(a))) return false;
    if (estSet.size && !estSet.has(estadoDescarga(a))) return false;
    if (!q) return true;
    return [a.proveedorNombre, a.nombreAccion, a.starter, a.creadoPorNombre, a.tipoDescarga, a.reservaId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

function emptyAgg(anden) {
  return { anden, descargas: 0, finalizadas: 0, enProceso: 0, pendientes: 0, bultos: 0, bultosFinalizadas: 0, tiempoMs: 0, proveedorSet: new Set() };
}

function addTo(agg, a) {
  agg.descargas += 1;
  const est = estadoDescarga(a);
  if (est === "Finalizada") {
    agg.finalizadas += 1;
    agg.bultosFinalizadas += num(a.cantidadBultos);
  }
  else if (est === "En proceso") agg.enProceso += 1;
  else agg.pendientes += 1;
  agg.bultos += num(a.cantidadBultos);
  agg.tiempoMs += duracionMs(a);
  const prov = String(a.proveedorNombre || "").trim();
  if (prov) agg.proveedorSet.add(prov);
}

function finish({ proveedorSet, ...r }) {
  const horas = r.tiempoMs / 3600000;
  return {
    ...r,
    proveedores: proveedorSet.size,
    // Promedio por descarga finalizada, en ms (se muestra en horas, h:mm).
    promedioMs: r.finalizadas ? r.tiempoMs / r.finalizadas : 0,
    // Rendimiento: solo descargas finalizadas (las únicas con tiempo medido).
    bultosHora: horas > 0 ? r.bultosFinalizadas / horas : 0,
  };
}

/**
 * Agrupa por andén (ascendente; "Sin andén" al final).
 * @returns {Array<{ anden: number|null, descargas, finalizadas, enProceso, pendientes, bultos, tiempoMs, proveedores, promedioMs, bultosHora }>}
 */
export function resumenPorAnden(rows) {
  const map = new Map();
  for (const a of rows || []) {
    const k = andenKey(a.idAnden);
    if (!map.has(k)) map.set(k, emptyAgg(k));
    addTo(map.get(k), a);
  }
  return [...map.values()].map(finish).sort((x, y) => compareAnden(x.anden, y.anden));
}

/** Totales generales con las mismas métricas que una fila por andén. */
export function resumenGeneral(rows) {
  const agg = emptyAgg(null);
  for (const a of rows || []) addTo(agg, a);
  const r = finish(agg);
  return { ...r, andenes: new Set((rows || []).map((a) => andenKey(a.idAnden))).size };
}

/** "h:mm" de una duración en ms. */
export function fmtDuracion(ms) {
  const totalMin = Math.round(num(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
