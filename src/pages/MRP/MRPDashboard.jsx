// MRP Tarimas — Dashboard del módulo.
//
// Vista panorámica que combina el inventario por artículo (usePalletSummary) con
// la actividad de movimientos (usePalletMovements) del almacén de trabajo activo:
//   - KPIs de stock (global, en revisión, merma, descartes).
//   - KPIs de actividad de los últimos 7 días (ingresos, salidas, traslados).
//   - Distribución de stock por ubicación (barras) y top de artículos.
//   - Últimos movimientos registrados.
//
// REGLA DE NEGOCIO: `merma` es ubicación operativa y cuenta en el total global;
// los `descartes` (ajustes negativos) NO son inventario y se reportan aparte.
import { useMemo, useState } from "react";
import {
  Boxes,
  Inbox,
  Recycle,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Activity,
  Package,
} from "lucide-react";
import {
  KpiCard,
  KpiGrid,
  SectionTitle,
  Card,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../components/ui";
import {
  usePalletSummary,
  usePalletMovements,
  useMrpWorkspace,
} from "../../hooks/mrp";
import { PALLET_LOCATION_LABELS } from "../../services/mrp";
import {
  ACCENT,
  ACCENT_LIGHT,
  ACCENT_SOFT,
  TEXT,
  SLATE,
  SURFACE_INSET,
  RADIUS_MD,
  FS_XS,
  FS_BASE,
  FS_LG,
  FW_SEMIBOLD,
  FW_BOLD,
  FW_EXTRABOLD,
} from "../../styles/theme";
import { th, td, fmtDate } from "./components/mrpFormat";
import { MovementBadge, LocationBadge } from "./components/mrpUi";
import MrpTable from "./components/MrpTable";
import UbicacionDetalleModal from "./components/UbicacionDetalleModal";

const KPI_STYLE = { minHeight: 100, padding: 14, gap: 6, borderRadius: 18 };
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtInt = (n) => new Intl.NumberFormat("es-CR").format(Number(n || 0));

const BAR_FILL = `linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT_LIGHT} 100%)`;

// Barra horizontal para la distribución por ubicación (valor + porcentaje).
// `share` es el % sobre el total del almacén; el ancho se calcula sobre el
// máximo (`max`) para que la barra más alta llene el riel.
function DistributionBar({ label, value, max, total, onClick }) {
  const widthPct = max > 0 ? (value / max) * 100 : 0;
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  // Valores >0 mantienen un ancho mínimo visible.
  const width = value > 0 ? Math.max(widthPct, 3) : 0;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e);
        }
      }}
      title={onClick ? "Ver detalle por artículo" : undefined}
      style={{
        display: "grid",
        gap: 7,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ fontSize: FS_BASE, fontWeight: FW_BOLD, color: TEXT }}>
          {label}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: FS_BASE, fontWeight: FW_EXTRABOLD, color: TEXT }}>
            {fmtInt(value)}
          </span>
          <span
            style={{
              fontSize: FS_XS,
              fontWeight: FW_SEMIBOLD,
              color: SLATE,
              minWidth: 34,
              textAlign: "right",
            }}
          >
            {share}%
          </span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: SURFACE_INSET,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            borderRadius: 999,
            background: BAR_FILL,
            transition: "width .3s ease",
          }}
        />
      </div>
    </div>
  );
}

