// Reporte de descargas por andén → .xlsx (exceljs, carga perezosa).
//
// Hojas:
//   • Resumen    — metadatos y KPIs (fórmulas sobre «Descargas»).
//   • Por andén  — descargas, bultos y tiempos por andén (COUNTIFS / SUMIFS) + total.
//   • Descargas  — una fila por descarga, autofiltro, paneles congelados y fila
//                  de totales con SUBTOTAL (respeta el filtro de Excel).
// Mismo estilo de marca que el reporte de despachos.

import { andenKey, andenLabel } from "../../../utils/andenes.js";
import { duracionMs, estadoDescarga, resumenPorAnden, tipoKey, toDate } from "./descargasAndenReporte.js";

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

/** exceljs escribe en UTC: se pasa la hora local "como UTC" para que Excel la muestre igual. */
function excelDate(value, { dateOnly = false } = {}) {
  const d = toDate(value);
  if (!d) return null;
  return dateOnly
    ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
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

/** Columnas de «Descargas» (orden = letras A…). */
const DETALLE_COLS = [
  { header: "Registrada", width: 17, numFmt: "dd/mm/yyyy hh:mm", align: "center" }, // A
  { header: "Día", width: 12, numFmt: "dd/mm/yyyy", align: "center" }, // B
  { header: "Andén", width: 8, numFmt: "0", align: "center" }, // C
  { header: "Proveedor", width: 30 }, // D
  { header: "Tipo", width: 15 }, // E
  { header: "Tipo de descarga", width: 15 }, // F
  { header: "Estado", width: 12, align: "center" }, // G
  { header: "Bultos", width: 10, numFmt: "#,##0", align: "right" }, // H
  { header: "Inicio", width: 17, numFmt: "dd/mm/yyyy hh:mm", align: "center" }, // I
  { header: "Fin", width: 17, numFmt: "dd/mm/yyyy hh:mm", align: "center" }, // J
  { header: "Duración (min)", width: 11, numFmt: "#,##0.0", align: "right" }, // K
  { header: "Pausas (min)", width: 10, numFmt: "#,##0.0", align: "right" }, // L
  { header: "Descargó", width: 22 }, // M
  { header: "Registró", width: 22 }, // N
  { header: "Bodega", width: 14 }, // O
  { header: "Reserva SRO", width: 38 }, // P
];

/**
 * @param {object} p
 * @param {object[]} p.descargas  Ya filtradas (orden de la tabla).
 * @param {{ company?: string, bodega?: string, desde: string, hasta: string, filtrosTexto?: string, usuario?: string }} p.meta
 * @returns {Promise<string>} nombre del archivo
 */
export async function downloadReporteDescargasAnden({ descargas, meta }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const now = new Date();
  wb.creator = "AppOLO Desk";
  wb.created = now;
  wb.modified = now;
  wb.calcProperties = { fullCalcOnLoad: true };

  const rows = Array.isArray(descargas) ? descargas : [];
  const n = rows.length;
  const first = 2;
  const last = Math.max(first, n + 1);
  const rng = (col) => `Descargas!$${col}$${first}:$${col}$${last}`;
  const periodo = meta.desde === meta.hasta ? meta.desde : `${meta.desde} al ${meta.hasta}`;

  const wsRes = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  const wsAnden = wb.addWorksheet("Por andén", { views: [{ showGridLines: false }] });
  const wsDet = wb.addWorksheet("Descargas", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });

  // ── Descargas (detalle) ────────────────────────────────────────────────
  wsDet.columns = DETALLE_COLS.map((c) => ({ width: c.width }));
  const head = wsDet.getRow(1);
  DETALLE_COLS.forEach((c, i) => (head.getCell(i + 1).value = c.header));
  styleHeaderRow(head, DETALLE_COLS.length);

  rows.forEach((a, i) => {
    const r = first + i;
    const dur = duracionMs(a);
    const values = [
      excelDate(a.creadoAt),
      excelDate(a.creadoAt, { dateOnly: true }),
      andenKey(a.idAnden) ?? "",
      a.proveedorNombre || "",
      tipoKey(a),
      a.tipoDescarga || "",
      estadoDescarga(a),
      Number(a.cantidadBultos) || 0,
      excelDate(a.startedAt),
      excelDate(a.completedAt),
      dur ? dur / 60000 : "",
      Number(a.pausedTotalMs) ? Number(a.pausedTotalMs) / 60000 : 0,
      a.starter || "",
      a.creadoPorNombre || "",
      a.bodegaNombre || a.bodegaId || "",
      a.reservaId || "",
    ];
    const row = wsDet.getRow(r);
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v ?? "";
      const col = DETALLE_COLS[ci];
      styleDataCell(cell, { zebra: i % 2 === 1, align: col.align, numFmt: col.numFmt, bold: ci === 2 });
    });
    row.height = 18;
  });

  const tot = wsDet.getRow(last + 1);
  tot.getCell(1).value = "TOTAL (filas visibles)";
  tot.getCell(4).value = { formula: `SUBTOTAL(103,D${first}:D${last})`, result: n };
  for (const col of ["H", "K", "L"]) {
    tot.getCell(col.charCodeAt(0) - 64).value = { formula: `SUBTOTAL(109,${col}${first}:${col}${last})` };
  }
  styleTotalRow(tot, DETALLE_COLS.length);
  for (const ci of [4, 8]) tot.getCell(ci).numFmt = "#,##0";
  for (const ci of [11, 12]) tot.getCell(ci).numFmt = "#,##0.0";
  wsDet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: DETALLE_COLS.length } };

  // ── Por andén ─────────────────────────────────────────────────────────
  const andenes = resumenPorAnden(rows);
  const COLS = ["Andén", "Descargas", "Finalizadas", "Bultos", "Minutos de descarga", "Promedio (min)", "Bultos por hora", "% de descargas"];
  wsAnden.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 13 }];
  titleBand(wsAnden, "Descargas por andén", `Periodo: ${periodo}`, COLS.length);
  const aHead = wsAnden.getRow(4);
  COLS.forEach((h, i) => (aHead.getCell(i + 1).value = h));
  styleHeaderRow(aHead, COLS.length);
  const aFirst = 5;
  const aLast = aFirst + Math.max(andenes.length, 1) - 1;
  const fin = '"Finalizada"';
  andenes.forEach((x, i) => {
    const r = aFirst + i;
    const row = wsAnden.getRow(r);
    const z = i % 2 === 1;
    const crit = x.anden === null ? '"="' : String(x.anden);
    row.getCell(1).value = andenLabel(x.anden);
    row.getCell(2).value = { formula: `COUNTIFS(${rng("C")},${crit})`, result: x.descargas };
    row.getCell(3).value = { formula: `COUNTIFS(${rng("C")},${crit},${rng("G")},${fin})`, result: x.finalizadas };
    row.getCell(4).value = { formula: `SUMIFS(${rng("H")},${rng("C")},${crit})`, result: x.bultos };
    row.getCell(5).value = { formula: `SUMIFS(${rng("K")},${rng("C")},${crit},${rng("G")},${fin})` };
    row.getCell(6).value = { formula: `IFERROR(E${r}/C${r},0)` };
    row.getCell(7).value = { formula: `IFERROR(SUMIFS(${rng("H")},${rng("C")},${crit},${rng("G")},${fin})/(E${r}/60),0)` };
    row.getCell(8).value = { formula: `IFERROR(B${r}/B$${aLast + 1},0)` };
    styleDataCell(row.getCell(1), { zebra: z, align: "center", bold: true });
    for (const ci of [2, 3, 4, 5]) styleDataCell(row.getCell(ci), { zebra: z, align: "right", numFmt: "#,##0", bold: ci === 2 });
    styleDataCell(row.getCell(6), { zebra: z, align: "right", numFmt: "0.0" });
    styleDataCell(row.getCell(7), { zebra: z, align: "right", numFmt: "#,##0.0" });
    styleDataCell(row.getCell(8), { zebra: z, align: "right", numFmt: "0.0%" });
  });
  const aTot = wsAnden.getRow(aLast + 1);
  const T = aLast + 1;
  aTot.getCell(1).value = "TOTAL";
  for (const [ci, col] of [[2, "B"], [3, "C"], [4, "D"], [5, "E"]]) {
    aTot.getCell(ci).value = { formula: `SUM(${col}${aFirst}:${col}${aLast})` };
  }
  aTot.getCell(6).value = { formula: `IFERROR(E${T}/C${T},0)` };
  aTot.getCell(7).value = { formula: `IFERROR(SUMIFS(${rng("H")},${rng("G")},${fin})/(E${T}/60),0)` };
  aTot.getCell(8).value = { formula: `IFERROR(B${T}/B${T},0)` };
  styleTotalRow(aTot, COLS.length);
  for (const ci of [2, 3, 4, 5]) aTot.getCell(ci).numFmt = "#,##0";
  aTot.getCell(6).numFmt = "0.0";
  aTot.getCell(7).numFmt = "#,##0.0";
  aTot.getCell(8).numFmt = "0.0%";
  wsAnden.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];

  // ── Resumen ───────────────────────────────────────────────────────────
  wsRes.columns = [{ width: 32 }, { width: 22 }, { width: 4 }, { width: 40 }];
  titleBand(wsRes, "Descargas por andén", "AppOLO Desk · Recepción", 4);
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
    ["Descargas", `COUNTA(${rng("D")})`, "#,##0"],
    ["Descargas finalizadas", `COUNTIFS(${rng("G")},${fin})`, "#,##0"],
    ["Bultos", `SUM(${rng("H")})`, "#,##0"],
    ["Minutos de descarga (finalizadas)", `SUM(${rng("K")})`, "#,##0"],
    ["Promedio por descarga (min)", `IFERROR(SUM(${rng("K")})/COUNTIFS(${rng("G")},${fin}),0)`, "0.0"],
    ["Bultos por hora (finalizadas)", `IFERROR(SUMIFS(${rng("H")},${rng("G")},${fin})/(SUM(${rng("K")})/60),0)`, "#,##0.0"],
    ["Andenes con descargas", `COUNTA('Por andén'!$A$${aFirst}:$A$${aLast})`, "#,##0"],
  ];
  kpis.forEach(([label, formula, fmt], i) => {
    const row = wsRes.getRow(r++);
    row.getCell(1).value = label;
    row.getCell(2).value = n ? { formula } : 0;
    styleDataCell(row.getCell(1), { zebra: i % 2 === 1, bold: true });
    styleDataCell(row.getCell(2), { zebra: i % 2 === 1, align: "right", numFmt: fmt, bold: label === "Descargas" });
  });
  r += 1;
  const nota = wsRes.getRow(r);
  wsRes.mergeCells(r, 1, r, 4);
  nota.getCell(1).value =
    "El andén se normaliza al número (\"02\" y \"2\" son el andén 2). Duración = tiempo de descarga sin pausas, solo en descargas finalizadas. Los totales son fórmulas sobre la hoja «Descargas».";
  nota.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
  nota.getCell(1).alignment = { wrapText: true };
  nota.height = 30;

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `descargas_por_anden_${safePart(meta.bodega)}_${meta.desde}_a_${meta.hasta}_${fileStamp()}.xlsx`;
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
