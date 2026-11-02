// Reporte de descargas por andén — filtro por rango de fechas y por andenes
// (sueltos o rangos), resumen por andén, detalle y descarga .xlsx.
//
// Fuente: Firestore `accion_descarga` (ver ./descargasAndenReporte.js). El
// Excel vive en ./descargasAndenExcel.js.

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarRange, Clock, Download, FileSpreadsheet, Gauge, Lock, Package, RefreshCw, Truck, Warehouse } from "lucide-react";
import {
  Badge,
  Brand,
  Card,
  Chip,
  ChipsRow,
  Container,
  EmptyState,
  ErrorState,
  Field,
  GhostButton,
  Hero,
  KpiCard,
  KpiGrid,
  Main,
  PrimaryButton,
  SearchInput,
  SectionTitle,
  SecondaryButton,
  Shell,
  Skeleton,
  TableScroll,
  Topbar,
  theme,
  useToast,
} from "../../../components/ui";
import { AuthCtx } from "../../../auth/AuthProvider";
import useCan from "../../../hooks/useCan";
import AndenFilter from "../../../components/AndenFilter";
import { andenKey, andenLabel, formatAndenes, parseAndenes } from "../../../utils/andenes";
import { rangoRapido } from "../../Despacho/reporte/despachoReporte";
import {
  duracionMs,
  estadoDescarga,
  fetchDescargasPorAnden,
  filtrarDescargas,
  fmtDuracion,
  resumenGeneral,
  resumenPorAnden,
  tipoKey,
  toDate,
} from "./descargasAndenReporte";
import { downloadReporteDescargasAnden } from "./descargasAndenExcel";

const RANGOS = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "mes", label: "Este mes" },
  { key: "mesAnterior", label: "Mes anterior" },
];
const ESTADOS = ["Finalizada", "En proceso", "Pendiente"];
const MAX_FILAS_PANTALLA = 300;

