import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Box,
  DollarSign,
  Package,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  KpiCard,
  KpiGrid,
  Main,
  Shell,
  SectionTitle,
  StatusPill,
  Topbar,
} from "../../components/ui";
import {
  TARIMAS,
  MATERIALES,
  REPARACIONES,
  computeMRPMetrics,
} from "../../mocks/mockMRPTarimas";
import {
  ACCENT,
  BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  SLATE,
  TEXT,
  WARN_BG,
  WARN_BORDER,
} from "../../styles/theme";

export default function MRPDashboardPage() {
  const nav = useNavigate();

  const metrics = useMemo(() => computeMRPMetrics(TARIMAS, MATERIALES), []);

  const alertas = useMemo(
    () => MATERIALES.filter((m) => m.stock <= m.stockMinimo),
    []
  );

  const reparacionesActivas = useMemo(
    () => REPARACIONES.filter((r) => r.estado === "en_proceso"),
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={BarChart3}
          title="Dashboard MRP"
          subtitle="Resumen general"
          onClick={() => nav("/mrp-tarimas/dashboard")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mrp-tarimas")}>
            MRP
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            layout="compact"
            kicker="MRP Tarimas"
            title="Dashboard"
            badge={<Badge icon={BarChart3}>Resumen</Badge>}
          />

          <KpiGrid min={180}>
            <KpiCard
              label="Total tarimas"
              value={metrics.total}
              hint="Inventario completo"
              icon={Package}
            />
            <KpiCard
              label="Sencillas disp."
              value={metrics.sencillasDisponibles}
              hint="Listas para uso"
              icon={Package}
            />
            <KpiCard
              label="Dobles disp."
              value={metrics.doblesDisponibles}
              hint="Listas para uso"
              icon={Package}
            />
            <KpiCard
              label="En reparación"
              value={metrics.enReparacion}
              hint="Proceso activo"
              icon={Wrench}
              accent
            />
            <KpiCard
              label="Dañadas"
              value={metrics.danadas}
              hint="Pendientes de evaluación"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Costo total rep."
              value={`₡${metrics.costoTotal.toLocaleString()}`}
              hint="Acumulado global"
              icon={DollarSign}
            />
            <KpiCard
              label="Materiales OK"
              value={metrics.materialesDisponibles}
              hint="Stock suficiente"
              icon={Box}
            />
            <KpiCard
              label="Alertas stock"
              value={metrics.alertasBajoInventario}
              hint="Bajo inventario"
              icon={AlertTriangle}
              accent
            />
          </KpiGrid>

          {/* Alertas de bajo inventario */}
          {alertas.length > 0 && (
            <div>
              <SectionTitle
                title="Alertas de bajo inventario"
                hint={`${alertas.length} materiales por debajo del mínimo`}
              />
              <div style={styles.alertList}>
                {alertas.map((m) => (
                  <div key={m.id} style={styles.alertRow}>
                    <div style={styles.alertInfo}>
                      <span style={styles.alertName}>{m.nombre}</span>
                      <span style={styles.alertSku}>{m.sku}</span>
                    </div>
                    <div style={styles.alertRight}>
                      <span style={styles.alertStock}>
                        {m.stock} / {m.stockMinimo} {m.unidad}
                      </span>
                      <StatusPill tone="danger">Bajo</StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reparaciones activas */}
          {reparacionesActivas.length > 0 && (
            <div>
              <SectionTitle
                title="Reparaciones en proceso"
                hint={`${reparacionesActivas.length} activas`}
              />
              <div style={styles.alertList}>
                {reparacionesActivas.map((r) => {
                  const tarima = TARIMAS.find((t) => t.id === r.tarimaId);
                  return (
                    <div key={r.id} style={styles.alertRow}>
                      <div style={styles.alertInfo}>
                        <span style={styles.alertName}>
                          {r.tarimaId} — {tarima?.tipo || ""}
                        </span>
                        <span style={styles.alertSku}>
                          {r.tipoDano} · {r.responsable}
                        </span>
                      </div>
                      <div style={styles.alertRight}>
                        <StatusPill tone="warn">En proceso</StatusPill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  alertList: {
    display: "grid",
    gap: 8,
  },
  alertRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: "#fff",
  },
  alertInfo: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  alertName: {
    fontWeight: 850,
    fontSize: 13,
    color: TEXT,
  },
  alertSku: {
    fontWeight: 700,
    fontSize: 12,
    color: SLATE,
  },
  alertRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  alertStock: {
    fontWeight: 800,
    fontSize: 12,
    color: SLATE,
  },
};
