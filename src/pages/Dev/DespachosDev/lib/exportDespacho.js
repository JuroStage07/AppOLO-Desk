// exportDespacho.js — Exportación opcional del detalle de un despacho.
//
// Exporta los datos de negocio y el historial de un Despacho a PDF (jspdf) o
// Excel (exceljs). Ambas librerías son OPCIONALES y NO forman parte de las
// dependencias del proyecto: se importan de forma PEREZOSA (dynamic import())
// dentro de cada función de exportación. Así, si una librería no está instalada
// o está deshabilitada, el módulo se carga sin errores y el fallo solo ocurre
// —de forma controlada— en el momento de exportar.
//
// El módulo es libre de efectos secundarios al importarse: NO hay imports de
// jspdf/exceljs en el nivel superior.
//
// Contrato: las funciones NUNCA lanzan hacia el llamador. Devuelven un objeto
// de resultado controlado que `DespachoDetailSheet` puede usar para mostrar un
// mensaje y mantener el detalle abierto sin alterar los datos mostrados.
//
// Requirements: 5.11, 5.12

import { labelFor } from "./mapaEstados.js";
import { formatSD, orNoValue } from "./despachoFormat.js";

/**
 * Motivos posibles de un resultado de exportación no exitoso.
 * - "unavailable": la librería de exportación no está instalada/disponible.
 * - "error":       ocurrió un error durante la generación o descarga.
 * - "no-data":     no se proporcionó un despacho válido para exportar.
 * @readonly
 */
export const EXPORT_REASON = Object.freeze({
  UNAVAILABLE: "unavailable",
  ERROR: "error",
  NO_DATA: "no-data",
});

/**
 * @typedef {Object} ExportResult
 * @property {boolean} ok        `true` si la exportación se completó y se inició la descarga.
 * @property {"pdf"|"xlsx"} format Formato solicitado.
 * @property {string} [filename] Nombre del archivo generado (cuando `ok` es `true`).
 * @property {string} [reason]   Uno de EXPORT_REASON (cuando `ok` es `false`).
 * @property {string} [message]  Mensaje en español para mostrar al usuario (cuando `ok` es `false`).
 */

const MSG_UNAVAILABLE =
  "La exportación no está disponible: falta el complemento requerido.";
const MSG_ERROR = "No se pudo completar la exportación. Intenta nuevamente.";
const MSG_NO_DATA = "No hay datos del despacho para exportar.";

/**
 * Construye un resultado de éxito.
 * @param {"pdf"|"xlsx"} format
 * @param {string} filename
 * @returns {ExportResult}
 */
function ok(format, filename) {
  return { ok: true, format, filename };
}

/**
 * Construye un resultado de fallo controlado.
 * @param {"pdf"|"xlsx"} format
 * @param {string} reason
 * @param {string} message
 * @returns {ExportResult}
 */
function fail(format, reason, message) {
  return { ok: false, format, reason, message };
}

/**
 * Sanea un texto para usarlo como parte de un nombre de archivo.
 * @param {unknown} value
 * @returns {string}
 */
function safeFilePart(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  const cleaned = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "despacho";
}

/**
 * Traduce un booleano de negocio a texto en español; usa marcador de ausencia
 * cuando el valor es nulo/indefinido.
 * @param {unknown} value
 * @returns {string}
 */
function boolText(value) {
  if (value === null || value === undefined) return orNoValue(value);
  return value ? "Sí" : "No";
}

/**
 * Construye las filas (etiqueta/valor) de los datos de negocio del despacho.
 * Usa marcadores de ausencia ("—") para campos vacíos, sin omitir campos.
 *
 * @param {Record<string, unknown>} despacho
 * @param {Array<{ codigo: string, nombre?: string }>} [catalogo]
 * @returns {Array<[string, string]>}
 */