const fmtInt = (n) => Number(n || 0).toLocaleString("es-CR");
const fmtDec = (n) => Number(n || 0).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtFechaHora(v) {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.toLocaleDateString("es-CR")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ReporteAndenesPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { profile, tenantId, company, bodegaId, loading: authLoading } = useContext(AuthCtx) || {};

  const can = useCan();
  // Mismo acceso que «Reportes de Descarga» (routeAccess: /recepcion/metricas).
  const hasPermission = ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"].some((k) => can(k));
  const canExport = can("recepcionExportar");
  const hasScope = Boolean(tenantId && company);
  const hasAccess = hasPermission && hasScope;

  const [rango, setRango] = useState(() => ({ ...rangoRapido("mes"), key: "mes" }));
  const [andenTexto, setAndenTexto] = useState("");
  const [tipos, setTipos] = useState([]);
  const [estados, setEstados] = useState([]);
  const [texto, setTexto] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const rangoInvalido = Boolean(rango.desde && rango.hasta && rango.desde > rango.hasta);
  const andenSel = useMemo(() => parseAndenes(andenTexto), [andenTexto]);

  const load = useCallback(async () => {
    if (!hasAccess || !rango.desde || !rango.hasta || rangoInvalido) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchDescargasPorAnden({ tenantId, company, bodegaId, desde: rango.desde, hasta: rango.hasta }));
    } catch (e) {
      console.error("reporte por andén:", e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [hasAccess, tenantId, company, bodegaId, rango.desde, rango.hasta, rangoInvalido]);

  useEffect(() => {
    void load();
  }, [load]);

  const andenesDisponibles = useMemo(() => rows.map((a) => andenKey(a.idAnden)), [rows]);
  const tiposDisponibles = useMemo(
    () => [...new Set(rows.map(tipoKey))].sort((a, b) => a.localeCompare(b, "es")),
    [rows]
  );

  const filtrados = useMemo(
    () => filtrarDescargas(rows, { andenes: andenSel.error ? undefined : andenSel.andenes, tipos, estados, texto }),
    [rows, andenSel, tipos, estados, texto]
  );
  const resumen = useMemo(() => resumenGeneral(filtrados), [filtrados]);
  const porAnden = useMemo(() => resumenPorAnden(filtrados), [filtrados]);

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const filtrosTexto = useMemo(() => {
    const parts = [];
    if (!andenSel.error && andenSel.andenes.size) parts.push(`Andenes: ${formatAndenes(andenSel.andenes)}`);
    if (tipos.length) parts.push(`Tipo: ${tipos.join(", ")}`);
    if (estados.length) parts.push(`Estado: ${estados.join(", ")}`);
    if (texto.trim()) parts.push(`Búsqueda: "${texto.trim()}"`);
    return parts.join(" · ");
  }, [andenSel, tipos, estados, texto]);

  const bodegaNombre = profile?.bodegaNombre || rows[0]?.bodegaNombre || bodegaId || "";
  const hayFiltros = Boolean(andenTexto || tipos.length || estados.length || texto);

  const limpiarFiltros = () => {
    setAndenTexto("");
    setTipos([]);
    setEstados([]);
    setTexto("");
  };

  const handleExport = async () => {
    if (!filtrados.length) {
      toast.warning("No hay descargas para exportar con los filtros actuales.");
      return;
    }
    try {
      setExporting(true);
      const fileName = await downloadReporteDescargasAnden({
        descargas: filtrados,
        meta: {
          company,
          bodega: bodegaNombre,
          desde: rango.desde,
          hasta: rango.hasta,
          filtrosTexto,
          usuario: profile?.displayName || profile?.username || profile?.email || "",
        },
      });
      toast.success(`Reporte descargado: ${fileName}`);
    } catch (e) {
      console.error("export reporte por andén:", e);
      toast.error("No se pudo generar el Excel. Intentá nuevamente.");
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (authLoading) {
    body = <Skeleton height={320} />;
  } else if (!hasAccess) {
    body = (
      <EmptyState
        center
        icon={Lock}
        title="Sin acceso al reporte"
        description={
          hasPermission
            ? "Tu usuario no tiene compañía configurada."
            : "Necesitás permiso de reportes de Recepción para ver este reporte."
        }
      />
    );
  } else {
    body = (
      <div style={styles.stack}>
        <Card padding={theme.SPACE_4} style={styles.panel}>
          <div style={styles.panelHead}>
            <CalendarRange size={16} strokeWidth={2.2} color={theme.SLATE} aria-hidden="true" />
            <span style={styles.panelTitle}>Periodo y filtros</span>
          </div>

          <ChipsRow>
            {RANGOS.map((r) => (
              <Chip key={r.key} active={rango.key === r.key} onClick={() => setRango({ ...rangoRapido(r.key), key: r.key })}>
                {r.label}
              </Chip>
            ))}
          </ChipsRow>

          <div style={styles.dateRow}>
            <Field label="Desde" htmlFor="and-desde" error={rangoInvalido ? " " : undefined}>
              <Field.Input
                id="and-desde"
                type="date"
                value={rango.desde}
                onChange={(e) => setRango((p) => ({ ...p, desde: e.target.value, key: null }))}
              />
            </Field>
            <Field label="Hasta" htmlFor="and-hasta" error={rangoInvalido ? " " : undefined}>
              <Field.Input
                id="and-hasta"
                type="date"
                value={rango.hasta}
                onChange={(e) => setRango((p) => ({ ...p, hasta: e.target.value, key: null }))}
              />
            </Field>
          </div>
          {rangoInvalido ? (
            <span style={styles.rangeError} role="alert">
              La fecha de inicio es posterior a la fecha de fin.
            </span>
          ) : null}

          <AndenFilter id="and-andenes" disponibles={andenesDisponibles} texto={andenTexto} onChange={setAndenTexto} />

          <SearchInput value={texto} onChange={setTexto} placeholder="Buscar por proveedor, quién descargó, reserva..." />

          {tiposDisponibles.length > 1 ? (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Tipo</span>
              <ChipsRow>
                {tiposDisponibles.map((t) => (
                  <Chip key={t} active={tipos.includes(t)} onClick={() => toggle(tipos, setTipos, t)}>
                    {t}
                  </Chip>
                ))}
              </ChipsRow>
            </div>
          ) : null}

          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Estado</span>
            <ChipsRow>
              {ESTADOS.map((e) => (
                <Chip key={e} active={estados.includes(e)} onClick={() => toggle(estados, setEstados, e)}>
                  {e}
                </Chip>
              ))}
            </ChipsRow>
          </div>

          <div style={styles.panelFooter}>
            <span style={styles.counter}>
              {loading ? "Cargando…" : `${fmtInt(filtrados.length)} de ${fmtInt(rows.length)} descargas del periodo`}
            </span>
            <div style={styles.footerBtns}>
              <SecondaryButton size="sm" icon={RefreshCw} onClick={load} disabled={loading || rangoInvalido}>
                Actualizar
              </SecondaryButton>
              {hayFiltros ? (
                <SecondaryButton size="sm" onClick={limpiarFiltros}>
                  Limpiar filtros
                </SecondaryButton>
              ) : null}
            </div>
          </div>
        </Card>

        {error ? (
          <ErrorState
            title="No se pudo cargar el reporte"
            description="No se pudo completar la consulta. Revisá tu conexión e intentá nuevamente."
            onRetry={load}
          />
        ) : loading && !rows.length ? (
          <Skeleton height={320} />
        ) : (
          <>
            <KpiGrid min={170}>
              <KpiCard label="Descargas" value={fmtInt(resumen.descargas)} hint={`${fmtInt(resumen.finalizadas)} finalizadas`} icon={Truck} accent />
              <KpiCard label="Bultos" value={fmtInt(resumen.bultos)} icon={Package} accent />
              <KpiCard label="Andenes" value={fmtInt(resumen.andenes)} hint="Con descargas" icon={Warehouse} />
              <KpiCard label="Tiempo de descarga" value={fmtDuracion(resumen.tiempoMs)} hint="h:mm, finalizadas" icon={Clock} />
              <KpiCard label="Promedio por descarga" value={fmtDuracion(resumen.promedioMs)} hint="h:mm" icon={Clock} />
              <KpiCard label="Bultos por hora" value={fmtDec(resumen.bultosHora)} hint="Finalizadas" icon={Gauge} />
            </KpiGrid>

            {filtrados.length === 0 ? (
              <EmptyState
                center
                icon={FileSpreadsheet}
                title="No hay descargas con estos filtros"
                description="Probá con otro rango de fechas u otros andenes."
              />
            ) : (
              <>
                <SectionTitle title="Resumen por andén" hint="Tiempos y rendimiento solo de descargas finalizadas." />
                <TableScroll minWidth={900}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Andén</th>
                        <th style={styles.thRight}>Descargas</th>
                        <th style={styles.thRight}>Finalizadas</th>
                        <th style={styles.thRight}>En proceso</th>
                        <th style={styles.thRight}>Pendientes</th>
                        <th style={styles.thRight}>Bultos</th>
                        <th style={styles.thRight}>Tiempo (h:mm)</th>
                        <th style={styles.thRight}>Promedio (h:mm)</th>
                        <th style={styles.thRight}>Bultos/hora</th>
                        <th style={styles.thRight}>Proveedores</th>
                        <th style={styles.thRight}>% descargas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porAnden.map((a) => (
                        <tr key={String(a.anden)} style={styles.tr}>
                          <td style={styles.tdStrong}>{andenLabel(a.anden)}</td>
                          <td style={styles.tdRightStrong}>{fmtInt(a.descargas)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.finalizadas)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.enProceso)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.pendientes)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.bultos)}</td>
                          <td style={styles.tdRight}>{fmtDuracion(a.tiempoMs)}</td>
                          <td style={styles.tdRight}>{fmtDuracion(a.promedioMs)}</td>
                          <td style={styles.tdRight}>{fmtDec(a.bultosHora)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.proveedores)}</td>
                          <td style={styles.tdRight}>
                            {resumen.descargas ? `${((a.descargas / resumen.descargas) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr style={styles.totalRow}>
                        <td style={styles.tdTotal}>Total</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.descargas)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.finalizadas)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.enProceso)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.pendientes)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.bultos)}</td>
                        <td style={styles.tdTotalRight}>{fmtDuracion(resumen.tiempoMs)}</td>
                        <td style={styles.tdTotalRight}>{fmtDuracion(resumen.promedioMs)}</td>
                        <td style={styles.tdTotalRight}>{fmtDec(resumen.bultosHora)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.proveedores)}</td>
                        <td style={styles.tdTotalRight}>100%</td>
                      </tr>
                    </tbody>
                  </table>
                </TableScroll>

                <SectionTitle
                  title="Detalle de descargas"
                  hint={
                    filtrados.length > MAX_FILAS_PANTALLA
                      ? `Se muestran las ${MAX_FILAS_PANTALLA} más recientes; el Excel incluye las ${fmtInt(filtrados.length)}.`
                      : "De la más reciente a la más antigua."
                  }
                  action={<Badge icon={FileSpreadsheet}>{fmtInt(filtrados.length)} filas</Badge>}
                />
                <TableScroll minWidth={1100}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Registrada</th>
                        <th style={styles.th}>Andén</th>
                        <th style={styles.th}>Proveedor</th>
                        <th style={styles.th}>Tipo</th>
                        <th style={styles.th}>Estado</th>
                        <th style={styles.thRight}>Bultos</th>
                        <th style={styles.th}>Inicio</th>
                        <th style={styles.th}>Fin</th>
                        <th style={styles.thRight}>Duración</th>
                        <th style={styles.th}>Descargó</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.slice(0, MAX_FILAS_PANTALLA).map((a) => (
                        <tr key={a.id} style={styles.tr}>
                          <td style={styles.tdNowrap}>{fmtFechaHora(a.creadoAt)}</td>
                          <td style={styles.tdStrong}>{andenLabel(andenKey(a.idAnden))}</td>
                          <td style={styles.td}>{a.proveedorNombre || "—"}</td>
                          <td style={styles.td}>{tipoKey(a)}</td>
                          <td style={styles.td}>{estadoDescarga(a)}</td>
                          <td style={styles.tdRight}>{fmtInt(a.cantidadBultos)}</td>
                          <td style={styles.tdNowrap}>{fmtFechaHora(a.startedAt)}</td>
                          <td style={styles.tdNowrap}>{fmtFechaHora(a.completedAt)}</td>
                          <td style={styles.tdRight}>{a.completedAt ? fmtDuracion(duracionMs(a)) : "—"}</td>
                          <td style={styles.td}>{a.starter || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <Shell>
      <Topbar>
        <Brand icon={Warehouse} title="Reporte por andén" subtitle="Descargas por andén" onClick={() => nav("/recepcion")} />
        <Topbar.Right>
          {hasAccess && canExport ? (
            <PrimaryButton icon={Download} onClick={handleExport} loading={exporting} disabled={exporting || loading || !filtrados.length}>
              Descargar .xlsx
            </PrimaryButton>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/recepcion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Recepción"
            title="Reporte por andén"
            subtitle="Descargas, bultos y tiempos por andén. Filtrá por rango de fechas y por andenes sueltos o rangos (ej. 1-5, 8). Descargable en Excel."
            badge={<Badge icon={FileSpreadsheet}>{bodegaNombre || "Bodega activa"}</Badge>}
          />
          {body}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  stack: { display: "grid", gap: theme.SPACE_4 },
  panel: { display: "grid", gap: theme.SPACE_3 },
  panelHead: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
    paddingBottom: theme.SPACE_2,
    borderBottom: `1px solid ${theme.BORDER_SOFT}`,
  },
  panelTitle: {
    color: theme.TEXT,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dateRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: theme.SPACE_3 },
  rangeError: { color: theme.DANGER, fontSize: theme.FS_SM, fontWeight: theme.FW_BOLD },
  filterGroup: { display: "grid", gap: theme.SPACE_2 },
  filterLabel: { color: theme.SLATE, fontWeight: theme.FW_EXTRABOLD, fontSize: theme.FS_SM },
  panelFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    flexWrap: "wrap",
    paddingTop: theme.SPACE_2,
    borderTop: `1px solid ${theme.BORDER_SOFT}`,
  },
  footerBtns: { display: "flex", gap: theme.SPACE_2, flexWrap: "wrap" },
  counter: { color: theme.SLATE, fontWeight: theme.FW_BOLD, fontSize: theme.FS_SM },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "11px 12px",
    borderBottom: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_INSET,
    color: theme.SLATE,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_EXTRABOLD,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
  },
  get thRight() {
    return { ...this.th, textAlign: "right" };
  },
  tr: { borderBottom: `1px solid ${theme.BORDER_SOFT}` },
  td: { padding: "10px 12px", color: theme.TEXT, fontWeight: theme.FW_MEDIUM },
  get tdNowrap() {
    return { ...this.td, whiteSpace: "nowrap", color: theme.SLATE };
  },
  get tdStrong() {
    return { ...this.td, fontWeight: theme.FW_EXTRABOLD, whiteSpace: "nowrap" };
  },
  get tdRight() {
    return { ...this.td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  },
  get tdRightStrong() {
    return { ...this.td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: theme.FW_EXTRABOLD, color: theme.ACCENT };
  },
  totalRow: { background: theme.ACCENT_SOFT },
  get tdTotal() {
    return { ...this.td, fontWeight: theme.FW_EXTRABOLD, color: theme.TEXT };
  },
  get tdTotalRight() {
    return { ...this.td, textAlign: "right", fontWeight: theme.FW_EXTRABOLD, fontVariantNumeric: "tabular-nums" };
  },
};
