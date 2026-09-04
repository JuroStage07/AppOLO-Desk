// Control de marcas — Exportador Excel del Historial de marcas.
//
// Genera un .xlsx con el mismo estilo corporativo que el resto de los
// exportadores del proyecto (ver src/utils/mrpExcelReport.js):
//   • Encabezado con logo, título y franja de marca.
//   • Metadatos (día/rango, modo de usuario, compañía, scope, generado).
//   • Organizado por usuario:
//       - Un solo usuario  → hoja única con su lista de marcas.
//       - Varios usuarios  → primera hoja "Índice" con nombre + cédula y un
//         hipervínculo interno a la hoja/sección de cada usuario.
//
// exceljs se importa de forma perezosa (dynamic import) para no inflar el
// bundle inicial, siguiendo el patrón de los otros exportadores.

// Paleta de marca (coherente con src/styles/theme.js: ACCENT #089F8A).
const BRAND = "FF089F8A";
const BRAND_DARK = "FF067A6B";
const BRAND_SOFT = "FFF1FBF8";
const ZEBRA = "FFF7FAFC";
const INK = "FF0F172A";
const MUTED = "FF64748B";
const BORDER = "FFE2E8F0";
const LINK = "FF0563C1";

const INDEX_SHEET_NAME = "Índice";

// Excel admite muchas hojas, pero cientos de hojas hacen el archivo lento e
// incómodo. Por encima de este número se consolidan las marcas en una sola
// hoja con secciones por usuario (el índice enlaza a la fila de cada sección).
const MAX_USER_SHEETS = 120;

// Nombres de hoja reservados / inválidos en Excel.
const RESERVED_SHEET_NAMES = new Set(["history", "historia"]);

let _logoCache; // Promise<string|null> — base64 del logo, cacheado tras la 1ª carga.

async function loadLogoBase64() {
  if (_logoCache !== undefined) return _logoCache;
  _logoCache = (async () => {
    try {
      const res = await fetch("/AppOLO_logo.png");
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    } catch {
      return null;
    }
  })();
  return _logoCache;
}

