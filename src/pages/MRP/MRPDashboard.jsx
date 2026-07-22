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
import React, { useMemo, useState } from "react";
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
  TableScroll,
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
import { ACCENT, TEXT, SLATE, SURFACE_INSET } from "../../styles/theme";
import { th, td, fmtDate } from "./components/mrpFormat";
import { MovementBadge, LocationBadge } from "./components/mrpUi";
import UbicacionDetalleModal from "./components/UbicacionDetalleModal";

const KPI_STYLE = { minHeight: 100, padding: 14, gap: 6, borderRadius: 18 };
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtInt = (n) => new Intl.NumberFormat("es-CR").format(Number(n || 0));

const BAR_FILL = "linear-gradient(90deg, #089F8A 0%, #26C6AC 100%)";

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
        <span style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
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
          <span style={{ fontSize: 14, fontWeight: 950, color: TEXT }}>
            {fmtInt(value)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
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

export default function MRPDashboard() {
  const { warehouseId, warehouse } = useMrpWorkspace();
  // Captura del instante de montaje (fuera del render) para la ventana de 7 días.
  const [mountedAt] = useState(() => Date.now());
  const [ubic, setUbic] = useState(null); // { location, label }

  const filters = useMemo(
    () => (warehouseId ? { warehouseId } : {}),
    [warehouseId]
  );

  const {
    summary,
    loading: sumLoading,
    error: sumError,
    refetch: refetchSummary,
  } = usePalletSummary({ warehouseId: warehouseId || null });

  const {
    movements,
    loading: movLoading,
    error: movError,
    refetch: refetchMovements,
  } = usePalletMovements(filters);

  const loading = sumLoading || movLoading;
  const error = sumError || movError;
  const refetch = () => {
    refetchSummary();
    refetchMovements();
  };

  // Actividad de los últimos 7 días, derivada del historial cargado.
  const activity = useMemo(() => {
    const since = mountedAt - 7 * DAY_MS;
    const recent = movements.filter((m) => {
      const t = new Date(m.created_at).getTime();
      return Number.isFinite(t) && t >= since;
    });
    let ingresos = 0;
    let salidas = 0;
    let traslados = 0;
    for (const m of recent) {
      if (m.movement_type === "ajuste_positivo") ingresos += 1;
      else if (m.movement_type === "ajuste_negativo") salidas += 1;
      else if (m.movement_type === "traslado") traslados += 1;
    }
    return { total: recent.length, ingresos, salidas, traslados };
  }, [movements, mountedAt]);

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

  const recentMovements = useMemo(() => movements.slice(0, 8), [movements]);

  return (
    <>
      <style>{`
        .mrp-dash-table tbody tr { transition: background-color .12s ease; }
        .mrp-dash-table tbody tr:nth-child(even) { background: ${SURFACE_INSET}; }
        .mrp-dash-table tbody tr:hover { background: rgba(8,159,138,0.08); }
      `}</style>

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

          {/* KPIs de actividad (7 días) */}
          <SectionTitle
            title="Actividad reciente"
            hint="Movimientos de los últimos 7 días"
          />
          <KpiGrid min={170}>
            <KpiCard
              label="Movimientos"
              value={fmtInt(activity.total)}
              hint="Total 7 días"
              icon={Activity}
              accent
              style={KPI_STYLE}
            />
            <KpiCard
              label="Ingresos"
              value={fmtInt(activity.ingresos)}
              hint="Ajustes positivos"
              icon={ArrowDownToLine}
              style={KPI_STYLE}
            />
            <KpiCard
              label="Salidas"
              value={fmtInt(activity.salidas)}
              hint="Ajustes negativos"
              icon={ArrowUpFromLine}
              style={KPI_STYLE}
            />
            <KpiCard
              label="Traslados"
              value={fmtInt(activity.traslados)}
              icon={ArrowLeftRight}
              style={KPI_STYLE}
            />
          </KpiGrid>

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
                  <TableScroll minWidth={320}>
                    <table
                      className="mrp-dash-table"
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
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
                                fontWeight: 900,
                              }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{
                                ...td,
                                fontFamily: "monospace",
                                fontWeight: 950,
                              }}
                            >
                              {a.codigo}
                            </td>
                            <td style={td}>{a.nombre}</td>
                            <td
                              style={{
                                ...td,
                                textAlign: "right",
                                fontWeight: 950,
                              }}
                            >
                              {fmtInt(a.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
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
              <TableScroll minWidth={640}>
                <table
                  className="mrp-dash-table"
                  style={{ width: "100%", borderCollapse: "collapse" }}
                >
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
                          <span style={{ fontFamily: "monospace", fontWeight: 950 }}>
                            {m.articulo?.codigo}
                          </span>{" "}
                          · {m.articulo?.nombre}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
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
                </table>
              </TableScroll>
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