function buildBusinessRows(despacho, catalogo) {
  const d = despacho || {};
  return [
    ["Estado", labelFor(d.estado, catalogo)],
    ["Motivo de estado", orNoValue(d.estado_motivo)],
    ["Compañía", orNoValue(d.company)],
    ["Bodega", orNoValue(d.bodega_nombre)],
    ["Tipo", orNoValue(d.tipo)],
    ["Referencia", orNoValue(d.referencia)],
    ["Tienda", orNoValue(d.tienda)],
    ["Placa", orNoValue(d.placa)],
    ["Marchamo", orNoValue(d.marchamo)],
    ["Puerta", orNoValue(d.puerta)],
    ["Transportista", orNoValue(d.transportista)],
    ["Con DUA", boolText(d.con_dua)],
    ["Número DUA", orNoValue(d.numero_dua)],
    ["Tarimas (S/D)", formatSD(d.tarimas_s, d.tarimas_d)],
    ["Fotos", orNoValue(d.fotos_count)],
    ["Notas", orNoValue(d.notas)],
    ["Fecha", orNoValue(d.fecha)],
    ["Finalizado", orNoValue(d.finalized_at)],
    ["Reabierto", orNoValue(d.reopened_at)],
  ];
}

/**
 * Normaliza el historial a filas legibles (descripción, actor, fecha).
 * @param {Array<Record<string, unknown>>} [historial]
 * @returns {Array<{ descripcion: string, actor: string, fecha: string }>}
 */
function buildHistorialRows(historial) {
  if (!Array.isArray(historial)) return [];
  return historial.map((h) => ({
    descripcion: orNoValue(h && h.descripcion),
    actor: orNoValue(h && h.actor_email),
    fecha: orNoValue(h && h.created_at),
  }));
}

/**
 * Dispara la descarga de un Blob en el navegador. Devuelve `false` si el
 * entorno no soporta la descarga (p. ej. sin `document`).
 * @param {Blob} blob
 * @param {string} filename
 * @returns {boolean}
 */
function triggerDownload(blob, filename) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return false;
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
  return true;
}

/**
 * Indica si un formato de exportación está disponible en tiempo de ejecución,
 * intentando cargar perezosamente su librería. No lanza: devuelve `false` si la
 * librería no puede resolverse.
 *
 * @param {"pdf"|"xlsx"} format
 * @returns {Promise<boolean>}
 */