// Nombre de archivo seguro (sin caracteres inválidos) + marca de fecha.
function buildFileName(base) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const clean = String(base || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `${clean || "reporte"}_${stamp}.xlsx`;
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

/**
 * Nombre de hoja válido para Excel: máx. 31 caracteres, sin `\ / ? * : [ ]`
 * y sin comillas/apóstrofos (que romperían la referencia del hipervínculo).
 */
export function sanitizeSheetName(raw, fallback = "Usuario") {
  let s = String(raw || "")
    .replace(/[\\/*?:[\]'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = fallback;
  if (s.length > 31) s = s.slice(0, 31).trim();
  if (!s) s = fallback;
  if (RESERVED_SHEET_NAMES.has(s.toLowerCase())) s = `${s} `.slice(0, 31).trim() + "_";
  return s.slice(0, 31);
}

/** Garantiza unicidad (Excel no admite hojas con el mismo nombre). */
export function uniqueSheetName(raw, used, fallback = "Usuario") {
  const clean = sanitizeSheetName(raw, fallback);
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  let n = 2;
  for (;;) {
    const suffix = ` (${n})`;
    const candidate = `${clean.slice(0, 31 - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
    n += 1;
  }
}

// Texto seguro dentro de una cadena de fórmula de Excel (comillas dobles).
function escapeFormulaText(value) {
  return String(value == null ? "" : value).replace(/"/g, '""');
}

/**
 * Hipervínculo interno como fórmula HYPERLINK: es la forma más compatible de
 * enlazar entre hojas del mismo libro (Excel, LibreOffice y Sheets lo abren).
 */
function internalLinkCell(sheetName, cellRef, text) {
  const target = `#'${escapeFormulaText(sheetName)}'!${cellRef}`;
  return {
    formula: `HYPERLINK("${target}","${escapeFormulaText(text)}")`,
    result: String(text == null ? "" : text),
  };
}

function applyLinkStyle(cell) {
  cell.font = { size: 10, bold: true, color: { argb: LINK }, underline: true };
}

/** Ancho de columna a partir del contenido, acotado. */
function autoWidth(header, rows, colIndex, min = 12, max = 46) {
  let width = String(header || "").length;
  for (const row of rows) {
    const v = row[colIndex];
    const raw =
      v && typeof v === "object" && !(v instanceof Date) ? v.text ?? "" : v;
    const len = raw == null ? 1 : String(raw).length;
    if (len > width) width = len;
  }
  return Math.min(Math.max(width + 3, min), max);
}

/** Franja de título con logo. Devuelve la siguiente fila libre. */
function writeReportHeader(ws, wb, { title, subtitle, logo, maxCols }) {
  const lastColLetter = ws.getColumn(maxCols).letter;

  ws.mergeCells(`A1:${lastColLetter}2`);
  const titleCell = ws.getCell("A1");
  titleCell.value = title || "Reporte";
  titleCell.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 22;

  if (logo) {
    const imgId = wb.addImage({ base64: logo, extension: "png" });
    ws.addImage(imgId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 132, height: 40 },
      editAs: "oneCell",
    });
  }

  let r = 3;

  if (subtitle) {
    ws.mergeCells(r, 1, r, maxCols);
    const cell = ws.getCell(r, 1);
    cell.value = subtitle;
    cell.font = { size: 11, bold: true, color: { argb: BRAND_DARK } };
    cell.alignment = { vertical: "middle" };
    ws.getRow(r).height = 20;
    r += 1;
  }

  return r;
}

/** Bloque etiqueta/valor. Devuelve la siguiente fila libre. */
function writeMetaBlock(ws, startRow, { meta = [], filtersText = "", maxCols }) {
  let r = startRow;
  for (const [label, value] of meta) {
    if (value == null || value === "") continue;
    const row = ws.getRow(r);
    row.height = 18;
    const c1 = row.getCell(1);
    c1.value = String(label);
    c1.font = { bold: true, size: 10, color: { argb: MUTED } };
    c1.alignment = { vertical: "middle" };
    ws.mergeCells(r, 2, r, maxCols);
    const c2 = row.getCell(2);
    c2.value = value;
    c2.font = { size: 10, color: { argb: INK } };
    c2.alignment = { vertical: "middle", wrapText: true };
    r += 1;
  }

  if (filtersText) {
    const row = ws.getRow(r);
    row.height = 18;
    const c1 = row.getCell(1);
    c1.value = "Filtros";
    c1.font = { bold: true, size: 10, color: { argb: MUTED } };
    ws.mergeCells(r, 2, r, maxCols);
    const c2 = row.getCell(2);
    c2.value = filtersText;
    c2.font = { size: 10, italic: true, color: { argb: BRAND_DARK } };
    c2.alignment = { vertical: "middle", wrapText: true };
    r += 1;
  }

  return r + 1; // espaciador
}

/**
 * Tabla con cabecera de marca, cebra y bordes.
 * Los valores de celda pueden ser primitivos, Date o `{ link: {...}, text }`.
 * Devuelve la siguiente fila libre.
 */
function writeTable(ws, startRow, columns, rows, { autoFilter = true } = {}) {
  let r = startRow;
  const headerRowIdx = r;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 22;

  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col.align === "right" ? "right" : col.align === "center" ? "center" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND_DARK } },
      bottom: { style: "thin", color: { argb: BRAND_DARK } },
      left: { style: "thin", color: { argb: BRAND_DARK } },
      right: { style: "thin", color: { argb: BRAND_DARK } },
    };
  });
  r += 1;

  rows.forEach((rowVals, ri) => {
    const dataRow = ws.getRow(r);
    dataRow.height = 18;
    columns.forEach((col, ci) => {
      const cell = dataRow.getCell(ci + 1);
      const raw = rowVals[ci];
      const isLink = raw && typeof raw === "object" && raw.linkSheet;

      if (isLink) {
        cell.value = internalLinkCell(raw.linkSheet, raw.linkCell || "A1", raw.text);
        applyLinkStyle(cell);
      } else {
        cell.value = raw == null ? "" : raw;
        cell.font = { size: 10, color: { argb: INK } };
        if (raw instanceof Date) {
          cell.numFmt = col.numFmt || "dd/mm/yyyy";
        } else if (col.numeric && typeof raw === "number") {
          cell.numFmt = col.numFmt || "#,##0";
        }
      }

      cell.alignment = {
        vertical: "middle",
        horizontal: col.align === "right" ? "right" : col.align === "center" ? "center" : "left",
        wrapText: false,
      };
      if (ri % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
      cell.border = {
        top: { style: "hair", color: { argb: BORDER } },
        bottom: { style: "hair", color: { argb: BORDER } },
        left: { style: "hair", color: { argb: BORDER } },
        right: { style: "hair", color: { argb: BORDER } },
      };
    });
    r += 1;
  });

  if (autoFilter) {
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: Math.max(headerRowIdx, r - 1), column: columns.length },
    };
  }

  columns.forEach((col, ci) => {
    const w = col.width || autoWidth(col.header, rows, ci);
    const current = ws.getColumn(ci + 1).width || 0;
    if (w > current) ws.getColumn(ci + 1).width = w;
  });

  return r;
}

