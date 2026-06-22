import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  User,
} from "lucide-react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../../firebase";
import {
  Badge,
  Brand,
  Button,
  Container,
  EmptyState,
  GhostButton,
  Hero,
  Main,
  Shell,
  Spinner,
  TableScroll,
  Topbar,
} from "../../../components/ui";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../../styles/theme";

const OT_TYPES = {
  MB02: { code: "MB02", label: "Extra ×1.5", color: "#0D9488", bg: "rgba(13,148,136,0.12)", border: "rgba(13,148,136,0.30)" },
  MB03: { code: "MB03", label: "Sábado excedente", color: "#7C3AED", bg: "rgba(124,58,237,0.10)", border: "rgba(124,58,237,0.25)" },
  MB17: { code: "MB17", label: "Triple ×3", color: "#DC2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.25)" },
};

function formatHours(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  return `${(total / 60).toFixed(1)} h`;
}

function groupByEmployeeAndMB(records) {
  const map = new Map();

  records.forEach((record) => {
    const employeeName = (record.employeeName || "Sin nombre").trim();
    const mbType = record.mbType || "MB02";
    const key = `${record.employeeDocId || record.codeEmployee || employeeName}__${mbType}`;
    const minutes = Number(record.minutes) || 0;

    if (!map.has(key)) {
      map.set(key, {
        key,
        employeeName,
        codeEmployee: record.codeEmployee || "",
        nameJobPosition: record.nameJobPosition || "",
        coordinatorName: record.coordinatorName || "",
        mbType,
        totalMinutes: 0,
        count: 0,
      });
    }

    const group = map.get(key);
    group.totalMinutes += minutes;
    group.count += 1;
  });

  return Array.from(map.values()).sort((a, b) => {
    const nameCompare = a.employeeName.localeCompare(b.employeeName);
    if (nameCompare !== 0) return nameCompare;
    return a.mbType.localeCompare(b.mbType);
  });
}

export default function OvertimeMonthlyReport() {
  const nav = useNavigate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadValidated = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(
        query(collection(db, "overtime_manager_validated"), orderBy("validatedAt", "desc"))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecords(list);
    } catch (e) {
      console.error("Error cargando reporte:", e);
      setError(e.message || "No se pudo cargar el reporte.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadValidated();
  }, [loadValidated]);

  const rows = useMemo(() => groupByEmployeeAndMB(records), [records]);
  const totalMinutes = useMemo(() => rows.reduce((s, r) => s + r.totalMinutes, 0), [rows]);

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={FileSpreadsheet}
          title="Horas Extra"
          subtitle="Reporte Mensual"
          onClick={() => nav("/administracion")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Administración"
            title="Reporte Mensual de Horas Extra"
            subtitle="Horas extra validadas por gerencia, agrupadas por colaborador y tipo MB."
            badge={<Badge icon={FileSpreadsheet}>{rows.length} líneas</Badge>}
            aside={
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={loadValidated}
                disabled={loading}
                block
              >
                Actualizar
              </Button>
            }
          />

          {!!error && <div style={styles.errorBanner}>{error}</div>}

          {loading ? (
            <Spinner label="Cargando reporte..." />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin registros validados"
              description="No hay horas extra validadas por gerencia aún."
              action={
                <Button variant="primary" icon={RefreshCw} onClick={loadValidated}>
                  Recargar
                </Button>
              }
            />
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>
                <div>
                  <div style={styles.tableTitle}>Reporte consolidado</div>
                  <div style={styles.tableSubtitle}>Una fila por colaborador y tipo MB</div>
                </div>
                <Badge icon={Clock}>{formatHours(totalMinutes)}</Badge>
              </div>

              <div style={styles.tableScroll}>
                <TableScroll minWidth={720} bordered={false}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Empleado</th>
                      <th style={styles.th}>Puesto</th>
                      <th style={styles.th}>Coordinador</th>
                      <th style={styles.thCenter}>Tipo MB</th>
                      <th style={styles.thRight}>Registros</th>
                      <th style={styles.thRight}>Total horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const t = OT_TYPES[row.mbType] || OT_TYPES.MB02;
                      return (
                        <tr key={row.key} style={styles.tr}>
                          <td style={styles.tdName}>
                            <div style={styles.nameCell}>
                              <span style={styles.avatar}>
                                <User size={16} strokeWidth={2.3} />
                              </span>
                              <strong style={styles.employeeName}>{row.employeeName}</strong>
                            </div>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.jobCell}>
                              <Briefcase size={12} strokeWidth={2.2} />
                              {row.nameJobPosition || "—"}
                            </span>
                          </td>
                          <td style={styles.td}>{row.coordinatorName || "—"}</td>
                          <td style={styles.tdCenter}>
                            <span style={{ ...styles.mbBadge, color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>
                              {t.code}
                            </span>
                          </td>
                          <td style={styles.tdRight}>{row.count}</td>
                          <td style={styles.tdRight}>
                            <strong style={styles.hoursValue}>{formatHours(row.totalMinutes)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </TableScroll>
              </div>
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  errorBanner: {
    background: "rgba(185,28,28,0.08)",
    border: "1px solid rgba(185,28,28,0.25)",
    color: "#B91C1C",
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  tableCard: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    boxShadow: SHADOW_CARD,
    overflow: "hidden",
  },
  tableHeader: {
    padding: 16,
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_INSET,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tableTitle: {
    color: TEXT,
    fontWeight: 950,
    fontSize: 15,
  },
  tableSubtitle: {
    color: SLATE,
    fontWeight: 800,
    fontSize: 12,
    marginTop: 3,
  },
  tableScroll: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: 700,
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  thRight: {
    textAlign: "right",
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  thCenter: {
    textAlign: "center",
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  tr: {
    borderBottom: `1px solid ${BORDER}`,
  },
  tdName: {
    padding: "12px 14px",
    color: TEXT,
    verticalAlign: "middle",
  },
  td: {
    padding: "12px 14px",
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    verticalAlign: "middle",
  },
  tdRight: {
    padding: "12px 14px",
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    textAlign: "right",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  tdCenter: {
    padding: "12px 14px",
    textAlign: "center",
    verticalAlign: "middle",
  },
  nameCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: ACCENT_SOFT,
    color: ACCENT,
    flexShrink: 0,
  },
  employeeName: {
    color: TEXT,
    fontSize: 13.5,
    fontWeight: 950,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 280,
  },
  jobCell: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: SLATE,
    fontSize: 12,
    fontWeight: 800,
  },
  mbBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 8,
    fontSize: 11.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  hoursValue: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: 950,
  },
};
