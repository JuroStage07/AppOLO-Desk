// MRP Tarimas — Exportador de reportes Excel "pro" (reutilizable).
//
// Genera un .xlsx con estilo de reporte corporativo AppOLO Desk:
//   • Encabezado con logo, título y franja de marca.
//   • Metadatos (empresa, bodega, almacén, generado, usuario, filtros aplicados).
//   • Una o varias secciones de tabla con cabecera de marca, cebra, bordes,
//     autofiltro y paneles congelados.
//
// exceljs se importa de forma perezosa (dynamic import) para no inflar el bundle
// inicial, siguiendo el patrón de los otros exportadores del proyecto.

// Paleta de marca (coherente con src/styles/theme.js: ACCENT #089F8A).
const BRAND = "FF089F8A";
const BRAND_DARK = "FF067A6B";
const BRAND_SOFT = "FFF1FBF8";
const ZEBRA = "FFF7FAFC";
const INK = "FF0F172A";
const MUTED = "FF64748B";
const BORDER = "FFE2E8F0";

let _logoCache; // Promise<string|null> — base64 del logo, cacheado tras la 1ª carga.

// Carga el logo público (/AppOLO_logo.png) como base64 para incrustarlo en el
// workbook. Si falla (offline, ruta movida), el reporte se genera sin logo.
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
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + chunk)
        );
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
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[:T]/g, "-");
  const clean = String(base || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `${clean || "reporte"}_${stamp}.xlsx`;
}

// Dispara la descarga del buffer como .xlsx.
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

// Ancho de columna a partir del contenido (cabecera + celdas), acotado.
function autoWidth(header, rows, colIndex) {
  let max = String(header || "").length;
  for (const r of rows) {
    const v = r[colIndex];
    const len = v == null ? 1 : String(v).length;
    if (len > max) max = len;
  }
  return Math.min(Math.max(max + 3, 12), 60);
}

/**
 * Construye y descarga un reporte Excel.
 *
 * @param {Object}   opts
 * @param {string}   opts.title        Título grande del reporte.
 * @param {Array<[string,string|number]>} [opts.meta]  Pares etiqueta/valor.
 * @param {string}   [opts.filtersText] Descripción de filtros aplicados.
 * @param {string}   [opts.sheetName]   Nombre de la hoja.
 * @param {string}   [opts.fileName]    Base del nombre de archivo.
 * @param {Array<{heading?:string, columns:Array<{header:string, align?:string, numeric?:boolean, numFmt?:string}>, rows:Array<Array<any>>}>} opts.sections
 */
export async function downloadMrpReport({
  title,
  meta = [],
  filtersText = "",
  sheetName = "Reporte",
  fileName,
  sections = [],
}) {
  const ExcelJS = (await import("exceljs")).default;
  const logo = await loadLogoBase64();
  const now = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = "AppOLO Desk";
  wb.created = now;
  wb.modified = now;

  const ws = wb.addWorksheet(String(sheetName).slice(0, 31) || "Reporte", {
    views: [{ showGridLines: false }],
  });

  // Nº de columnas = la sección más ancha (mínimo 4 para el encabezado).
  const maxCols = Math.max(
    4,
    ...sections.map((s) => (s.columns ? s.columns.length : 0))
  );
  const lastColLetter = ws.getColumn(maxCols).letter;

  // Ancho base de columnas: se ajusta luego por sección; deja un mínimo cómodo.
  for (let c = 1; c <= maxCols; c++) ws.getColumn(c).width = 16;

  // ---- Encabezado con logo + franja de marca -------------------------------
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
    // Flota sobre el extremo izquierdo de la franja del título.
    ws.addImage(imgId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 132, height: 40 },
      editAs: "oneCell",
    });
  }

  let r = 3;

  // ---- Metadatos ------------------------------------------------------------
  const metaAll = [
    ...meta,
    ["Generado", now.toLocaleString("es-CR")],
  ];
  for (const [label, value] of metaAll) {
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

  r += 1; // espaciador

  // ---- Secciones de tabla ---------------------------------------------------
  for (const section of sections) {
    const cols = section.columns || [];
    const rows = section.rows || [];
    if (!cols.length) continue;

    if (section.heading) {
      ws.mergeCells(r, 1, r, maxCols);
      const h = ws.getCell(r, 1);
      h.value = section.heading;
      h.font = { bold: true, size: 13, color: { argb: BRAND_DARK } };
      h.alignment = { vertical: "middle" };
      ws.getRow(r).height = 24;
      r += 1;
    }

    // Cabecera de la tabla.
    const headerRowIdx = r;
    const headerRow = ws.getRow(headerRowIdx);
    headerRow.height = 22;
    cols.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = {
        vertical: "middle",
        horizontal: col.align === "right" ? "right" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: BRAND_DARK } },
        bottom: { style: "thin", color: { argb: BRAND_DARK } },
        left: { style: "thin", color: { argb: BRAND_DARK } },
        right: { style: "thin", color: { argb: BRAND_DARK } },
      };
    });
    r += 1;

    // Filas de datos con cebra + bordes.
    rows.forEach((rowVals, ri) => {
      const dataRow = ws.getRow(r);
      dataRow.height = 18;
      cols.forEach((col, ci) => {
        const cell = dataRow.getCell(ci + 1);
        const raw = rowVals[ci];
        cell.value = raw == null ? "" : raw;
        if (col.numeric && typeof raw === "number") {
          cell.numFmt = col.numFmt || "#,##0";
        }
        cell.font = { size: 10, color: { argb: INK } };
        cell.alignment = {
          vertical: "middle",
          horizontal: col.align === "right" ? "right" : "left",
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

    // Autofiltro sobre la cabecera de la sección.
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: Math.max(headerRowIdx, r - 1), column: cols.length },
    };

    // Congela justo debajo de la cabecera (solo tiene efecto en la 1ª tabla).
    if (!ws.views[0].ySplit) {
      ws.views = [{ state: "frozen", ySplit: headerRowIdx, showGridLines: false }];
    }

    // Ajusta anchos con el contenido de esta sección (respeta el más ancho).
    cols.forEach((col, ci) => {
      const w = autoWidth(col.header, rows, ci);
      const current = ws.getColumn(ci + 1).width || 0;
      if (w > current) ws.getColumn(ci + 1).width = w;
    });

    r += 1; // espaciador entre secciones
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, fileName ? buildFileName(fileName) : buildFileName(title));
}