// Métrica compacta en línea (icono + cifra + etiqueta) para la tira de actividad.
function MetricInline({ icon: Icon, label, value, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 36,
          height: 36,
          borderRadius: RADIUS_MD,
          background: accent ? ACCENT_SOFT : SURFACE_INSET,
          color: accent ? ACCENT : SLATE,
          flexShrink: 0,
        }}
      >
        {Icon ? <Icon size={18} strokeWidth={2.2} /> : null}
      </span>
      <div style={{ display: "grid", lineHeight: 1.1, minWidth: 0 }}>
        <span style={{ fontSize: FS_LG, fontWeight: FW_EXTRABOLD, color: TEXT }}>
          {fmtInt(value)}
        </span>
        <span style={{ fontSize: FS_XS, fontWeight: FW_BOLD, color: SLATE }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export default function MRPDashboard() {
  const { warehouseId, warehouse } = useMrpWorkspace();
  // Captura del instante de montaje (fuera del render) para la ventana de 7 días.
  const [mountedAt] = useState(() => Date.now());
  const [ubic, setUbic] = useState(null); // { location, label }

  // Ventana estable de 7 días (ISO) para acotar la consulta de actividad en la
  // BD (created_at >= dateFrom), en lugar de filtrar en memoria.
  const sevenDaysAgoISO = useMemo(
    () => new Date(mountedAt - 7 * DAY_MS).toISOString(),
    [mountedAt]
  );

  const activityFilters = useMemo(
    () =>
      warehouseId
        ? { warehouseId, dateFrom: sevenDaysAgoISO }
        : { dateFrom: sevenDaysAgoISO },
    [warehouseId, sevenDaysAgoISO]
  );

  const recentFilters = useMemo(
    () => (warehouseId ? { warehouseId, limit: 8 } : { limit: 8 }),
    [warehouseId]
  );

  const {
    summary,
    loading: sumLoading,
    error: sumError,
    refetch: refetchSummary,
  } = usePalletSummary({ warehouseId: warehouseId || null });

  // KPIs de actividad: consulta acotada a 7 días en la BD, para que los conteos
  // reflejen exactamente la ventana y no dependan de cuántos movimientos se
  // hayan cargado en la lista general.
  const {
    movements: activityMovements,
    loading: actLoading,
    error: actError,
    refetch: refetchActivity,
  } = usePalletMovements(activityFilters);

  // Últimos movimientos: solo los 8 más recientes (consulta independiente).
  const {
    movements: recentMovements,
    loading: recentLoading,
    error: recentError,
    refetch: refetchRecent,
  } = usePalletMovements(recentFilters);

  const loading = sumLoading || actLoading || recentLoading;
  const error = sumError || actError || recentError;
  const refetch = () => {
    refetchSummary();
    refetchActivity();
    refetchRecent();
  };

  // Conteo por tipo sobre la ventana ya acotada a 7 días.
  const activity = useMemo(() => {
    let ingresos = 0;
    let salidas = 0;
    let traslados = 0;
    for (const m of activityMovements) {
      if (m.movement_type === "ajuste_positivo") ingresos += 1;
      else if (m.movement_type === "ajuste_negativo") salidas += 1;
      else if (m.movement_type === "traslado") traslados += 1;
    }
    return {
      total: activityMovements.length,
      ingresos,
      salidas,
      traslados,
    };
  }, [activityMovements]);

  const byLocation = useMemo(
    () =>
      (summary.byLocation || [])
        .slice()
        .sort((a, b) => b.total - a.total),
    [summary.byLocation]
  );
  const maxLocation = byLocation.reduce((m, l) => Math.max(m, l.total), 0);
  const totalLocation = byLocation.reduce((s, l) => s + (l.total || 0), 0);

  const topArticulos = useMemo(
    () =>
      (summary.byArticulo || [])
        .slice()
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
    [summary.byArticulo]
  );

  return (
    <>
      <SectionTitle
        title="Dashboard"
        action={
          warehouse?.name ? (
            <Badge tone="accent">{warehouse.name}</Badge>
          ) : undefined
        }
      />

      {loading ? (
        <Spinner label="Cargando dashboard…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : (
        <>
          {/* KPIs de stock */}
          <KpiGrid min={170}>
            <KpiCard
              label="Stock total"
              value={fmtInt(summary.totalGlobal)}
              hint="Todas las ubicaciones (incl. merma)"
              icon={Boxes}
              accent
              style={KPI_STYLE}
            />
            <KpiCard
              label="En revisión"
              value={fmtInt(summary.totalPend)}
              hint="Ubicación de ingreso"
              icon={Inbox}
              style={KPI_STYLE}
            />
            <KpiCard
              label="En merma"
              value={fmtInt(summary.totalMerma)}
              icon={Recycle}
              style={KPI_STYLE}
            />
            <KpiCard
              label="Descartes"
              value={fmtInt(summary.totalDiscards)}
              hint="Ajustes negativos (histórico)"
              icon={Trash2}
              style={KPI_STYLE}
            />
          </KpiGrid>

          {/* Actividad (7 días): tira compacta. Es contexto secundario, así que
              no compite con los KPIs de stock ni ocupa una fila completa. */}
          <Card style={{ padding: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginRight: "auto",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: ACCENT,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: FS_XS,
                    fontWeight: FW_EXTRABOLD,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: SLATE,
                  }}
                >
                  Actividad · últimos 7 días
                </span>
              </div>
              <MetricInline
                icon={Activity}
                label="Movimientos"
                value={activity.total}
                accent
              />
              <MetricInline
                icon={ArrowDownToLine}
                label="Ingresos"
                value={activity.ingresos}
              />
              <MetricInline
                icon={ArrowUpFromLine}
                label="Salidas"
                value={activity.salidas}
              />
              <MetricInline
                icon={ArrowLeftRight}
                label="Traslados"
                value={activity.traslados}
              />
            </div>
          </Card>

          {/* Distribución por ubicación + top de artículos */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <SectionTitle title="Distribución por ubicación" />
              {byLocation.length === 0 ? (
                <EmptyState
                  icon={Boxes}
                  title="Sin inventario"
                  description="Aún no hay stock por ubicación."
                />
              ) : (
                <Card style={{ display: "grid", gap: 18, padding: 20 }}>
                  {byLocation.map((l) => {
                    const label =
                      PALLET_LOCATION_LABELS[l.location] || l.location;
                    return (
                      <DistributionBar
                        key={l.location}
                        label={label}
                        value={l.total}
                        max={maxLocation}
                        total={totalLocation}
                        onClick={() =>
                          setUbic({ location: l.location, label })
                        }
                      />
                    );
                  })}
                </Card>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <SectionTitle title="Top artículos" hint="Mayor stock global" />
              {topArticulos.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Sin artículos"
                  description="Aún no hay artículos con stock."
                />
              ) : (
                <Card padding={0}>
                  <MrpTable minWidth={320}>
                      <thead>
                        <tr>
                          <th style={{ ...th, width: 40, textAlign: "right" }}>#</th>
                          <th style={th}>Código</th>
                          <th style={th}>Artículo</th>
                          <th style={{ ...th, textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topArticulos.map((a, i) => (
                          <tr key={a.articulo_id}>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                color: SLATE,
                                fontWeight: FW_BOLD,
                              }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{
                                ...td,
                                fontFamily: "monospace",
                                fontWeight: FW_EXTRABOLD,
                              }}
                            >
                              {a.codigo}
                            </td>
                            <td style={td}>{a.nombre}</td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontWeight: FW_EXTRABOLD,
                              }}
                            >
                              {fmtInt(a.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                  </MrpTable>
                </Card>
              )}
            </div>
          </div>

          {/* Últimos movimientos */}
          <SectionTitle title="Últimos movimientos" />
          {recentMovements.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Sin movimientos"
              description="Aún no se han registrado movimientos."
            />
          ) : (
            <Card padding={0}>
              <MrpTable minWidth={640}>
                  <thead>
                    <tr>
                      <th style={th}>Fecha</th>
                      <th style={th}>Movimiento</th>
                      <th style={th}>Artículo</th>
                      <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                      <th style={th}>Origen</th>
                      <th style={th}>Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMovements.map((m) => (
                      <tr key={m.id}>
                        <td style={td}>{fmtDate(m.created_at)}</td>
                        <td style={td}>
                          <MovementBadge
                            value={m.movement_type}
                            metadata={m.metadata}
                          />
                        </td>
                        <td style={td}>
                          <span style={{ fontFamily: "monospace", fontWeight: FW_EXTRABOLD }}>
                            {m.articulo?.codigo}
                          </span>{" "}
                          · {m.articulo?.nombre}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
                          {fmtInt(m.quantity)}
                        </td>
                        <td style={td}>
                          <LocationBadge value={m.origin_location} />
                        </td>
                        <td style={td}>
                          <LocationBadge value={m.destination_location} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </MrpTable>
            </Card>
          )}
        </>
      )}

      {ubic && (
        <UbicacionDetalleModal
          open
          location={ubic.location}
          locationLabel={ubic.label}
          articuloId={null}
          onClose={() => setUbic(null)}
        />
      )}
    </>
  );
}
