// Reporte de despachos — tabla completa por rango de fechas + descarga .xlsx.
//
// Fuente: public.despacho_dev_despachos (Supabase), mismo scope que el tablero
// «Despachos en progreso» (tenant / company / bodega activa del perfil). El
// cálculo y la consulta viven en ./despachoReporte.js y el Excel en
// ./despachoReporteExcel.js.

import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Boxes, CalendarRange, Download, FileSpreadsheet, Layers, Lock, Package, RefreshCw, Store, Truck } from "lucide-react";
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
import { canAccessByRoleOrPermission } from "../../../config/permissions";
import { buildMapaEstados, labelFor } from "../board/lib/mapaEstados";
import {
  fetchReporteDespachos,
  filtrarReporte,
  rangoRapido,
  resumenGeneral,
  resumenPorTienda,
  tiendaKey,
  totalTarimas,
} from "./despachoReporte";
import { downloadReporteDespachos } from "./despachoReporteExcel";

const RANGOS = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "mes", label: "Este mes" },
  { key: "mesAnterior", label: "Mes anterior" },
];

const MAX_FILAS_PANTALLA = 300;

const fmtInt = (n) => Number(n || 0).toLocaleString("es-CR");
const fmtDec = (n) => Number(n || 0).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtFechaHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("es-CR")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DespachoReportePage() {
  const nav = useNavigate();
  const toast = useToast();
  const { role, permisos, profile, tenantId, company, bodegaId, loading: authLoading } = useContext(AuthCtx) || {};

  const hasPermission = canAccessByRoleOrPermission({ role, permisos, profile }, { anyPerms: ["despacho"] });
  const hasScope = Boolean(tenantId && bodegaId);
  const hasAccess = hasPermission && hasScope;

  const [rango, setRango] = useState(() => ({ ...rangoRapido("mes"), key: "mes" }));
  const [estados, setEstados] = useState([]);
  const [tiendas, setTiendas] = useState([]);
  const [texto, setTexto] = useState("");

  const [data, setData] = useState({ despachos: [], choferes: new Map(), catalogo: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const rangoInvalido = Boolean(rango.desde && rango.hasta && rango.desde > rango.hasta);

  const load = useCallback(async () => {
    if (!hasAccess || !rango.desde || !rango.hasta || rangoInvalido) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReporteDespachos({ tenantId, company, bodegaId, desde: rango.desde, hasta: rango.hasta });
      setData(res);
    } catch (e) {
      console.error("reporte despachos:", e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [hasAccess, tenantId, company, bodegaId, rango.desde, rango.hasta, rangoInvalido]);

  useEffect(() => {
    void load();
  }, [load]);

  const mapaEstados = useMemo(() => buildMapaEstados(data.catalogo), [data.catalogo]);

  // Opciones de filtro presentes en el rango cargado.
  const estadosDisponibles = useMemo(() => {
    const present = new Set(data.despachos.map((d) => d.estado).filter(Boolean));
    const ordered = (data.catalogo || []).map((e) => e.codigo).filter((c) => present.has(c));
    for (const c of present) if (!ordered.includes(c)) ordered.push(c);
    return ordered;
  }, [data]);
  const tiendasDisponibles = useMemo(
    () => [...new Set(data.despachos.map(tiendaKey))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [data.despachos]
  );

  const filtrados = useMemo(
    () => filtrarReporte(data.despachos, { estados, tiendas, texto }),
    [data.despachos, estados, tiendas, texto]
  );
  const resumen = useMemo(() => resumenGeneral(filtrados), [filtrados]);
  const porTienda = useMemo(() => resumenPorTienda(filtrados), [filtrados]);

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const filtrosTexto = useMemo(() => {
    const parts = [];
    if (estados.length) parts.push(`Estados: ${estados.map((e) => labelFor(e, data.catalogo)).join(", ")}`);
    if (tiendas.length) parts.push(`Tiendas: ${tiendas.join(", ")}`);
    if (texto.trim()) parts.push(`Búsqueda: "${texto.trim()}"`);
    return parts.join(" · ");
  }, [estados, tiendas, texto, data.catalogo]);

  const bodegaNombre = profile?.bodegaNombre || data.despachos[0]?.bodega_nombre || bodegaId || "";

  const handleExport = async () => {
    if (!filtrados.length) {
      toast.warning("No hay despachos para exportar con los filtros actuales.");
      return;
    }
    try {
      setExporting(true);
      const fileName = await downloadReporteDespachos({
        despachos: filtrados,
        choferes: data.choferes,
        catalogo: data.catalogo,
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
      console.error("export reporte despachos:", e);
      toast.error("No se pudo generar el Excel. Intentá nuevamente.");
    } finally {
      setExporting(false);
    }
  };

  const limpiarFiltros = () => {
    setEstados([]);
    setTiendas([]);
    setTexto("");
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
            ? "Elegí una bodega activa para ver el reporte de despachos."
            : "Necesitás el permiso de Despacho para ver este reporte."
        }
      />
    );
  } else {
    body = (
      <div style={styles.stack}>
        {/* Filtros */}
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
            <Field label="Desde" htmlFor="rep-desde" error={rangoInvalido ? " " : undefined}>
              <Field.Input
                id="rep-desde"
                type="date"
                value={rango.desde}
                onChange={(e) => setRango((p) => ({ ...p, desde: e.target.value, key: null }))}
              />
            </Field>
            <Field label="Hasta" htmlFor="rep-hasta" error={rangoInvalido ? " " : undefined}>
              <Field.Input
                id="rep-hasta"
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

          <SearchInput value={texto} onChange={setTexto} placeholder="Buscar por referencia, tienda, placa, marchamo, DUA..." />

          {tiendasDisponibles.length > 0 ? (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Tienda</span>
              <ChipsRow>
                {tiendasDisponibles.map((t) => (
                  <Chip key={t} active={tiendas.includes(t)} onClick={() => toggle(tiendas, setTiendas, t)}>
                    {t}
                  </Chip>
                ))}
              </ChipsRow>
            </div>
          ) : null}

          {estadosDisponibles.length > 0 ? (
            <div style={styles.filterGroup}>
              <span style={styles.filterLabel}>Estado</span>
              <ChipsRow>
                {estadosDisponibles.map((c) => (
                  <Chip key={c} active={estados.includes(c)} onClick={() => toggle(estados, setEstados, c)}>
                    <span style={{ ...styles.dot, background: mapaEstados.color(c) }} />
                    {mapaEstados.label(c)}
                  </Chip>
                ))}
              </ChipsRow>
            </div>
          ) : null}

          <div style={styles.panelFooter}>
            <span style={styles.counter}>
              {loading ? "Cargando…" : `${fmtInt(filtrados.length)} de ${fmtInt(data.despachos.length)} despachos del periodo`}
            </span>
            <div style={styles.footerBtns}>
              <SecondaryButton size="sm" icon={RefreshCw} onClick={load} disabled={loading || rangoInvalido}>
                Actualizar
              </SecondaryButton>
              {estados.length || tiendas.length || texto ? (
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
        ) : loading && !data.despachos.length ? (
          <Skeleton height={320} />
        ) : (
          <>
            {/* KPIs */}
            <KpiGrid min={170}>
              <KpiCard label="Despachos" value={fmtInt(resumen.despachos)} hint="En el periodo" icon={Truck} accent />
              <KpiCard label="Total tarimas" value={fmtInt(resumen.total)} hint="Sencillas + dobles" icon={Boxes} accent />
              <KpiCard label="Tarimas sencillas" value={fmtInt(resumen.sencillas)} icon={Package} />
              <KpiCard label="Tarimas dobles" value={fmtInt(resumen.dobles)} icon={Layers} />
              <KpiCard label="Promedio por despacho" value={fmtDec(resumen.promedio)} hint="Tarimas" icon={Boxes} />
              <KpiCard label="Tiendas" value={fmtInt(resumen.tiendas)} icon={Store} />
            </KpiGrid>

            {filtrados.length === 0 ? (
              <EmptyState
                center
                icon={FileSpreadsheet}
                title="No hay despachos en este periodo"
                description="Probá con otro rango de fechas o quitá filtros."
              />
            ) : (
              <>
                {/* Resumen por tienda */}
                <SectionTitle title="Tarimas por tienda" hint="Ordenado por total de tarimas." />
                <TableScroll minWidth={620}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Tienda</th>
                        <th style={styles.thRight}>Despachos</th>
                        <th style={styles.thRight}>Sencillas</th>
                        <th style={styles.thRight}>Dobles</th>
                        <th style={styles.thRight}>Total tarimas</th>
                        <th style={styles.thRight}>Promedio</th>
                        <th style={styles.thRight}>% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porTienda.map((t) => (
                        <tr key={t.tienda} style={styles.tr}>
                          <td style={styles.tdStrong}>{t.tienda}</td>
                          <td style={styles.tdRight}>{fmtInt(t.despachos)}</td>
                          <td style={styles.tdRight}>{fmtInt(t.sencillas)}</td>
                          <td style={styles.tdRight}>{fmtInt(t.dobles)}</td>
                          <td style={styles.tdRightStrong}>{fmtInt(t.total)}</td>
                          <td style={styles.tdRight}>{fmtDec(t.promedio)}</td>
                          <td style={styles.tdRight}>
                            {resumen.total ? `${((t.total / resumen.total) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr style={styles.totalRow}>
                        <td style={styles.tdTotal}>Total</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.despachos)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.sencillas)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.dobles)}</td>
                        <td style={styles.tdTotalRight}>{fmtInt(resumen.total)}</td>
                        <td style={styles.tdTotalRight}>{fmtDec(resumen.promedio)}</td>
                        <td style={styles.tdTotalRight}>100%</td>
                      </tr>
                    </tbody>
                  </table>
                </TableScroll>

                {/* Detalle */}
                <SectionTitle
                  title="Detalle de despachos"
                  hint={
                    filtrados.length > MAX_FILAS_PANTALLA
                      ? `Se muestran los ${MAX_FILAS_PANTALLA} más recientes; el Excel incluye los ${fmtInt(filtrados.length)}.`
                      : "Del más reciente al más antiguo."
                  }
                  action={<Badge icon={FileSpreadsheet}>{fmtInt(filtrados.length)} filas</Badge>}
                />
                <TableScroll minWidth={1180}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Fecha</th>
                        <th style={styles.th}>Referencia</th>
                        <th style={styles.th}>Tienda</th>
                        <th style={styles.th}>Estado</th>
                        <th style={styles.thRight}>Sencillas</th>
                        <th style={styles.thRight}>Dobles</th>
                        <th style={styles.thRight}>Total</th>
                        <th style={styles.th}>Placa</th>
                        <th style={styles.th}>Marchamo</th>
                        <th style={styles.th}>Puerta</th>
                        <th style={styles.th}>Chofer</th>
                        <th style={styles.th}>DUA</th>
                        <th style={styles.thRight}>Fotos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.slice(0, MAX_FILAS_PANTALLA).map((d) => {
                        const chofer = d.chofer_id ? data.choferes.get(d.chofer_id) : null;
                        return (
                          <tr key={d.id} style={styles.tr}>
                            <td style={styles.tdNowrap}>{fmtFechaHora(d.fecha)}</td>
                            <td style={styles.tdStrong}>{d.referencia || "—"}</td>
                            <td style={styles.td}>{tiendaKey(d)}</td>
                            <td style={styles.td}>
                              <span style={styles.estado}>
                                <span style={{ ...styles.dot, background: mapaEstados.color(d.estado) }} />
                                {mapaEstados.label(d.estado)}
                              </span>
                            </td>
                            <td style={styles.tdRight}>{fmtInt(d.tarimas_s)}</td>
                            <td style={styles.tdRight}>{fmtInt(d.tarimas_d)}</td>
                            <td style={styles.tdRightStrong}>{fmtInt(totalTarimas(d))}</td>
                            <td style={styles.td}>{d.placa || d.placa_contenedor || "—"}</td>
                            <td style={styles.td}>{d.marchamo || "—"}</td>
                            <td style={styles.td}>{d.puerta || "—"}</td>
                            <td style={styles.td}>{chofer?.nombre || "—"}</td>
                            <td style={styles.td}>{d.con_dua === "Sí" || d.con_dua === true ? d.numero_dua || "Sí" : "No"}</td>
                            <td style={styles.tdRight}>{fmtInt(d.fotos_count)}</td>
                          </tr>
                        );
                      })}
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
        <Brand icon={Truck} title="Reporte de despachos" subtitle="Tarimas por despacho y tienda" onClick={() => nav("/despacho")} />
        <Topbar.Right>
          {hasAccess ? (
            <PrimaryButton
              icon={Download}
              onClick={handleExport}
              loading={exporting}
              disabled={exporting || loading || !filtrados.length}
            >
              Descargar .xlsx
            </PrimaryButton>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/despacho")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Despacho"
            title="Reporte de despachos"
            subtitle="Todos los despachos del periodo con sus tarimas sencillas, dobles y total, por tienda. Descargable en Excel."
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
  dot: { width: 8, height: 8, borderRadius: theme.RADIUS_PILL, display: "inline-block", marginRight: 6, flexShrink: 0 },
  estado: { display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" },
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
    return { ...this.td, fontWeight: theme.FW_EXTRABOLD };
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
