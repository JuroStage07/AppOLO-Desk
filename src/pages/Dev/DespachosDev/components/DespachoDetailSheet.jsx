// Feature: despachos-dev — Detalle de un despacho (solo lectura).
//
// Envuelve el `Sheet` del UI kit (placement="center"; el propio Sheet ya expone
// role="dialog" + aria-modal, focus-trap y retorno de foco). Muestra:
//   - Los campos de negocio del despacho (5.2), usando el marcador de ausencia
//     "—" para valores vacíos (5.3) y `formatSD` para las tarimas.
//   - La insignia del estado actual (`EstadoBadge`, color + texto) (5.4) y el
//     `estado_motivo` cuando tiene valor (5.5).
//   - Los datos del chofer (`nombre`, `cedula`, `placa_camion`,
//     `placa_contenedor`) resueltos por el hook (5.6); si el chofer está
//     asignado pero no pudo resolverse, un indicador visible no bloqueante (5.7).
//   - Las marcas de tiempo `fecha`, `finalized_at`, `reopened_at` (5.8).
//   - El `HistorialTimeline` (bitácora inmutable) del despacho.
//
// Es estrictamente de SOLO LECTURA: no renderiza controles para cambiar estado
// ni editar el despacho (5.9). Ante fallo de carga del detalle/historial muestra
// un mensaje de error sin exponer datos parciales/desactualizados (5.10).
//
// Exportación OPCIONAL (5.11/5.12): cuando `enableExport` es verdadero, ofrece
// botones PDF/Excel que llaman a `exportDespachoPDF`/`exportDespachoExcel`. Si el
// resultado no es exitoso (`result.ok === false`), muestra un mensaje inline en
// español y mantiene el detalle abierto sin alterar los datos mostrados.
//
// Colores/espaciados provienen exclusivamente de los tokens del tema.
//
// _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

import React, { useCallback, useState } from "react";
import { AlertTriangle, FileText, FileSpreadsheet } from "lucide-react";
import { Sheet, theme, ErrorState } from "../../../../components/ui";
import EstadoBadge from "./EstadoBadge.jsx";
import HistorialTimeline from "./HistorialTimeline.jsx";
import { orNoValue, formatSD } from "../lib/despachoFormat.js";
import { exportDespachoPDF, exportDespachoExcel } from "../lib/exportDespacho.js";

/**
 * Traduce un booleano de negocio a texto en español; usa el marcador de ausencia
 * ("—") cuando el valor es nulo/indefinido.
 * @param {unknown} value
 * @returns {string}
 */
function boolText(value) {
  if (value === null || value === undefined) return orNoValue(value);
  return value ? "Sí" : "No";
}

/**
 * Fila etiqueta/valor de solo lectura. El valor nunca queda en blanco.
 * @param {{ label: string, children: React.ReactNode }} props
 */
function DetailRow({ label, children }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{children}</span>
    </div>
  );
}

/**
 * Detalle de un despacho en un `Sheet` de solo lectura.
 *
 * @param {object} props
 * @param {boolean} props.open - Si el detalle está abierto.
 * @param {() => void} props.onClose - Cierra el detalle.
 * @param {object|null} props.despacho - Registro del despacho activo.
 * @param {object|null} [props.chofer] - Datos del chofer resueltos.
 * @param {Error|null} [props.choferError] - Chofer asignado pero no resoluble (5.7).
 * @param {Array<object>} [props.historial] - Entradas de la bitácora.
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:Function,color:Function,icon:Function}} [props.mapaEstados] - Mapa prearmado.
 * @param {boolean} [props.loading] - Carga del detalle en curso.
 * @param {Error|boolean|string} [props.error] - Error de carga del detalle (5.10).
 * @param {() => void} [props.onReloadHistorial] - Reintento del historial.
 * @param {boolean} [props.enableExport] - Habilita los botones de exportación (5.11).
 */
