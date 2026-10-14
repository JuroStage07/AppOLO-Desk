// Exportación a Excel (.xlsx) de las pantallas de Horas Extra.
// exceljs se importa de forma perezosa para no inflar el bundle inicial.

const ACCENT_ARGB = "FF089F8A";
const HEADER_TEXT_ARGB = "FFFFFFFF";
const BORDER_ARGB = "FFD9DEE7";
const TITLE_ARGB = "FF0F172A";
const MUTED_ARGB = "FF64748B";
const ZEBRA_ARGB = "FFF6F8FB";

const thin = { style: "thin", color: { argb: BORDER_ARGB } };
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin };

function sanitizeSheetName(raw, used) {
  const base = String(raw || "Hoja").replace(/[\\/?*:[\]]/g, "-").slice(0, 31) || "Hoja";
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${i++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function safeFileName(base) {
  const clean = String(base || "horas-extra")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `${clean || "horas-extra"}-${stamp}.xlsx`;
}

function downloadBuffer(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function writeSheet(wb, used, { name, title, meta = [], columns, rows }) {
  const ws = wb.addWorksheet(sanitizeSheetName(name, used), {
    views: [{ showGridLines: false }],
  });
  const colCount = columns.length;
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width || 16;
  });

  let r = 1;
  if (title) {
    ws.mergeCells(r, 1, r, colCount);
    const cell = ws.getCell(r, 1);
    cell.value = title;
    cell.font = { bold: true, size: 15, color: { argb: TITLE_ARGB } };
    ws.getRow(r).height = 24;
    r += 1;
  }
  meta.forEach(([label, value]) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, color: { argb: MUTED_ARGB } };
    ws.mergeCells(r, 2, r, Math.max(2, colCount));
    ws.getCell(r, 2).value = value ?? "";
    ws.getCell(r, 2).font = { color: { argb: TITLE_ARGB } };
    r += 1;
  });
  if (title || meta.length) r += 1;

  const headerRowIndex = r;
  const header = ws.getRow(headerRowIndex);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: HEADER_TEXT_ARGB } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_ARGB } };
    cell.alignment = { vertical: "middle", horizontal: col.align || "left", wrapText: true };
    cell.border = cellBorder;
  });
  header.height = 22;

  rows.forEach((row, idx) => {
    const excelRow = ws.getRow(headerRowIndex + 1 + idx);
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const value = row[col.key];
      cell.value = value === undefined || value === null ? "" : value;
      if (col.numFmt) cell.numFmt = col.numFmt;
      cell.alignment = { vertical: "middle", horizontal: col.align || "left" };
      cell.border = cellBorder;
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_ARGB } };
      }
    });
  });

  if (rows.length) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex + rows.length, column: colCount },
    };
  }
  ws.views = [{ state: "frozen", ySplit: headerRowIndex, showGridLines: false }];
}

/**
 * Descarga un .xlsx con una o varias hojas.
 * @param {{ fileName: string, sheets: Array<{
 *   name: string, title?: string, meta?: Array<[string, any]>,
 *   columns: Array<{ header: string, key: string, width?: number, numFmt?: string, align?: string }>,
 *   rows: object[]
 * }> }} opts
 */
export async function downloadOvertimeXlsx({ fileName, sheets }) {
  const usable = (sheets || []).filter((s) => s && Array.isArray(s.columns));
  if (!usable.length || usable.every((s) => !s.rows?.length)) {
    throw new Error("No hay datos para exportar con los filtros actuales.");
  }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const now = new Date();
  wb.creator = "AppOLO Desk";
  wb.created = now;
  wb.modified = now;

  const used = new Set();
  usable.forEach((sheet) => writeSheet(wb, used, { ...sheet, rows: sheet.rows || [] }));

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, safeFileName(fileName));
}

/** Minutos → horas decimales con 2 decimales (para celdas numéricas en Excel). */
export function minutesToHours(minutes) {
  const n = Number(minutes) || 0;
  return Math.round((n / 60) * 100) / 100;
}