export async function isExportAvailable(format) {
  try {
    if (format === "pdf") {
      await import("jspdf");
      return true;
    }
    if (format === "xlsx") {
      await import("exceljs");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Exporta los datos de negocio e historial de un despacho a PDF usando `jspdf`
 * (carga perezosa). No lanza hacia el llamador: ante librería ausente o error,
 * devuelve un resultado controlado para que el detalle permanezca abierto y sin
 * alterar (Requirement 5.11, 5.12).
 *
 * @param {Record<string, unknown>} despacho
 * @param {Array<Record<string, unknown>>} [historial]
 * @param {{ catalogo?: Array<{ codigo: string, nombre?: string }> }} [options]
 * @returns {Promise<ExportResult>}
 */
export async function exportDespachoPDF(despacho, historial, options = {}) {
  const format = "pdf";
  if (!despacho || typeof despacho !== "object") {
    return fail(format, EXPORT_REASON.NO_DATA, MSG_NO_DATA);
  }

  let jsPDFModule;
  try {
    jsPDFModule = await import("jspdf");
  } catch {
    return fail(format, EXPORT_REASON.UNAVAILABLE, MSG_UNAVAILABLE);
  }

  try {
    const JsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
    if (typeof JsPDF !== "function") {
      return fail(format, EXPORT_REASON.UNAVAILABLE, MSG_UNAVAILABLE);
    }

    const doc = new JsPDF({ unit: "pt", format: "a4" });
    const marginX = 40;
    let y = 48;
    const lineHeight = 16;
    const pageHeight =
      (doc.internal && doc.internal.pageSize && doc.internal.pageSize.getHeight
        ? doc.internal.pageSize.getHeight()
        : 842) - 48;

    const nextLine = (step = lineHeight) => {
      y += step;
      if (y > pageHeight) {
        doc.addPage();
        y = 48;
      }
    };

    doc.setFontSize(16);
    doc.text("Detalle de despacho", marginX, y);
    nextLine(24);

    doc.setFontSize(11);
    const businessRows = buildBusinessRows(despacho, options.catalogo);
    for (const [label, value] of businessRows) {
      doc.text(`${label}: ${value}`, marginX, y);
      nextLine();
    }

    const historialRows = buildHistorialRows(historial);
    nextLine(8);
    doc.setFontSize(13);
    doc.text("Historial", marginX, y);
    nextLine(20);
    doc.setFontSize(10);
    if (historialRows.length === 0) {
      doc.text("No existen registros de actividad.", marginX, y);
      nextLine();
    } else {
      for (const row of historialRows) {
        doc.text(`${row.fecha} — ${row.actor}`, marginX, y);
        nextLine();
        doc.text(row.descripcion, marginX + 12, y);
        nextLine();
      }
    }

    const filename = `despacho-${safeFilePart(despacho.referencia || despacho.id)}.pdf`;
    const blob = doc.output("blob");
    const downloaded = triggerDownload(blob, filename);
    if (!downloaded) {
      // Entorno sin descarga; el archivo se generó pero no pudo entregarse.
      return fail(format, EXPORT_REASON.ERROR, MSG_ERROR);
    }
    return ok(format, filename);
  } catch {
    return fail(format, EXPORT_REASON.ERROR, MSG_ERROR);
  }
}

/**
 * Exporta los datos de negocio e historial de un despacho a Excel usando
 * `exceljs` (carga perezosa). No lanza hacia el llamador: ante librería ausente
 * o error, devuelve un resultado controlado para que el detalle permanezca
 * abierto y sin alterar (Requirement 5.11, 5.12).
 *
 * @param {Record<string, unknown>} despacho
 * @param {Array<Record<string, unknown>>} [historial]
 * @param {{ catalogo?: Array<{ codigo: string, nombre?: string }> }} [options]
 * @returns {Promise<ExportResult>}
 */
export async function exportDespachoExcel(despacho, historial, options = {}) {
  const format = "xlsx";
  if (!despacho || typeof despacho !== "object") {
    return fail(format, EXPORT_REASON.NO_DATA, MSG_NO_DATA);
  }

  let ExcelJSModule;
  try {
    ExcelJSModule = await import("exceljs");
  } catch {
    return fail(format, EXPORT_REASON.UNAVAILABLE, MSG_UNAVAILABLE);
  }

  try {
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    if (!ExcelJS || typeof ExcelJS.Workbook !== "function") {
      return fail(format, EXPORT_REASON.UNAVAILABLE, MSG_UNAVAILABLE);
    }

    const workbook = new ExcelJS.Workbook();

    const datosSheet = workbook.addWorksheet("Datos");
    datosSheet.columns = [
      { header: "Campo", key: "campo", width: 24 },
      { header: "Valor", key: "valor", width: 48 },
    ];
    for (const [label, value] of buildBusinessRows(despacho, options.catalogo)) {
      datosSheet.addRow({ campo: label, valor: value });
    }

    const historialSheet = workbook.addWorksheet("Historial");
    historialSheet.columns = [
      { header: "Fecha", key: "fecha", width: 24 },
      { header: "Actor", key: "actor", width: 32 },
      { header: "Descripción", key: "descripcion", width: 60 },
    ];
    for (const row of buildHistorialRows(historial)) {
      historialSheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const filename = `despacho-${safeFilePart(despacho.referencia || despacho.id)}.xlsx`;
    const downloaded = triggerDownload(blob, filename);
    if (!downloaded) {
      return fail(format, EXPORT_REASON.ERROR, MSG_ERROR);
    }
    return ok(format, filename);
  } catch {
    return fail(format, EXPORT_REASON.ERROR, MSG_ERROR);
  }
}