/** Encabezado de sección/usuario dentro de una hoja. */
function writeUserHeading(ws, startRow, grupo, maxCols, backLinkSheet) {
  let r = startRow;

  ws.mergeCells(r, 1, r, maxCols);
  const h = ws.getCell(r, 1);
  h.value = grupo.nombre || "Sin nombre";
  h.font = { bold: true, size: 14, color: { argb: BRAND_DARK } };
  h.alignment = { vertical: "middle" };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_SOFT } };
  ws.getRow(r).height = 24;
  r += 1;

  const detalle = [
    `Cédula: ${grupo.cedula || "Sin cédula"}`,
    `Empresa: ${grupo.empresa || "Sin empresa"}`,
    `Marcas: ${grupo.marcas.length}`,
    `Entradas: ${grupo.entradas}`,
    `Salidas: ${grupo.salidas}`,
  ].join("   ·   ");

  ws.mergeCells(r, 1, r, maxCols);
  const d = ws.getCell(r, 1);
  d.value = detalle;
  d.font = { size: 10, bold: true, color: { argb: MUTED } };
  d.alignment = { vertical: "middle" };
  ws.getRow(r).height = 18;
  r += 1;

  if (backLinkSheet) {
    const back = ws.getCell(r, 1);
    back.value = internalLinkCell(backLinkSheet, "A1", "◄ Volver al índice");
    applyLinkStyle(back);
    ws.getRow(r).height = 18;
    r += 1;
  }

  return r + 1; // espaciador
}

const MARCA_COLUMNS = [
  { header: "#", align: "center", width: 6, numeric: true },
  { header: "Fecha", width: 14, numFmt: "dd/mm/yyyy" },
  { header: "Hora", width: 14 },
  { header: "Tipo", width: 12 },
  { header: "Empresa", width: 26 },
  { header: "Motivo", width: 26 },
  { header: "Bodega", width: 20 },
];

function marcaRows(grupo) {
  return grupo.marcas.map((m, i) => [
    i + 1,
    m.fecha instanceof Date ? m.fecha : m.fechaTexto || "",
    m.hora || "",
    m.tipo || "",
    m.empresa || "",
    m.motivo || "",
    m.bodega || "",
  ]);
}

