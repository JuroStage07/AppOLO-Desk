import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Brand,
  Chip,
  ChipsRow,
  Container,
  GhostButton,
  Hero,
  KpiCard,
  KpiGrid,
  Main,
  SearchInput,
  SectionTitle,
  Shell,
  StatusPill,
  TableScroll,
  Topbar,
} from "../../components/ui";
import {
  REPARACIONES,
  TARIMAS,
  MATERIALES,
} from "../../mocks/mockMRPTarimas";
import { ACCENT, BORDER, SLATE, TEXT } from "../../styles/theme";

export default function MRPReparacionesPage() {
  const nav = useNavigate();

  const [filterEstado, setFilterEstado] = useState("todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return REPARACIONES.filter((r) => {
      if (filterEstado !== "todos" && r.estado !== filterEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.tarimaId.toLowerCase().includes(q) &&
          !r.responsable.toLowerCase().includes(q) &&
          !r.tipoDano.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [filterEstado, search]);

  const totalCosto = useMemo(
    () =>
      REPARACIONES.reduce((acc, r) => {
        const matCost = r.materiales.reduce((a, m) => a + m.costo, 0);
        return acc + matCost + r.costoManoObra + r.otrosGastos;
      }, 0),
    []
  );

  const activas = REPARACIONES.filter((r) => r.estado === "en_proceso").length;
  const completadas = REPARACIONES.filter((r) => r.estado === "completada").length;

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Wrench}
          title="Reparaciones"
          subtitle="Historial y seguimiento"
          onClick={() => nav("/mrp-tarimas/reparaciones")}
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
            title="Reparaciones"
            badge={<Badge icon={Wrench}>Seguimiento</Badge>}
          />

          <KpiGrid min={180}>
            <KpiCard
              label="Total reparaciones"
              value={REPARACIONES.length}
              hint="Registros históricos"
              icon={Wrench}
            />
            <KpiCard
              label="Activas"
              value={activas}
              hint="En proceso actual"
              icon={Wrench}
              accent
            />
            <KpiCard
              label="Completadas"
              value={completadas}
              hint="Finalizadas con éxito"
              icon={CheckCircle2}
            />
            <KpiCard
              label="Costo total"
              value={`₡${totalCosto.toLocaleString()}`}
              hint="Suma de todas las reparaciones"
              icon={DollarSign}
            />
          </KpiGrid>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por tarima, responsable o daño..."
          />

          <ChipsRow>
            <Chip active={filterEstado === "todos"} onClick={() => setFilterEstado("todos")}>
              Todos
            </Chip>
            <Chip active={filterEstado === "en_proceso"} onClick={() => setFilterEstado("en_proceso")}>
              En proceso
            </Chip>
            <Chip active={filterEstado === "completada"} onClick={() => setFilterEstado("completada")}>
              Completadas
            </Chip>
            <Chip active={filterEstado === "pendiente"} onClick={() => setFilterEstado("pendiente")}>
              Pendientes
            </Chip>
          </ChipsRow>

          <SectionTitle
            title="Registros"
            hint={`${filtered.length} reparación${filtered.length !== 1 ? "es" : ""}`}
          />

          <div style={styles.tableWrap}>
            <TableScroll minWidth={880} bordered={false}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Tarima</th>
                  <th style={styles.th}>Tipo de daño</th>
                  <th style={styles.th}>Materiales</th>
                  <th style={styles.th}>Costo total</th>
                  <th style={styles.th}>Responsable</th>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tarima = TARIMAS.find((t) => t.id === r.tarimaId);
                  const matCost = r.materiales.reduce((a, m) => a + m.costo, 0);
                  const total = matCost + r.costoManoObra + r.otrosGastos;

                  return (
                    <tr key={r.id} style={styles.tr}>
                      <td style={styles.td}>
                        <span style={styles.tdAccent}>{r.id}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.tdAccent}>{r.tarimaId}</span>
                        {tarima && (
                          <span style={styles.tdMeta}> ({tarima.tipo})</span>
                        )}
                      </td>
                      <td style={styles.td}>{r.tipoDano}</td>
                      <td style={styles.td}>
                        {r.materiales.length > 0
                          ? r.materiales.map((m) => {
                              const mat = MATERIALES.find((x) => x.id === m.materialId);
                              return mat ? mat.nombre : m.materialId;
                            }).join(", ")
                          : "—"}
                      </td>
                      <td style={styles.td}>₡{total.toLocaleString()}</td>
                      <td style={styles.td}>{r.responsable}</td>
                      <td style={styles.td}>{r.fecha}</td>
                      <td style={styles.td}>
                        <StatusPill
                          tone={
                            r.estado === "completada"
                              ? "ok"
                              : r.estado === "en_proceso"
                              ? "warn"
                              : "neutral"
                          }
                        >
                          {r.estado === "completada"
                            ? "Completada"
                            : r.estado === "en_proceso"
                            ? "En proceso"
                            : "Pendiente"}
                        </StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </TableScroll>
          </div>
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  tableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    fontFamily: "inherit",
  },
  th: {
    textAlign: "left",
    padding: "12px 12px",
    fontWeight: 900,
    fontSize: 11,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: `1px solid ${BORDER}`,
  },
  td: {
    padding: "10px 12px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    color: TEXT,
    fontWeight: 700,
  },
  tdAccent: {
    fontWeight: 900,
    color: ACCENT,
  },
  tdMeta: {
    fontWeight: 700,
    fontSize: 11,
    color: SLATE,
  },
};
