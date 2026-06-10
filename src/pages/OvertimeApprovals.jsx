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
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "../firebase";
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

/**
 * Clasificación de horas extra:
 * - MB02 (×1.5): extra entre semana no feriado, o sábado no feriado (dentro de horario laboral)
 * - MB03 (×1.5 recargo): sábado no feriado, horas que exceden el horario laboral programado
 * - MB17 (×3 triple): domingo, día feriado, o sábado que cae en feriado
 */
const OT_TYPES = {
  MB02: { code: "MB02", label: "Extra normal ×1.5", color: "#0D9488", bg: "rgba(13,148,136,0.12)", border: "rgba(13,148,136,0.30)" },
  MB03: { code: "MB03", label: "Extra sábado excedente", color: "#7C3AED", bg: "rgba(124,58,237,0.10)", border: "rgba(124,58,237,0.25)" },
  MB17: { code: "MB17", label: "Triple ×3", color: "#DC2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.25)" },
};

/**
 * Determina el tipo de hora extra para un registro.
 * @param {object} record - El registro de hora extra
 * @param {string[]} feriadoDates - Arreglo de fechas YYYY-MM-DD que son feriados
 * @returns {{ code, label, color, bg, border } | null}
 */
function classifyOvertime(record, feriadoDates) {
  if (!record.date) return null;

  const dateStr = String(record.date).trim();
  // Intentar parsear la fecha (puede venir como YYYY-MM-DD o DD/MM/YYYY)
  let dateObj;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateObj = new Date(dateStr + "T12:00:00");
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("/");
    dateObj = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
  } else {
    dateObj = new Date(dateStr);
  }

  if (isNaN(dateObj.getTime())) return null;

  const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat
  const isoDate = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
  const isFeriado = feriadoDates.includes(isoDate);
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  // Domingo → MB17
  if (isSunday) return OT_TYPES.MB17;

  // Feriado (cualquier día) → MB17
  if (isFeriado) return OT_TYPES.MB17;

  // Sábado no feriado
  if (isSaturday) {
    // Si el registro tiene horas extra que exceden el horario, esas son MB03
    // El campo isWeekend y/o que tenga horas extra en sábado indica trabajo en sábado
    // Si hay companyOvertimeReason === "weekend-all" → todo es MB02 (viene a trabajar sábado)
    // Si hay extra más allá del horario programado → MB03
    if (record.companyOvertimeReason === "weekend-all") {
      // Vino a trabajar sábado, todo se paga como MB02
      return OT_TYPES.MB02;
    }
    // Sábado con horario programado: si hay extra, la parte que excede es MB03
    // Para simplificar: si tiene systemOvertime > companyOvertime, tiene excedente
    // Por ahora marcamos sábado con extra como MB03 cuando hay extra más allá del horario
    if (record.hasCompanyOvertime) {
      return OT_TYPES.MB03;
    }
    return OT_TYPES.MB02;
  }

  // Día entre semana no feriado → MB02
  return OT_TYPES.MB02;
}

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

