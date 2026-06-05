import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  RefreshCw,
  TimerReset,
  User,
  X,
} from "lucide-react";
import { auth } from "../firebase";
import { AuthCtx } from "../auth/AuthProvider";
import { getOvertimeRecords, decideOvertimeRecord } from "../services/overtimeApi";
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
  StatusPill,
  Topbar,
} from "../components/ui";
import {
  ACCENT,
  BORDER,
  DANGER,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  TEXT,
} from "../styles/theme";

const STATUS_TONE = {
  approved: "ok",
  rejected: "danger",
  pending: "warn",
};

const STATUS_LABEL = {
  approved: "Aprobada",
  rejected: "Rechazada",
  pending: "Pendiente",
};

const STATUS_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendientes" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Rechazadas" },
];

const STALE_DAYS = 15;

function statusInfo(raw) {
  const key = String(raw || "pending").toLowerCase();
  return {
    tone: STATUS_TONE[key] || "neutral",
    label: STATUS_LABEL[key] || raw || "—",
    key,
  };
}

function getDaysOld(date) {
  if (!date) return null;
  const today = new Date();
  const recordDate = new Date(date);
  const diffMs = today - recordDate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function OvertimeCard({ record, savingId, onDecide }) {
  const { tone, label, key } = statusInfo(record.status);
  const busy = savingId === record.attendanceId;

  const isPending = key === "pending";
  const daysOld = isPending ? getDaysOld(record.date) : null;
  const isStale = daysOld != null && daysOld >= STALE_DAYS;
  const isDecided = key === "approved" || key === "rejected";

  const companyOvertime = record.companyOvertime || record.overtime || "00:00";
  const systemOvertime = record.systemOvertime || "—";
  const discardedByRule =
    !record.hasCompanyOvertime && record.hasSystemOvertime;

  let companyReasonText = "";
  if (record.companyOvertimeReason === "below-threshold") {
    companyReasonText = "No supera mínimo de 30 minutos";
  } else if (record.companyOvertimeReason === "calculated") {
    companyReasonText = "Calculada según salida programada";
  } else if (record.companyOvertimeReason === "weekend-all") {
    companyReasonText = "Día no laboral: todo el tiempo es extra";
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <div style={styles.person}>
          <div style={styles.avatar}>
            <User size={18} strokeWidth={2.2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={styles.personName}>{record.fullName || "Sin nombre"}</div>
            <div style={styles.personRole}>
              <Briefcase size={12} strokeWidth={2.2} />
              {record.nameJobPosition || "Sin puesto"}
            </div>
          </div>
        </div>
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>

      {record.isWeekend && (
        <div style={styles.weekendBadge}>
          <CalendarDays size={12} strokeWidth={2.4} />
          {record.dayName || "Fin de semana"} · día no laboral
        </div>
      )}

      {isPending && daysOld != null && (
        <div style={isStale ? styles.ageBadgeStale : styles.ageBadge}>
          <Clock size={12} strokeWidth={2.4} />
          {daysOld === 0
            ? "Registrada hoy"
            : `Hace ${daysOld} día${daysOld === 1 ? "" : "s"}`}
          {isStale ? " · requiere atención" : ""}
        </div>
      )}

      <div style={styles.metaGrid}>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>
            <CalendarDays size={13} strokeWidth={2.2} /> Fecha
          </span>
          <span style={styles.metaValue}>{record.date || "—"}</span>
          {record.dayName && (
            <span style={styles.metaSub}>{record.dayName}</span>
          )}
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>
            <Clock size={13} strokeWidth={2.2} /> Entrada
          </span>
          <span style={styles.metaValue}>{record.startEnroll || "—"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>
            <Clock size={13} strokeWidth={2.2} /> Salida
          </span>
          <span style={styles.metaValue}>{record.endEnroll || "—"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>
            <TimerReset size={13} strokeWidth={2.2} /> Horas extra empresa
          </span>
          <span style={{ ...styles.metaValue, color: ACCENT, fontWeight: 950 }}>
            {companyOvertime}
          </span>
          <span style={styles.metaSub}>Sistema: {systemOvertime}</span>
          {discardedByRule && (
            <span style={styles.discardBadge}>Descartada por regla empresa</span>
          )}
          {!!companyReasonText && (
            <span style={styles.reasonText}>{companyReasonText}</span>
          )}
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Turno</span>
          <span style={styles.metaValue}>{record.scheduleName || "—"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Horario</span>
          <span style={styles.metaValue}>{record.scheduleRange || "—"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>
            <User size={13} strokeWidth={2.2} /> Coordinador
          </span>
          <span style={styles.metaValue}>{record.coordinatorName || "—"}</span>
        </div>
      </div>

      {isDecided && (
        <div style={styles.history}>
          <span style={styles.historyLine}>
            {key === "approved" ? "Aprobada" : "Rechazada"} por{" "}
            <strong>{record.decidedByEmail || "—"}</strong>
          </span>
          {!!record.note && (
            <span style={styles.historyNote}>“{record.note}”</span>
          )}
        </div>
      )}

      <div style={styles.cardActions}>
        <Button
          variant="primary"
          icon={Check}
          size="sm"
          loading={busy}
          disabled={busy || key === "approved"}
          onClick={() => onDecide(record, "approved")}
        >
          Aprobar
        </Button>
        <Button
          variant="ghost"
          icon={X}
          size="sm"
          disabled={busy || key === "rejected"}
          onClick={() => onDecide(record, "rejected")}
          style={{ color: DANGER, borderColor: "rgba(185,28,28,0.25)" }}
        >
          Rechazar
        </Button>
      </div>
    </div>
  );
}

export default function OvertimeApprovals() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { role } = useContext(AuthCtx);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  const isDev = role === "dev";

  const [statusFilter, setStatusFilter] = useState("pending");
  const [coordinatorFilter, setCoordinatorFilter] = useState("all");
  const [onlyCompanyOvertime, setOnlyCompanyOvertime] = useState(true);

  const loadRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getOvertimeRecords();
      setRecords(res.records || []);
    } catch (e) {
      console.error("Error cargando horas extra:", e);
      setError(e.message || "No se pudieron cargar las horas extra. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const decideRecord = async (record, status) => {
    const promptMsg =
      status === "approved"
        ? "Observación de aprobación:"
        : "Motivo de rechazo:";
    const note = window.prompt(promptMsg, "");
    if (note === null) return; // canceló

    setSavingId(record.attendanceId);
    try {
      await decideOvertimeRecord({
        attendanceId: record.attendanceId,
        status,
        note,
        record,
      });
      await loadRecords();
    } catch (e) {
      console.error("Error guardando decisión:", e);
      setError(e.message || "No se pudo guardar la decisión. Intentá de nuevo.");
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const coordinators = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.coordinatorName) set.add(r.coordinatorName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const pendingCount = useMemo(
    () => records.filter((r) => statusInfo(r.status).key === "pending").length,
    [records]
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const key = statusInfo(r.status).key;
      const statusOk = statusFilter === "all" || key === statusFilter;
      const coordinatorOk =
        coordinatorFilter === "all" || r.coordinatorName === coordinatorFilter;
      if (onlyCompanyOvertime && !r.hasCompanyOvertime) return false;
      return statusOk && coordinatorOk;
    });
  }, [records, statusFilter, coordinatorFilter, onlyCompanyOvertime]);

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Clock}
          title="Horas Extra"
          subtitle="Aprobaciones"
          onClick={() => nav("/administracion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Administración"
            title="Aprobación de horas extras"
            subtitle={
              isDev
                ? "Vista completa: estás viendo las horas extra de todos los coordinadores."
                : "Estás viendo las horas extra de los coordinadores asignados a tu correo."
            }
            badge={<Badge icon={TimerReset}>{pendingCount} pendientes</Badge>}
            aside={
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={loadRecords}
                disabled={loading}
                block
              >
                Actualizar
              </Button>
            }
          />

          <div style={styles.filters}>
            <div style={styles.filterChips}>
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    style={active ? styles.chipActive : styles.chip}
                  >
                    {f.label}
                    {f.key === "pending" && pendingCount > 0 ? (
                      <span style={active ? styles.chipCountActive : styles.chipCount}>
                        {pendingCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <select
              value={coordinatorFilter}
              onChange={(e) => setCoordinatorFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Todos los coordinadores</option>
              {coordinators.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={onlyCompanyOvertime}
                onChange={(e) => setOnlyCompanyOvertime(e.target.checked)}
              />
              Solo con extra empresa
            </label>
          </div>

          {!!error && <div style={styles.errorBanner}>{error}</div>}

          {loading ? (
            <Spinner label="Cargando horas extra…" />
          ) : filteredRecords.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin registros"
              description="No hay horas extra que coincidan con los filtros seleccionados."
              action={
                <Button variant="primary" icon={RefreshCw} onClick={loadRecords}>
                  Recargar
                </Button>
              }
            />
          ) : (
            <div style={styles.list}>
              {filteredRecords.map((record) => (
                <OvertimeCard
                  key={record.attendanceId}
                  record={record}
                  savingId={savingId}
                  onDecide={decideRecord}
                />
              ))}
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  filters: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterChips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: SLATE,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  chipActive: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${ACCENT}`,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
  chipCount: {
    background: "rgba(15,23,42,0.08)",
    color: SLATE,
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 11,
    fontWeight: 900,
  },
  chipCountActive: {
    background: ACCENT,
    color: "#fff",
    borderRadius: 999,
    padding: "1px 8px",
    fontSize: 11,
    fontWeight: 900,
  },
  select: {
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 220,
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: DANGER,
    borderRadius: 14,
    padding: 14,
    fontWeight: 800,
    fontSize: 13,
  },
  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
    gap: 14,
  },
  card: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 18,
    boxShadow: SHADOW_CARD,
    display: "grid",
    gap: 14,
  },
  cardHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  person: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  personName: {
    fontWeight: 900,
    fontSize: 15,
    color: TEXT,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  personRole: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    marginTop: 3,
  },
  ageBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "start",
    background: "rgba(245,158,11,0.12)",
    color: "#B45309",
    border: "1px solid rgba(245,158,11,0.25)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11.5,
    fontWeight: 850,
  },
  weekendBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "start",
    background: "rgba(124,58,237,0.10)",
    color: "#6D28D9",
    border: "1px solid rgba(124,58,237,0.25)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11.5,
    fontWeight: 900,
  },
  ageBadgeStale: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "start",
    background: "rgba(185,28,28,0.10)",
    color: DANGER,
    border: "1px solid rgba(185,28,28,0.30)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11.5,
    fontWeight: 900,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
    paddingTop: 14,
    borderTop: `1px solid ${BORDER}`,
  },
  metaItem: { display: "grid", gap: 3, minWidth: 0 },
  metaLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 800,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.03,
  },
  metaValue: { fontSize: 14, fontWeight: 850, color: TEXT },
  metaSub: { fontSize: 11.5, fontWeight: 700, color: SLATE },
  discardBadge: {
    display: "inline-flex",
    alignSelf: "start",
    background: "rgba(185,28,28,0.10)",
    color: DANGER,
    border: "1px solid rgba(185,28,28,0.25)",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10.5,
    fontWeight: 900,
    marginTop: 2,
  },
  reasonText: { fontSize: 11, fontWeight: 700, color: SLATE, fontStyle: "italic" },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
    color: SLATE,
    cursor: "pointer",
  },
  history: {
    display: "grid",
    gap: 4,
    paddingTop: 12,
    borderTop: `1px solid ${BORDER}`,
  },
  historyLine: { fontSize: 12.5, fontWeight: 700, color: SLATE },
  historyNote: {
    fontSize: 12.5,
    fontWeight: 700,
    color: TEXT,
    fontStyle: "italic",
  },
  cardActions: {
    display: "flex",
    gap: 10,
    paddingTop: 14,
    borderTop: `1px solid ${BORDER}`,
  },
};
