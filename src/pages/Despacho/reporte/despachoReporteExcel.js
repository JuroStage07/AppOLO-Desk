// Reporte de despachos → .xlsx (exceljs, carga perezosa).
//
// Hojas:
//   • Resumen     — encabezado de marca, metadatos y KPIs (fórmulas sobre «Despachos»).
//   • Por tienda  — despachos y tarimas por tienda (COUNTIFS / SUMIFS) + total.
//   • Por día     — despachos y tarimas por día (COUNTIFS / SUMIFS) + total.
//   • Despachos   — una fila por despacho con todos los campos, autofiltro,
//                   paneles congelados y fila de totales con SUBTOTAL (respeta
//                   el filtro que aplique el usuario en Excel).
// Los totales son fórmulas: si alguien edita o filtra, se recalculan.

import { labelFor } from "../board/lib/mapaEstados.js";
import { resumenPorDia, resumenPorTienda, tiendaKey } from "./despachoReporte.js";

const BRAND = "FF089F8A";
const BRAND_DARK = "FF067A6B";
const BRAND_SOFT = "FFF1FBF8";
const ZEBRA = "FFF7FAFC";
const INK = "FF0F172A";
const MUTED = "FF64748B";
const LINE = "FFE2E8F0";
const FONT = "Arial";

const thin = (argb) => ({ style: "thin", color: { argb } });
const hair = { style: "hair", color: { argb: LINE } };
const BOX_HAIR = { top: hair, bottom: hair, left: hair, right: hair };

/**
 * exceljs escribe las fechas en UTC; para que Excel muestre la hora local de
 * Costa Rica se pasa un Date "local como UTC".
 */
function excelDate(value, { dateOnly = false } = {}) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return dateOnly
    ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

function isoDayToExcel(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function siNo(v) {
  if (v === true) return "Sí";
  if (v === false) return "No";
  const s = String(v ?? "").trim();
  return s || "";
}

function fileStamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function safePart(v) {
  return (
    String(v || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "reporte"
  );
}

function styleHeaderRow(row, count) {
  row.height = 24;
  for (let c = 1; c <= count; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thin(BRAND_DARK), bottom: thin(BRAND_DARK), left: thin(BRAND_DARK), right: thin(BRAND_DARK) };
  }
}

function styleDataCell(cell, { zebra, align, numFmt, bold } = {}) {
  cell.font = { name: FONT, size: 10, color: { argb: INK }, bold: !!bold };
  cell.alignment = { vertical: "middle", horizontal: align || "left" };
  if (numFmt) cell.numFmt = numFmt;
  if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
  cell.border = BOX_HAIR;
}

function styleTotalRow(row, count) {
  row.height = 22;
  for (let c = 1; c <= count; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: BRAND_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
    cell.border = { top: thin(BRAND), bottom: thin(BRAND), left: hair, right: hair };
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right" };
  }
}

/** Banda de título de marca en las filas 1–2 de una hoja. */
function titleBand(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, lastCol);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, italic: true, color: { argb: BRAND_DARK } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 20;
}

/** Columnas de la hoja «Despachos» (orden = letras A…). */
const DETALLE_COLS = [
  { header: "Fecha y hora", width: 17, numFmt: "dd/mm/yyyy hh:mm", align: "center" },
  { header: "Día", width: 12, numFmt: "dd/mm/yyyy", align: "center" },
  { header: "Referencia", width: 26 },
  { header: "Tienda", width: 12, align: "center" },
  { header: "Estado", width: 20 },
  { header: "Tarimas sencillas", width: 11, numFmt: "#,##0", align: "right" },
  { header: "Tarimas dobles", width: 11, numFmt: "#,##0", align: "right" },
  { header: "Total tarimas", width: 11, numFmt: "#,##0", align: "right" },
  { header: "Tipo", width: 8, align: "center" },
  { header: "Bodega", width: 12 },
  { header: "Compañía", width: 10 },
  { header: "Placa", width: 12 },
  { header: "Placa contenedor", width: 14 },
  { header: "Marchamo", width: 12 },
  { header: "Puerta", width: 11 },
  { header: "Transportista", width: 18 },
  { header: "Chofer", width: 24 },
  { header: "Cédula chofer", width: 14 },
  { header: "Con DUA", width: 8, align: "center" },
  { header: "Número DUA", width: 14 },
  { header: "Fotos", width: 7, numFmt: "#,##0", align: "right" },
  { header: "Finalizado", width: 17, numFmt: "dd/mm/yyyy hh:mm", align: "center" },
  { header: "Traslado MRP", width: 14 },
  { header: "Motivo de estado", width: 24 },
  { header: "Notas", width: 40 },
];