function normalizeGrupo(grupo) {
  const marcas = Array.isArray(grupo?.marcas) ? grupo.marcas : [];
  let entradas = 0;
  let salidas = 0;
  for (const m of marcas) {
    if (String(m?.tipo || "").toLowerCase().startsWith("entrada")) entradas += 1;
    else salidas += 1;
  }
  return {
    id: String(grupo?.id || ""),
    nombre: String(grupo?.nombre || "Sin nombre"),
    cedula: String(grupo?.cedula || ""),
    empresa: String(grupo?.empresa || ""),
    marcas,
    entradas,
    salidas,
  };
}

/**
 * Construye y descarga el reporte Excel del historial de marcas.
 *
 * @param {Object} opts
 * @param {string} [opts.title]        Título del reporte.
 * @param {string} [opts.subtitle]     Subtítulo (p. ej. el período consultado).
 * @param {Array<[string, any]>} [opts.meta]       Pares etiqueta/valor.
 * @param {string} [opts.filtersText]  Descripción de los filtros aplicados.
 * @param {string} [opts.fileName]     Base del nombre de archivo.
 * @param {Array<{id:string,nombre:string,cedula:string,empresa:string,marcas:Array}>} opts.grupos
 *        Un elemento por usuario, ya filtrado y ordenado por quien llama.
 */
