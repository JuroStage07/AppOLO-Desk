import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  LogIn,
  RefreshCw,
  Timer,
  User,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { getAttendanceMarks } from "../../services/overtimeApi";
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
} from "../../components/ui";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  SURFACE_INSET,
  SURFACE_SOFT,
  TEXT,
  WARN_BG,
  WARN_BORDER,
} from "../../styles/theme";

/* ─── Helpers ─── */
function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function safeText(value) {
  return String(value ?? "").trim();
}

// Hora de pared (HH:MM) directa del string, sin convertir con Date (evita bugs de zona horaria).
function enrollClockMinutes(value) {
  const text = safeText(value);
  if (!text) return null;
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  const plain = text.match(/(\d{1,2}):(\d{2})/);
  if (plain) return Number(plain[1]) * 60 + Number(plain[2]);
  return null;
}

function hhmmToMinutes(value) {
  const m = safeText(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatClock(value) {
  const text = safeText(value);
  if (!text) return "—";
  const iso = text.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const plain = text.match(/(\d{1,2}):(\d{2})/);
  if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
  return text;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function prettyDate(key) {
  const m = safeText(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key || "—";
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return `${DAY_NAMES[d.getDay()]} ${m[3]}-${m[2]}-${m[1]}`;
}

const TOLERANCE_OPTIONS = [
  { value: 0, label: "Sin tolerancia (>0 min)" },
  { value: 5, label: "5 min de gracia" },
  { value: 10, label: "10 min de gracia" },
  { value: 15, label: "15 min de gracia" },
];

// Primera hora HH:MM de un rango "08:00 - 17:00" → "08:00".
function parseInTime(range) {
  const m = safeText(range).match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "";
}

// Aplica el override de horario (definido en OvertimeUsersAdmin → overtimeUsers)
// sobre una marca: reemplaza horario y deriva expectedIn del rango del override.
function applyScheduleOverride(record, overridesByEmployee) {
  const ov = overridesByEmployee.get(Number(record.idEmployee));
  if (!ov) return record;
  return {
    ...record,
    scheduleName: ov.scheduleName || record.scheduleName,
    scheduleRange: ov.scheduleRange || record.scheduleRange,
    expectedIn: parseInTime(ov.scheduleRange) || record.expectedIn,
    scheduleOverridden: true,
  };
}

// Devuelve { status: "late" | "ontime" | "unknown", lateMinutes }
function classifyMark(record, tolerance) {
  const enroll = enrollClockMinutes(record.startEnroll);
  const expected = hhmmToMinutes(record.expectedIn || record.scheduleRange);
  if (enroll == null || expected == null) {
    return { status: "unknown", lateMinutes: null };
  }
  const lateMinutes = enroll - expected;
  if (lateMinutes > tolerance) return { status: "late", lateMinutes };
  return { status: "ontime", lateMinutes };
}

const STATUS_ORDER = { late: 0, ontime: 1, unknown: 2 };

// El endpoint puede devolver varias fichadas por empleado/día (re-marcas, salidas).
// La entrada real es la marca más temprana: deduplicamos por empleado quedándonos con ella.
function dedupeEarliestEntry(records) {
  const byEmployee = new Map();
  for (const r of records) {
    const key = r.idEmployee ?? r.codeEmployee ?? r.fullName;
    const mins = enrollClockMinutes(r.startEnroll);
    if (mins == null) continue;
    const cur = byEmployee.get(key);
    if (!cur || mins < cur._mins) {
      byEmployee.set(key, { ...r, _mins: mins });
    }
  }
  return Array.from(byEmployee.values());
}

export default function AttendanceMarks() {
  const nav = useNavigate();

  const [date, setDate] = useState(todayKey());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tolerance, setTolerance] = useState(10);
  const [coordinatorFilter, setCoordinatorFilter] = useState("all");
  const [onlyLate, setOnlyLate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, usersSnap] = await Promise.all([
        getAttendanceMarks(date),
        getDocs(collection(db, "overtimeUsers")),
      ]);
      // Map idEmployee → override de horario (asignado en OvertimeUsersAdmin).
      const overrides = new Map();
      usersSnap.forEach((d) => {
        const u = d.data();
        if (u.overrideScheduleId != null && u.idEmployee != null) {
          overrides.set(Number(u.idEmployee), {
            scheduleName: u.overrideScheduleName || "",
            scheduleRange: u.overrideScheduleRange || "",
          });
        }
      });
      const list = (data?.records || [])
        .filter((r) => safeText(r.startEnroll))
        .map((r) => applyScheduleOverride(r, overrides));
      setRecords(dedupeEarliestEntry(list));
    } catch (e) {
      console.error("Error cargando marcas del día:", e);
      setError(e.message || "No se pudieron cargar las marcas del día.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const coordinators = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.coordinatorName) set.add(r.coordinatorName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const rows = useMemo(() => {
    return records
      .map((r) => ({ ...r, ...classifyMark(r, tolerance) }))
      .filter((r) =>
        coordinatorFilter === "all" ? true : r.coordinatorName === coordinatorFilter
      )
      .filter((r) => (onlyLate ? r.status === "late" : true))
      .sort((a, b) => {
        const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (so !== 0) return so;
        if (a.status === "late") return (b.lateMinutes || 0) - (a.lateMinutes || 0);
        return safeText(a.fullName).localeCompare(safeText(b.fullName));
      });
  }, [records, tolerance, coordinatorFilter, onlyLate]);

  const stats = useMemo(() => {
    let late = 0;
    let ontime = 0;
    records.forEach((r) => {
      const { status } = classifyMark(r, tolerance);
      if (status === "late") late += 1;
      else if (status === "ontime") ontime += 1;
    });
    return { total: records.length, late, ontime };
  }, [records, tolerance]);

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={AlarmClock}
          title="Marcas del Día"
          subtitle="Asistencia · Tardanzas"
          onClick={() => nav("/administracion")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Administración
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Asistencia"
            title="Marcas de entrada del día"
            subtitle="Hora real de entrada de cada empleado que marcó hoy, comparada con su horario asignado para detectar tardanzas."
            badge={<Badge icon={CalendarDays}>{prettyDate(date)}</Badge>}
            aside={
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={load}
                disabled={loading}
                block
              >
                Actualizar
              </Button>
            }
          />

          <div style={styles.summaryStrip}>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Marcas</span>
              <strong style={styles.summaryValue}>{stats.total}</strong>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>A tiempo</span>
              <strong style={{ ...styles.summaryValue, color: ACCENT }}>{stats.ontime}</strong>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Tarde</span>
              <strong style={{ ...styles.summaryValue, color: DANGER }}>{stats.late}</strong>
            </div>
          </div>

          {/* Controles */}
          <div style={styles.filterBar}>
            <label style={styles.filterLabel}>
              <CalendarDays size={14} strokeWidth={2.2} />
              Fecha
              <input
                type="date"
                value={date}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value || todayKey())}
                style={styles.dateInput}
              />
            </label>

            <label style={styles.filterLabel}>
              <Timer size={14} strokeWidth={2.2} />
              Tolerancia
              <select
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                style={styles.filterSelect}
              >
                {TOLERANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label style={styles.filterLabel}>
              <Filter size={14} strokeWidth={2.2} />
              Coordinador
              <select
                value={coordinatorFilter}
                onChange={(e) => setCoordinatorFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">Todos</option>
                {coordinators.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              style={{ ...styles.toggleBtn, ...(onlyLate ? styles.toggleBtnActive : {}) }}
              onClick={() => setOnlyLate((v) => !v)}
            >
              <AlarmClock size={14} strokeWidth={2.4} />
              Solo tardanzas
            </button>
          </div>

          {!!error && <div style={styles.errorBanner}>{error}</div>}

          {loading ? (
            <Spinner label="Cargando marcas del día..." />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin marcas para mostrar"
              description={
                onlyLate
                  ? "No hay tardanzas con los filtros actuales."
                  : "No hay marcas de entrada registradas para este día."
              }
              action={
                <Button variant="primary" icon={RefreshCw} onClick={load}>
                  Recargar
                </Button>
              }
            />
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>
                <div style={styles.tableTitle}>Marcas de entrada</div>
                <Badge icon={User}>{rows.length} empleados</Badge>
              </div>

              <TableScroll minWidth={820} bordered={false}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Empleado</th>
                      <th style={styles.th}>Coordinador</th>
                      <th style={styles.th}>Horario</th>
                      <th style={styles.thCenter}>Entrada esperada</th>
                      <th style={styles.thCenter}>Marca real</th>
                      <th style={styles.thCenter}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = r.attendanceId ?? `${r.idEmployee}-${r.startEnroll}`;
                      return (
                        <tr key={key} style={r.status === "late" ? styles.lateRow : undefined}>
                          <td style={styles.tdName}>
                            <div style={styles.nameCell}>
                              <span style={styles.avatar}>
                                <User size={17} strokeWidth={2.3} />
                              </span>
                              <span style={styles.nameTextWrap}>
                                <strong style={styles.employeeName}>
                                  {r.fullName || "Sin nombre"}
                                </strong>
                                <span style={styles.employeeSub}>
                                  Ficha {r.codeEmployee || "—"}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td style={styles.td}>{r.coordinatorName || "—"}</td>
                          <td style={styles.td}>
                            {r.scheduleName || r.scheduleRange ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <span>
                                  {r.scheduleName || "—"}
                                  {r.scheduleRange ? (
                                    <span style={styles.scheduleRange}> ({r.scheduleRange})</span>
                                  ) : null}
                                </span>
                                {r.scheduleOverridden && (
                                  <span style={styles.overrideBadge} title="Horario asignado manualmente en Gestión de Usuarios">
                                    Override
                                  </span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={styles.tdCenter}>{r.expectedIn || "—"}</td>
                          <td style={styles.tdCenter}>
                            <span style={styles.markTime}>
                              <LogIn size={13} strokeWidth={2.2} />
                              {formatClock(r.startEnroll)}
                            </span>
                          </td>
                          <td style={styles.tdCenter}>
                            {r.status === "late" ? (
                              <span style={styles.lateBadge}>
                                <AlarmClock size={12} strokeWidth={2.4} />
                                Tarde +{r.lateMinutes} min
                              </span>
                            ) : r.status === "ontime" ? (
                              <span style={styles.ontimeBadge}>
                                <CheckCircle2 size={12} strokeWidth={2.4} />
                                A tiempo
                              </span>
                            ) : (
                              <span style={styles.unknownBadge}>Sin horario</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
    gap: 10,
  },
  summaryItem: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "10px 12px",
    boxShadow: SHADOW_CARD,
    display: "grid",
    gap: 2,
  },
  summaryLabel: {
    color: SLATE,
    fontSize: 11,
    fontWeight: 850,
  },
  summaryValue: {
    color: TEXT,
    fontSize: 16,
    fontWeight: 950,
    lineHeight: 1,
  },
  errorBanner: {
    background: DANGER_BG,
    border: `1px solid ${DANGER_BORDER}`,
    color: DANGER,
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  filterLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: SLATE,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  dateInput: {
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  filterSelect: {
    appearance: "none",
    WebkitAppearance: "none",
    padding: "8px 32px 8px 12px",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: `${SURFACE} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`,
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer",
  },
  toggleBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: SLATE,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  toggleBtnActive: {
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    color: DANGER,
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
  table: {
    width: "100%",
    minWidth: 820,
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
  thCenter: {
    textAlign: "center",
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  td: {
    padding: "12px 14px",
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    verticalAlign: "middle",
    borderBottom: `1px solid ${BORDER}`,
  },
  tdCenter: {
    padding: "12px 14px",
    textAlign: "center",
    verticalAlign: "middle",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
    whiteSpace: "nowrap",
  },
  tdName: {
    padding: "12px 14px",
    color: TEXT,
    verticalAlign: "middle",
    minWidth: 240,
    borderBottom: `1px solid ${BORDER}`,
  },
  nameCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: ACCENT_SOFT,
    color: ACCENT,
    flexShrink: 0,
  },
  nameTextWrap: {
    minWidth: 0,
    display: "grid",
    gap: 3,
  },
  employeeName: {
    display: "block",
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: TEXT,
    fontSize: 13.5,
    fontWeight: 950,
  },
  employeeSub: {
    color: SLATE,
    fontSize: 12,
    fontWeight: 800,
  },
  scheduleRange: {
    color: SLATE,
    fontWeight: 700,
  },
  overrideBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: 999,
    background: "rgba(124,58,237,0.10)",
    color: "#7C3AED",
    border: "1px solid rgba(124,58,237,0.25)",
    fontSize: 10.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  markTime: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: TEXT,
    fontSize: 13,
    fontWeight: 950,
  },
  lateRow: {
    background: "rgba(220,38,38,0.05)",
  },
  lateBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 11px",
    borderRadius: 999,
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    color: DANGER,
    fontSize: 11.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  ontimeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 11px",
    borderRadius: 999,
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: ACCENT,
    fontSize: 11.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  unknownBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 11px",
    borderRadius: 999,
    border: `1px solid ${WARN_BORDER}`,
    background: WARN_BG,
    color: "#92400E",
    fontSize: 11.5,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
};