/**
 * Genera y descarga el reporte.
 *
 * @param {object} p
 * @param {object[]} p.despachos  Despachos ya filtrados (orden de la tabla).
 * @param {Map<string, object>} p.choferes
 * @param {object[]} p.catalogo   Catálogo de estados (para etiquetas).
 * @param {{ company?: string, bodega?: string, desde: string, hasta: string, filtrosTexto?: string, usuario?: string }} p.meta
 * @returns {Promise<string>} nombre del archivo descargado
 */
export async function downloadReporteDespachos({ despachos, choferes, catalogo, meta }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const now = new Date();
  wb.creator = "AppOLO Desk";
  wb.created = now;
  wb.modified = now;
  wb.calcProperties = { fullCalcOnLoad: true };

  const rows = Array.isArray(despachos) ? despachos : [];
  const n = rows.length;
  const first = 2;
  const last = Math.max(first, n + 1); // rango de datos en «Despachos»
  const rng = (col) => `Despachos!$${col}$${first}:$${col}$${last}`;
  const periodo = meta.desde === meta.hasta ? meta.desde : `${meta.desde} al ${meta.hasta}`;

  // Orden de hojas: Resumen, Por tienda, Por día, Despachos.
  const wsRes = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  const wsTienda = wb.addWorksheet("Por tienda", { views: [{ showGridLines: false }] });
  const wsDia = wb.addWorksheet("Por día", { views: [{ showGridLines: false }] });
  const wsDet = wb.addWorksheet("Despachos", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });

  // ── Despachos (detalle) ────────────────────────────────────────────────
  wsDet.columns = DETALLE_COLS.map((c) => ({ width: c.width }));
  const head = wsDet.getRow(1);
  DETALLE_COLS.forEach((c, i) => {
    head.getCell(i + 1).value = c.header;
  });
  styleHeaderRow(head, DETALLE_COLS.length);

  rows.forEach((d, i) => {
    const r = first + i;
    const chofer = d.chofer_id ? choferes?.get?.(d.chofer_id) : null;
    const values = [
      excelDate(d.fecha),
      excelDate(d.fecha, { dateOnly: true }),
      d.referencia || "",
      tiendaKey(d),
      labelFor(d.estado, catalogo),
      Number(d.tarimas_s) || 0,
      Number(d.tarimas_d) || 0,
      { formula: `F${r}+G${r}`, result: (Number(d.tarimas_s) || 0) + (Number(d.tarimas_d) || 0) },
      d.tipo || "",
      d.bodega_nombre || d.bodega_id || "",
      d.company || "",
      d.placa || "",
      d.placa_contenedor || "",
      d.marchamo || "",
      d.puerta || "",
      d.transportista || "",
      chofer?.nombre || "",
      chofer?.cedula || "",
      siNo(d.con_dua),
      d.numero_dua || "",
      Number(d.fotos_count) || 0,
      excelDate(d.finalized_at),
      d.mrp_traslado || "",
      d.estado_motivo || "",
      d.notas || "",
    ];
    const row = wsDet.getRow(r);
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v ?? "";
      const col = DETALLE_COLS[ci];
      styleDataCell(cell, { zebra: i % 2 === 1, align: col.align, numFmt: col.numFmt, bold: ci === 7 });
    });
    row.height = 18;
  });

  // Fila de totales: SUBTOTAL(109/103) respeta el autofiltro de Excel.
  const totalIdx = last + 1;
  const tot = wsDet.getRow(totalIdx);
  tot.getCell(1).value = "TOTAL (filas visibles)";
  tot.getCell(3).value = { formula: `SUBTOTAL(103,C${first}:C${last})`, result: n };
  for (const col of ["F", "G", "H", "U"]) {
    const ci = col.charCodeAt(0) - 64;
    tot.getCell(ci).value = { formula: `SUBTOTAL(109,${col}${first}:${col}${last})` };
  }
  styleTotalRow(tot, DETALLE_COLS.length);
  for (const ci of [3, 6, 7, 8, 21]) tot.getCell(ci).numFmt = "#,##0";
  wsDet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: DETALLE_COLS.length } };

  // ── Por tienda ────────────────────────────────────────────────────────
  const tiendas = resumenPorTienda(rows);
  wsTienda.columns = [{ width: 14 }, { width: 12 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 14 }];
  titleBand(wsTienda, "Tarimas por tienda", `Periodo: ${periodo}`, 7);
  const tHead = wsTienda.getRow(4);
  ["Tienda", "Despachos", "Tarimas sencillas", "Tarimas dobles", "Total tarimas", "Promedio por despacho", "% del total"].forEach(
    (h, i) => (tHead.getCell(i + 1).value = h)
  );
  styleHeaderRow(tHead, 7);
  const tFirst = 5;
  const tLast = tFirst + Math.max(tiendas.length, 1) - 1;
  tiendas.forEach((t, i) => {
    const r = tFirst + i;
    const row = wsTienda.getRow(r);
    const z = i % 2 === 1;
    row.getCell(1).value = t.tienda;
    row.getCell(2).value = { formula: `COUNTIFS(${rng("D")},A${r})`, result: t.despachos };
    row.getCell(3).value = { formula: `SUMIFS(${rng("F")},${rng("D")},A${r})`, result: t.sencillas };
    row.getCell(4).value = { formula: `SUMIFS(${rng("G")},${rng("D")},A${r})`, result: t.dobles };
    row.getCell(5).value = { formula: `C${r}+D${r}`, result: t.total };
    row.getCell(6).value = { formula: `IFERROR(E${r}/B${r},0)`, result: t.promedio };
    row.getCell(7).value = { formula: `IFERROR(E${r}/E$${tLast + 1},0)` };
    styleDataCell(row.getCell(1), { zebra: z, align: "center", bold: true });
    styleDataCell(row.getCell(2), { zebra: z, align: "right", numFmt: "#,##0" });
    styleDataCell(row.getCell(3), { zebra: z, align: "right", numFmt: "#,##0" });
    styleDataCell(row.getCell(4), { zebra: z, align: "right", numFmt: "#,##0" });
    styleDataCell(row.getCell(5), { zebra: z, align: "right", numFmt: "#,##0", bold: true });
    styleDataCell(row.getCell(6), { zebra: z, align: "right", numFmt: "0.0" });
    styleDataCell(row.getCell(7), { zebra: z, align: "right", numFmt: "0.0%" });
  });
  const tTot = wsTienda.getRow(tLast + 1);
  tTot.getCell(1).value = "TOTAL";
  for (const [ci, col] of [[2, "B"], [3, "C"], [4, "D"], [5, "E"]]) {
    tTot.getCell(ci).value = { formula: `SUM(${col}${tFirst}:${col}${tLast})` };
  }
  tTot.getCell(6).value = { formula: `IFERROR(E${tLast + 1}/B${tLast + 1},0)` };
  tTot.getCell(7).value = { formula: `IFERROR(E${tLast + 1}/E${tLast + 1},0)` };
  styleTotalRow(tTot, 7);
  for (const ci of [2, 3, 4, 5]) tTot.getCell(ci).numFmt = "#,##0";
  tTot.getCell(6).numFmt = "0.0";
  tTot.getCell(7).numFmt = "0.0%";
  wsTienda.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];

  // ── Por día ───────────────────────────────────────────────────────────
  const dias = resumenPorDia(rows);
  wsDia.columns = [{ width: 14 }, { width: 12 }, { width: 14 }, { width: 13 }, { width: 13 }];
  titleBand(wsDia, "Tarimas por día", `Periodo: ${periodo}`, 5);
  const dHead = wsDia.getRow(4);
  ["Día", "Despachos", "Tarimas sencillas", "Tarimas dobles", "Total tarimas"].forEach((h, i) => (dHead.getCell(i + 1).value = h));
  styleHeaderRow(dHead, 5);
  const dFirst = 5;
  const dLast = dFirst + Math.max(dias.length, 1) - 1;
  dias.forEach((x, i) => {
    const r = dFirst + i;
    const row = wsDia.getRow(r);
    const z = i % 2 === 1;
    row.getCell(1).value = isoDayToExcel(x.dia);
    row.getCell(2).value = { formula: `COUNTIFS(${rng("B")},A${r})`, result: x.despachos };
    row.getCell(3).value = { formula: `SUMIFS(${rng("F")},${rng("B")},A${r})`, result: x.sencillas };
    row.getCell(4).value = { formula: `SUMIFS(${rng("G")},${rng("B")},A${r})`, result: x.dobles };
    row.getCell(5).value = { formula: `C${r}+D${r}`, result: x.total };
    styleDataCell(row.getCell(1), { zebra: z, align: "center", numFmt: "dd/mm/yyyy", bold: true });
    for (const ci of [2, 3, 4]) styleDataCell(row.getCell(ci), { zebra: z, align: "right", numFmt: "#,##0" });
    styleDataCell(row.getCell(5), { zebra: z, align: "right", numFmt: "#,##0", bold: true });
  });
  const dTot = wsDia.getRow(dLast + 1);
  dTot.getCell(1).value = "TOTAL";
  for (const [ci, col] of [[2, "B"], [3, "C"], [4, "D"], [5, "E"]]) {
    dTot.getCell(ci).value = { formula: `SUM(${col}${dFirst}:${col}${dLast})` };
  }
  styleTotalRow(dTot, 5);
  for (const ci of [2, 3, 4, 5]) dTot.getCell(ci).numFmt = "#,##0";
  wsDia.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];

  // ── Resumen ───────────────────────────────────────────────────────────
  wsRes.columns = [{ width: 30 }, { width: 22 }, { width: 4 }, { width: 40 }];
  titleBand(wsRes, "Reporte de despachos", "AppOLO Desk · Despacho", 4);
  let r = 4;
  const metaRows = [
    ["Compañía", meta.company || "—"],
    ["Bodega", meta.bodega || "—"],
    ["Periodo", periodo],
    ["Filtros", meta.filtrosTexto || "Sin filtros adicionales"],
    ["Generado", now.toLocaleString("es-CR")],
    ["Usuario", meta.usuario || "—"],
  ];
  for (const [label, value] of metaRows) {
    const row = wsRes.getRow(r++);
    row.getCell(1).value = label;
    row.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: MUTED } };
    wsRes.mergeCells(row.number, 2, row.number, 4);
    row.getCell(2).value = value;
    row.getCell(2).font = { name: FONT, size: 10, color: { argb: INK } };
    row.getCell(2).alignment = { wrapText: true, vertical: "middle" };
  }
  r += 1;
  const kHead = wsRes.getRow(r++);
  kHead.getCell(1).value = "Indicador";
  kHead.getCell(2).value = "Valor";
  styleHeaderRow(kHead, 2);
  const kpis = [
    ["Despachos", `COUNTA(${rng("C")})`, "#,##0"],
    ["Tarimas sencillas", `SUM(${rng("F")})`, "#,##0"],
    ["Tarimas dobles", `SUM(${rng("G")})`, "#,##0"],
    ["Total tarimas", `SUM(${rng("H")})`, "#,##0"],
    ["Promedio de tarimas por despacho", `IFERROR(SUM(${rng("H")})/COUNTA(${rng("C")}),0)`, "0.0"],
    ["Tiendas atendidas", `COUNTA('Por tienda'!$A$${tFirst}:$A$${tLast})`, "#,##0"],
  ];
  kpis.forEach(([label, formula, fmt], i) => {
    const row = wsRes.getRow(r++);
    row.getCell(1).value = label;
    row.getCell(2).value = n ? { formula } : 0;
    styleDataCell(row.getCell(1), { zebra: i % 2 === 1, bold: true });
    styleDataCell(row.getCell(2), { zebra: i % 2 === 1, align: "right", numFmt: fmt, bold: label === "Total tarimas" });
  });
  r += 1;
  const nota = wsRes.getRow(r);
  wsRes.mergeCells(r, 1, r, 4);
  nota.getCell(1).value =
    "Total tarimas = sencillas + dobles. Los totales son fórmulas sobre la hoja «Despachos»; la fila TOTAL de esa hoja respeta el filtro que apliques en Excel.";
  nota.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
  nota.getCell(1).alignment = { wrapText: true };
  nota.height = 30;

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `reporte_despachos_${safePart(meta.bodega)}_${meta.desde}_a_${meta.hasta}_${fileStamp()}.xlsx`;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return fileName;
}