export async function downloadHistorialMarcasReport({
  title = "Historial de marcas",
  subtitle = "",
  meta = [],
  filtersText = "",
  fileName = "historial-marcas",
  grupos = [],
} = {}) {
  const normalizados = (Array.isArray(grupos) ? grupos : [])
    .map(normalizeGrupo)
    .filter((g) => g.marcas.length > 0)
    // Id interno único: evita colisiones al mapear destinos de hipervínculo
    // cuando el llamador repite (o no envía) el id del usuario.
    .map((g, i) => ({ ...g, id: `g${i}:${g.id}` }));

  if (!normalizados.length) {
    throw new Error("No hay marcas para exportar.");
  }

  const ExcelJS = (await import("exceljs")).default;
  const logo = await loadLogoBase64();
  const now = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppOLO Desk";
  wb.created = now;
  wb.modified = now;

  const maxCols = MARCA_COLUMNS.length;
  const metaAll = [...meta, ["Generado", now.toLocaleString("es-CR")]];
  const usedNames = new Set();

  // ── Caso 1: un solo usuario → reporte directo, sin índice ─────────────────
  if (normalizados.length === 1) {
    const grupo = normalizados[0];
    const ws = wb.addWorksheet(uniqueSheetName(grupo.nombre, usedNames), {
      views: [{ showGridLines: false }],
    });
    for (let c = 1; c <= maxCols; c++) ws.getColumn(c).width = 14;

    let r = writeReportHeader(ws, wb, { title, subtitle, logo, maxCols });
    r = writeMetaBlock(ws, r, {
      meta: [
        ["Usuario", grupo.nombre],
        ["Cédula", grupo.cedula || "Sin cédula"],
        ["Empresa", grupo.empresa || "Sin empresa"],
        ["Total marcas", grupo.marcas.length],
        ...metaAll,
      ],
      filtersText,
      maxCols,
    });
    const tableStart = r;
    writeTable(ws, tableStart, MARCA_COLUMNS, marcaRows(grupo));
    ws.views = [{ state: "frozen", ySplit: tableStart, showGridLines: false }];

    const buffer = await wb.xlsx.writeBuffer();
    downloadBuffer(buffer, buildFileName(`${fileName}-${grupo.nombre}`));
    return;
  }

  // ── Caso 2: varios usuarios → índice + hoja/sección por usuario ───────────
  const consolidar = normalizados.length > MAX_USER_SHEETS;

  const wsIndex = wb.addWorksheet(uniqueSheetName(INDEX_SHEET_NAME, usedNames, "Indice"), {
    views: [{ showGridLines: false }],
  });
  const indexSheetName = wsIndex.name;

  // Reserva de nombres/anclas: se calculan antes de escribir el índice para
  // que los hipervínculos apunten a destinos ya conocidos.
  const destinos = new Map(); // grupo.id -> { sheet, cell }

  if (consolidar) {
    const wsAll = wb.addWorksheet(uniqueSheetName("Marcas", usedNames, "Marcas"), {
      views: [{ showGridLines: false }],
    });
    for (let c = 1; c <= maxCols; c++) wsAll.getColumn(c).width = 14;

    let r = writeReportHeader(wsAll, wb, {
      title,
      subtitle: subtitle || "Marcas por usuario",
      logo,
      maxCols,
    });

    for (const grupo of normalizados) {
      destinos.set(grupo.id, { sheet: wsAll.name, cell: `A${r}` });
      r = writeUserHeading(wsAll, r, grupo, maxCols, indexSheetName);
      r = writeTable(wsAll, r, MARCA_COLUMNS, marcaRows(grupo), { autoFilter: false });
      r += 1; // espaciador entre usuarios
    }
  } else {
    for (const grupo of normalizados) {
      const sheetName = uniqueSheetName(grupo.nombre, usedNames);
      const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
      for (let c = 1; c <= maxCols; c++) ws.getColumn(c).width = 14;

      destinos.set(grupo.id, { sheet: sheetName, cell: "A1" });

      let r = writeReportHeader(ws, wb, {
        title,
        subtitle: subtitle || "",
        logo,
        maxCols,
      });
      r = writeUserHeading(ws, r, grupo, maxCols, indexSheetName);
      const tableStart = r;
      writeTable(ws, tableStart, MARCA_COLUMNS, marcaRows(grupo));
      ws.views = [{ state: "frozen", ySplit: tableStart, showGridLines: false }];
    }
  }

  // Índice (se escribe al final, pero queda como primera hoja del libro).
  const indexColumns = [
    { header: "#", align: "center", width: 6, numeric: true },
    { header: "Usuario", width: 34 },
    { header: "Cédula", width: 18 },
    { header: "Empresa", width: 26 },
    { header: "Marcas", align: "right", width: 10, numeric: true },
    { header: "Entradas", align: "right", width: 11, numeric: true },
    { header: "Salidas", align: "right", width: 11, numeric: true },
  ];

  for (let c = 1; c <= indexColumns.length; c++) wsIndex.getColumn(c).width = 14;

  let ri = writeReportHeader(wsIndex, wb, {
    title,
    subtitle: subtitle || "",
    logo,
    maxCols: indexColumns.length,
  });

  const totalMarcas = normalizados.reduce((acc, g) => acc + g.marcas.length, 0);
  ri = writeMetaBlock(wsIndex, ri, {
    meta: [
      ["Usuarios", normalizados.length],
      ["Total marcas", totalMarcas],
      ...metaAll,
      [
        "Cómo usarlo",
        consolidar
          ? "Haz clic en el nombre del usuario para ir a su sección en la hoja Marcas."
          : "Haz clic en el nombre del usuario para ir a su hoja de marcas.",
      ],
    ],
    filtersText,
    maxCols: indexColumns.length,
  });

  const indexRows = normalizados.map((grupo, i) => {
    const destino = destinos.get(grupo.id);
    return [
      i + 1,
      destino
        ? { linkSheet: destino.sheet, linkCell: destino.cell, text: grupo.nombre }
        : grupo.nombre,
      grupo.cedula || "Sin cédula",
      grupo.empresa || "Sin empresa",
      grupo.marcas.length,
      grupo.entradas,
      grupo.salidas,
    ];
  });

  const indexTableStart = ri;
  writeTable(wsIndex, indexTableStart, indexColumns, indexRows);
  wsIndex.views = [{ state: "frozen", ySplit: indexTableStart, showGridLines: false }];

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, buildFileName(fileName));
}

export default downloadHistorialMarcasReport;