/* ─── Modal para motivo de aprobación/rechazo ─── */
function ReasonModal({ open, action, onConfirm, onClose }) {
  const [note, setNote] = useState("");
  const isReject = action === "rejected";
  const MIN_REJECT_CHARS = 15;
  const canSubmit = isReject ? note.trim().length >= MIN_REJECT_CHARS : true;

  // Reset cuando se abre
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit) {
      e.preventDefault();
      onConfirm(note.trim());
    }
  };

  return (
    <div style={reasonModalStyles.backdrop} onClick={onClose}>
      <div style={reasonModalStyles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={reasonModalStyles.header}>
          <div>
            <div style={reasonModalStyles.title}>
              {isReject ? "Rechazar hora extra" : "Aprobar hora extra"}
            </div>
            <div style={reasonModalStyles.subtitle}>
              {isReject
                ? "Indicá el motivo del rechazo (mínimo 15 caracteres)."
                : "Podés agregar una observación (opcional)."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={reasonModalStyles.closeBtn}
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isReject ? "Motivo de rechazo…" : "Observación (opcional)…"}
          style={reasonModalStyles.textarea}
        />

        <div style={reasonModalStyles.footer}>
          <span style={reasonModalStyles.hint}>
            {isReject && note.trim().length < MIN_REJECT_CHARS
              ? `${note.trim().length}/${MIN_REJECT_CHARS} caracteres`
              : "Enter para confirmar"}
          </span>
          <div style={reasonModalStyles.actions}>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={isReject ? X : Check}
              disabled={!canSubmit}
              onClick={() => onConfirm(note.trim())}
              style={isReject ? { background: DANGER } : undefined}
            >
              {isReject ? "Rechazar" : "Aprobar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const reasonModalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 50000,
    background: "rgba(15,23,42,0.45)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  dialog: {
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 22,
    boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
    padding: 24,
    width: "100%",
    maxWidth: 420,
    display: "grid",
    gap: 18,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: 950,
    color: TEXT,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 700,
    color: SLATE,
    marginTop: 4,
  },
  closeBtn: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: SLATE,
    cursor: "pointer",
    flexShrink: 0,
  },
  textarea: {
    width: "100%",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 700,
    color: TEXT,
    resize: "vertical",
    minHeight: 72,
    outline: "none",
    fontFamily: "inherit",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hint: {
    fontSize: 11.5,
    fontWeight: 700,
    color: SLATE,
  },
  actions: {
    display: "flex",
    gap: 8,
  },
};

function OvertimeCard({ record, savingId, onDecide, feriadoDates, feriadosMap }) {
  const { tone, label, key } = statusInfo(record.status);
  const busy = savingId === record.attendanceId;

  const isPending = key === "pending";
  const daysOld = isPending ? getDaysOld(record.date) : null;
  const isStale = daysOld != null && daysOld >= STALE_DAYS;
  const isDecided = key === "approved" || key === "rejected";

  const otType = classifyOvertime(record, feriadoDates);

  // Detectar si el día es feriado
  const recordIsoDate = (() => {
    if (!record.date) return "";
    const ds = String(record.date).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return ds;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(ds)) {
      const [dd, mm, yyyy] = ds.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(ds);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  })();
  const isFeriado = recordIsoDate && feriadoDates.includes(recordIsoDate);
  const feriadoName = isFeriado ? (feriadosMap[recordIsoDate] || "Feriado") : "";

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

      {otType && (
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "start",
          background: otType.bg,
          color: otType.color,
          border: `1px solid ${otType.border}`,
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 950,
          letterSpacing: 0.2,
        }}>
          <Clock size={12} strokeWidth={2.4} />
          {otType.code} · {otType.label}
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
          {isFeriado && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 3,
              fontSize: 11,
              fontWeight: 900,
              color: "#DC2626",
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.20)",
              borderRadius: 8,
              padding: "2px 8px",
            }}>
              🎉 Feriado: {feriadoName}
            </span>
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
  const [feriadoDates, setFeriadoDates] = useState([]);
  const [feriadosMap, setFeriadosMap] = useState({});

  // Modal state
  const [reasonModal, setReasonModal] = useState({ open: false, record: null, action: null });

  const isDev = role === "dev";

  // Cargar feriados anuales desde Firestore
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "feriadosAnuales"), orderBy("date", "asc"))
        );
        const dates = [];
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.date) {
            dates.push(data.date);
            map[data.date] = data.name || "Feriado";
          }
        });
        setFeriadoDates(dates);
        setFeriadosMap(map);
      } catch (e) {
        console.error("Error cargando feriados:", e);
      }
    })();
  }, []);

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
    setReasonModal({ open: true, record, action: status });
  };

  const handleReasonConfirm = async (note) => {
    const { record, action } = reasonModal;
    setReasonModal({ open: false, record: null, action: null });

    setSavingId(record.attendanceId);
    try {
      await decideOvertimeRecord({
        attendanceId: record.attendanceId,
        status: action,
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
                  feriadoDates={feriadoDates}
                  feriadosMap={feriadosMap}
                />
              ))}
            </div>
          )}
        </Container>
      </Main>

      <ReasonModal
        open={reasonModal.open}
        action={reasonModal.action}
        onConfirm={handleReasonConfirm}
        onClose={() => setReasonModal({ open: false, record: null, action: null })}
      />
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