export default function DespachoDetailSheet({
  open,
  onClose,
  despacho,
  chofer,
  choferError,
  historial,
  catalogo,
  mapaEstados,
  loading,
  error,
  onReloadHistorial,
  enableExport = false,
}) {
  // Mensaje de error de exportación (inline, en español). No altera los datos.
  const [exportError, setExportError] = useState(null);
  // Formato en curso ("pdf" | "xlsx") para deshabilitar los botones mientras exporta.
  const [exporting, setExporting] = useState(null);

  // Al cambiar de despacho o al abrir/cerrar, limpiar cualquier mensaje de
  // exportación. Se usa el patrón recomendado de "ajustar estado durante el
  // render" (comparando con el render previo) en lugar de un efecto, para no
  // disparar renders en cascada (react-hooks/set-state-in-effect).
  const despachoId = despacho?.id ?? null;
  const exportKey = `${despachoId}|${open}`;
  const [prevExportKey, setPrevExportKey] = useState(exportKey);
  if (exportKey !== prevExportKey) {
    setPrevExportKey(exportKey);
    setExportError(null);
    setExporting(null);
  }

  const handleExport = useCallback(
    async (format) => {
      if (!despacho) return;
      setExporting(format);
      setExportError(null);
      const runner = format === "pdf" ? exportDespachoPDF : exportDespachoExcel;
      const result = await runner(despacho, historial, { catalogo });
      // Solo se informa el fallo; el éxito dispara la descarga silenciosamente.
      if (!result || result.ok !== true) {
        setExportError(
          (result && result.message) ||
            "No se pudo completar la exportación. Intenta nuevamente.",
        );
      }
      setExporting(null);
    },
    [despacho, historial, catalogo],
  );

  const handleExportPDF = useCallback(() => handleExport("pdf"), [handleExport]);
  const handleExportExcel = useCallback(
    () => handleExport("xlsx"),
    [handleExport],
  );

  return (
    <Sheet open={open} onClose={onClose} placement="center" title="Detalle de despacho" maxWidth={720}>
      <Sheet.Body>
        {error ? (
          // Fallo de carga del detalle: sin datos parciales/desactualizados (5.10).
          <ErrorState
            title="No se pudieron cargar los datos"
            description="No se pudieron cargar los datos del despacho. Intentá nuevamente."
            onRetry={onReloadHistorial}
          />
        ) : loading && !despacho ? (
          <div style={styles.loading}>Cargando detalle…</div>
        ) : !despacho ? (
          <div style={styles.loading}>Sin despacho seleccionado.</div>
        ) : (
          <>
            {/* Estado actual (color + texto) y motivo del estado si existe. */}
            <section style={styles.section}>
              <div style={styles.estadoRow}>
                <EstadoBadge
                  codigo={despacho.estado}
                  catalogo={catalogo}
                  mapaEstados={mapaEstados}
                />
              </div>
              {orNoValue(despacho.estado_motivo) !== "—" ? (
                <div style={styles.motivo}>{despacho.estado_motivo}</div>
              ) : null}
            </section>

            {/* Datos de negocio (5.2/5.3). */}
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Datos del despacho</h3>
              <div style={styles.grid}>
                <DetailRow label="Compañía">{orNoValue(despacho.company)}</DetailRow>
                <DetailRow label="Bodega">{orNoValue(despacho.bodega_nombre)}</DetailRow>
                <DetailRow label="Tipo">{orNoValue(despacho.tipo)}</DetailRow>
                <DetailRow label="Referencia">{orNoValue(despacho.referencia)}</DetailRow>
                <DetailRow label="Tienda">{orNoValue(despacho.tienda)}</DetailRow>
                <DetailRow label="Placa">{orNoValue(despacho.placa)}</DetailRow>
                <DetailRow label="Marchamo">{orNoValue(despacho.marchamo)}</DetailRow>
                <DetailRow label="Puerta">{orNoValue(despacho.puerta)}</DetailRow>
                <DetailRow label="Transportista">{orNoValue(despacho.transportista)}</DetailRow>
                <DetailRow label="Con DUA">{boolText(despacho.con_dua)}</DetailRow>
                <DetailRow label="Número DUA">{orNoValue(despacho.numero_dua)}</DetailRow>
                <DetailRow label="Tarimas (S/D)">
                  {formatSD(despacho.tarimas_s, despacho.tarimas_d)}
                </DetailRow>
                <DetailRow label="Fotos">{orNoValue(despacho.fotos_count)}</DetailRow>
              </div>
              <DetailRow label="Notas">{orNoValue(despacho.notas)}</DetailRow>
            </section>

            {/* Marcas de tiempo (5.8). */}
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Fechas</h3>
              <div style={styles.grid}>
                <DetailRow label="Fecha">{orNoValue(despacho.fecha)}</DetailRow>
                <DetailRow label="Finalizado">{orNoValue(despacho.finalized_at)}</DetailRow>
                <DetailRow label="Reabierto">{orNoValue(despacho.reopened_at)}</DetailRow>
              </div>
            </section>

            {/* Chofer (5.6) o indicador de no disponible (5.7). */}
            {choferError ? (
              <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Chofer</h3>
                <div style={styles.choferUnavailable} role="status">
                  <AlertTriangle size={16} strokeWidth={2.2} color={theme.DANGER} aria-hidden="true" />
                  <span>Datos del chofer no disponibles.</span>
                </div>
              </section>
            ) : chofer ? (
              <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Chofer</h3>
                <div style={styles.grid}>
                  <DetailRow label="Nombre">{orNoValue(chofer.nombre)}</DetailRow>
                  <DetailRow label="Cédula">{orNoValue(chofer.cedula)}</DetailRow>
                  <DetailRow label="Placa camión">{orNoValue(chofer.placa_camion)}</DetailRow>
                  <DetailRow label="Placa contenedor">{orNoValue(chofer.placa_contenedor)}</DetailRow>
                </div>
              </section>
            ) : null}

            {/* Historial (bitácora inmutable). */}
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Historial</h3>
              <HistorialTimeline
                historial={historial}
                catalogo={catalogo}
                mapaEstados={mapaEstados}
                loading={loading}
                onRetry={onReloadHistorial}
              />
            </section>

            {/* Exportación opcional (5.11/5.12). */}
            {enableExport ? (
              <section style={styles.section}>
                {exportError ? (
                  <div style={styles.exportError} role="alert">
                    <AlertTriangle size={16} strokeWidth={2.2} color={theme.DANGER} aria-hidden="true" />
                    <span>{exportError}</span>
                  </div>
                ) : null}
                <div style={styles.exportActions}>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    disabled={exporting !== null}
                    style={styles.exportBtn}
                  >
                    <FileText size={15} strokeWidth={2.3} aria-hidden="true" />
                    {exporting === "pdf" ? "Exportando…" : "Exportar PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={exporting !== null}
                    style={styles.exportBtn}
                  >
                    <FileSpreadsheet size={15} strokeWidth={2.3} aria-hidden="true" />
                    {exporting === "xlsx" ? "Exportando…" : "Exportar Excel"}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </Sheet.Body>
    </Sheet>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: theme.SPACE_2,
  },
  sectionTitle: {
    margin: 0,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_SEMIBOLD,
    color: theme.SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  estadoRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    flexWrap: "wrap",
  },
  motivo: {
    color: theme.TEXT,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_MEDIUM,
    lineHeight: theme.LH_NORMAL,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.SPACE_2,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    fontSize: theme.FS_SM,
    borderBottom: `1px solid ${theme.BORDER_SOFT}`,
    paddingBottom: theme.SPACE_1,
  },
  rowLabel: {
    color: theme.MUTED,
    fontWeight: theme.FW_MEDIUM,
    flexShrink: 0,
  },
  rowValue: {
    color: theme.TEXT,
    fontWeight: theme.FW_MEDIUM,
    textAlign: "right",
    wordBreak: "break-word",
  },
  loading: {
    color: theme.SLATE,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_MEDIUM,
    padding: theme.SPACE_3,
  },
  choferUnavailable: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    color: theme.DANGER,
    background: theme.DANGER_BG,
    border: `1px solid ${theme.DANGER_BORDER}`,
    borderRadius: theme.RADIUS_MD,
    padding: `${theme.SPACE_2}px ${theme.SPACE_3}px`,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_MEDIUM,
  },
  exportError: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    color: theme.DANGER,
    background: theme.DANGER_BG,
    border: `1px solid ${theme.DANGER_BORDER}`,
    borderRadius: theme.RADIUS_MD,
    padding: `${theme.SPACE_2}px ${theme.SPACE_3}px`,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_MEDIUM,
  },
  exportActions: {
    display: "flex",
    gap: theme.SPACE_2,
    flexWrap: "wrap",
  },
  exportBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    padding: `${theme.SPACE_2}px ${theme.SPACE_4}px`,
    borderRadius: theme.RADIUS_MD,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    color: theme.TEXT,
    fontWeight: theme.FW_SEMIBOLD,
    fontSize: theme.FS_SM,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
