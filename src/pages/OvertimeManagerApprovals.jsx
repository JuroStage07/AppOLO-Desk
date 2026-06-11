import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Check,
  CheckCheck,
  Clock,
  Filter,
  LogIn,
  LogOut,
  Minus,
  PartyPopper,
  Plus,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  User,
  X,
} from "lucide-react";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db } from "../firebase";
import { AuthCtx } from "../auth/AuthProvider";
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
  Topbar,
} from "../components/ui";
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
} from "../styles/theme";
import { useOvertimeCutoff } from "../hooks/useOvertimeCutoff";
import OvertimeCutoffBanner from "../components/OvertimeCutoffBanner";

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return safeText(value).toLowerCase();
}

function parseHoursToMinutes(value) {
  const text = safeText(value);
  if (!text) return 0;

  if (/^\d+(\.\d+)?$/.test(text)) {
    return Math.round(Number(text) * 60);
  }

  const match = text.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return 0;

  const hours = Number(match[1]) || 0;
  const minutes = Number(match[2]) || 0;
  return hours * 60 + minutes;
}

function overtimeMinutes(record) {
  const directMinutes = Number(record.companyOvertimeMinutes);
  if (Number.isFinite(directMinutes) && directMinutes > 0) return directMinutes;

  return (
    parseHoursToMinutes(record.companyOvertime) ||
    parseHoursToMinutes(record.overtime)
  );
}

function formatHours(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  return `${(total / 60).toFixed(1)} h`;
}

function dateSortValue(record) {
  if (record.date) {
    const parsed = new Date(`${record.date}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }

  const dayKey = safeText(record.dayKey);
  const match = dayKey.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, dd, mm, yy] = match;
    return new Date(`20${yy}-${mm}-${dd}T12:00:00`).getTime();
  }

  return 0;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatDate(record) {
  // Try to build a Date object to extract the day name
  let dateObj = null;

  const date = safeText(record.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    dateObj = new Date(`${date}T12:00:00`);
  }

  const dayKey = safeText(record.dayKey);
  if (!dateObj && dayKey) {
    const match = dayKey.match(/^(\d{2})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, dd, mm, yy] = match;
      dateObj = new Date(`20${yy}-${mm}-${dd}T12:00:00`);
    }
  }

  // Format the short date string (dd-mm-yy)
  let shortDate;
  if (dayKey) {
    shortDate = dayKey;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [yyyy, mm, dd] = date.split("-");
    shortDate = `${dd}-${mm}-${yyyy.slice(-2)}`;
  } else {
    shortDate = date || "--";
  }

  // Prepend day name if we could parse the date
  if (dateObj && !isNaN(dateObj.getTime())) {
    const dayName = DAY_NAMES[dateObj.getDay()];
    return `${dayName} ${shortDate}`;
  }

  // Fallback: use record.dayName if available
  if (record.dayName) {
    return `${record.dayName} ${shortDate}`;
  }

  return shortDate;
}

function coordinatorLabel(names) {
  const list = Array.from(names).filter(Boolean);
  if (list.length === 0) return "--";
  if (list.length === 1) return list[0];
  if (list.length === 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

function isWeekendRecord(record) {
  const date = safeText(record.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const day = new Date(`${date}T12:00:00`).getDay();
    return day === 0 || day === 6;
  }
  const dayKey = safeText(record.dayKey);
  const match = dayKey.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, dd, mm, yy] = match;
    const day = new Date(`20${yy}-${mm}-${dd}T12:00:00`).getDay();
    return day === 0 || day === 6;
  }
  return false;
}

function resolveIsoDate(record) {
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
}

const OT_TYPES = {
  MB02: { code: "MB02", label: "Extra ×1.5", color: "#0D9488", bg: "rgba(13,148,136,0.12)", border: "rgba(13,148,136,0.30)" },
  MB03: { code: "MB03", label: "Sábado excedente", color: "#7C3AED", bg: "rgba(124,58,237,0.10)", border: "rgba(124,58,237,0.25)" },
  MB17: { code: "MB17", label: "Triple ×3", color: "#DC2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.25)" },
};

function classifyOvertime(record, feriadoDates) {
  if (!record.date) return null;

  const dateStr = String(record.date).trim();
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

  const dayOfWeek = dateObj.getDay();
  const isoDate = dateObj.toISOString().slice(0, 10);
  const isFeriado = feriadoDates.includes(isoDate);
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  if (isSunday) return OT_TYPES.MB17;
  if (isFeriado) return OT_TYPES.MB17;

  if (isSaturday) {
    if (record.companyOvertimeReason === "weekend-all") return OT_TYPES.MB02;
    if (record.hasCompanyOvertime) return OT_TYPES.MB03;
    return OT_TYPES.MB02;
  }

  return OT_TYPES.MB02;
}

function groupByEmployee(records) {
  const groups = new Map();

  records.forEach((record) => {
    const employeeName = safeText(record.employeeName || record.fullName) || "Sin nombre";
    const groupKey =
      safeText(record.employeeDocId) ||
      safeText(record.codeEmployee) ||
      safeText(record.idEmployee) ||
      employeeName;
    const minutes = overtimeMinutes(record);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        employeeName,
        idEmployee: record.idEmployee ?? null,
        codeEmployee: record.codeEmployee ?? null,
        jobTitle: record.nameJobPosition || "",
        coordinatorNames: new Set(),
        totalMinutes: 0,
        items: [],
      });
    }

    const group = groups.get(groupKey);
    group.totalMinutes += minutes;
    if (record.coordinatorName) group.coordinatorNames.add(record.coordinatorName);
    group.items.push({ ...record, minutes });
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      coordinatorName: coordinatorLabel(group.coordinatorNames),
      items: group.items.sort((a, b) => dateSortValue(b) - dateSortValue(a)),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export default function OvertimeManagerApprovals() {
  const nav = useNavigate();
  const { user: authUser, role } = useContext(AuthCtx);
  const user = authUser || auth.currentUser;
  const userEmail = normalizeEmail(user?.email);
  const isDev = role === "dev";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [feriadoDates, setFeriadoDates] = useState([]);
  const [feriadosMap, setFeriadosMap] = useState({});
  const [coordinatorFilter, setCoordinatorFilter] = useState("all");
  const [savingIds, setSavingIds] = useState(new Set());
  const [processed, setProcessed] = useState({}); // { [itemId]: "approved" | "rejected" }
  const { next: cutoff, loading: cutoffLoading } = useOvertimeCutoff();

  const itemKey = (item) => item.id || item.path;

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

  const loadApprovedOvertimes = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const snap = await getDocs(collectionGroup(db, "approved"));
      const list = snap.docs
        .map((snapshot) => {
          const data = snapshot.data() || {};
          return {
            id: snapshot.id,
            path: snapshot.ref.path,
            ...data,
          };
        })
        .filter((record) => record.path.startsWith("overtime_control/"))
        .filter((record) => record.status === "approved" || record.statusCollection === "approved")
        .filter((record) => isDev || normalizeEmail(record.managerEmail) === userEmail);

      setRecords(list);
    } catch (e) {
      console.error("Error cargando aprobaciones de horas extra:", e);
      setError(e.message || "No se pudieron cargar las horas extra aprobadas.");
    } finally {
      setLoading(false);
    }
  }, [isDev, userEmail]);

  useEffect(() => {
    loadApprovedOvertimes();
  }, [loadApprovedOvertimes]);

  const coordinators = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.coordinatorName) set.add(r.coordinatorName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (coordinatorFilter === "all") return records;
    return records.filter((r) => r.coordinatorName === coordinatorFilter);
  }, [records, coordinatorFilter]);

  const groups = useMemo(() => groupByEmployee(filteredRecords), [filteredRecords]);
  const totalHours = useMemo(
    () => groups.reduce((sum, group) => sum + group.totalMinutes, 0),
    [groups]
  );

  const toggleExpanded = (groupKey) => {
    setExpanded((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const approveRecord = async (item) => {
    const itemId = item.id || item.path;
    setSavingIds((prev) => new Set(prev).add(itemId));
    try {
      const otType = classifyOvertime(item, feriadoDates);
      await addDoc(collection(db, "overtime_manager_validated"), {
        employeeName: safeText(item.employeeName || item.fullName) || "Sin nombre",
        employeeDocId: safeText(item.employeeDocId) || null,
        codeEmployee: safeText(item.codeEmployee) || null,
        idEmployee: item.idEmployee ?? null,
        nameJobPosition: item.nameJobPosition || "",
        coordinatorName: item.coordinatorName || "",
        managerEmail: item.managerEmail || userEmail,
        date: item.date || "",
        dayKey: item.dayKey || "",
        startEnroll: item.startEnroll || "",
        endEnroll: item.endEnroll || "",
        minutes: overtimeMinutes(item),
        mbType: otType?.code || "MB02",
        mbLabel: otType?.label || "",
        companyOvertime: item.companyOvertime || item.overtime || "",
        validatedByUid: user?.uid || "",
        validatedByEmail: userEmail,
        validatedAt: new Date().toISOString(),
        sourcePath: item.path || "",
      });
      // Mantener visible y marcar como procesada (aprobada)
      setProcessed((prev) => ({ ...prev, [itemId]: "approved" }));
    } catch (e) {
      console.error("Error aprobando registro:", e);
      setError("No se pudo aprobar el registro. " + (e.message || ""));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const rejectRecord = async (item) => {
    const itemId = item.id || item.path;
    setSavingIds((prev) => new Set(prev).add(itemId));
    try {
      // On reject, just remove from local list (don't write to validated)
      // Optionally: move to a rejected subcollection or just remove from approved
      if (item.path) {
        const ref = doc(db, item.path);
        await deleteDoc(ref);
      }
      // Mantener visible y marcar como procesada (rechazada)
      setProcessed((prev) => ({ ...prev, [itemId]: "rejected" }));
    } catch (e) {
      console.error("Error rechazando registro:", e);
      setError("No se pudo rechazar el registro. " + (e.message || ""));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const approveAll = async (group) => {
    const pending = group.items.filter((item) => !processed[itemKey(item)]);
    for (const item of pending) {
      await approveRecord(item);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ShieldCheck}
          title="Horas Extra"
          subtitle="Validacion Gerencia"
          onClick={() => nav("/administracion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesion activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/administracion")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Gerencia"
            title="Validacion de horas extras"
            subtitle={
              isDev
                ? "Vista completa de horas extra aprobadas por coordinacion."
                : "Horas extra aprobadas por coordinacion y asignadas a tu gerencia."
            }
            badge={<Badge icon={ShieldCheck}>{groups.length} colaboradores</Badge>}
            aside={
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={loadApprovedOvertimes}
                disabled={loading}
                block
              >
                Actualizar
              </Button>
            }
          />

          <OvertimeCutoffBanner next={cutoff} loading={cutoffLoading} />

          <div style={styles.summaryStrip}>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Colaboradores</span>
              <strong style={styles.summaryValue}>{groups.length}</strong>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Registros aprobados</span>
              <strong style={styles.summaryValue}>{records.length}</strong>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Total horas</span>
              <strong style={styles.summaryValue}>{formatHours(totalHours)}</strong>
            </div>
          </div>

          {/* Filter bar */}
          <div style={styles.filterBar}>
            <div style={styles.filterLabel}>
              <Filter size={14} strokeWidth={2.2} />
              Filtrar por coordinador
            </div>
            <select
              value={coordinatorFilter}
              onChange={(e) => setCoordinatorFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="all">Todos los coordinadores</option>
              {coordinators.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {!!error && <div style={styles.errorBanner}>{error}</div>}

          {loading ? (
            <Spinner label="Cargando horas extra aprobadas..." />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin horas aprobadas"
              description="No hay horas extra aprobadas por coordinacion para mostrar."
              action={
                <Button variant="primary" icon={RefreshCw} onClick={loadApprovedOvertimes}>
                  Recargar
                </Button>
              }
            />
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableHeader}>
                <div>
                  <div style={styles.tableTitle}>Aprobaciones por colaborador</div>
                </div>
                <Badge icon={TimerReset}>{formatHours(totalHours)}</Badge>
              </div>

              <div style={styles.tableScroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.thAction}></th>
                      <th style={styles.th}>Empleado</th>
                      <th style={styles.th}>Coordinador</th>
                      <th style={styles.thRight}>Registros</th>
                      <th style={styles.thRight}>Horas totales</th>
                      <th style={styles.thCenter}>Tipo MB</th>
                      <th style={styles.thCenter}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      const isExpanded = !!expanded[group.key];
                      const ToggleIcon = isExpanded ? Minus : Plus;
                      const processedCount = group.items.filter(
                        (it) => processed[itemKey(it)]
                      ).length;
                      const allProcessed =
                        group.items.length > 0 && processedCount === group.items.length;

                      return (
                        <React.Fragment key={group.key}>
                          <tr style={styles.tr}>
                            <td style={styles.tdAction}>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(group.key)}
                                style={styles.expandButton}
                                title={isExpanded ? "Ocultar horas extra" : "Ver horas extra"}
                                aria-label={isExpanded ? "Ocultar horas extra" : "Ver horas extra"}
                                aria-expanded={isExpanded}
                              >
                                <ToggleIcon size={16} strokeWidth={2.6} />
                              </button>
                            </td>
                            <td style={styles.tdName}>
                              <div style={styles.nameCell}>
                                <span style={styles.avatar}>
                                  <User size={17} strokeWidth={2.3} />
                                </span>
                                <span style={styles.nameTextWrap}>
                                  <strong style={styles.employeeName}>{group.employeeName}</strong>
                                  <span style={styles.employeeSub}>
                                    <Briefcase size={12} strokeWidth={2.2} />
                                    {group.jobTitle || group.codeEmployee || "Sin puesto"}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td style={styles.td}>{group.coordinatorName}</td>
                            <td style={styles.tdRight}>{group.items.length}</td>
                            <td style={styles.tdRight}>
                              <strong style={styles.hoursTotal}>{formatHours(group.totalMinutes)}</strong>
                            </td>
                            <td style={styles.tdCenter}>
                              {(() => {
                                const types = new Set();
                                group.items.forEach((item) => {
                                  const ot = classifyOvertime(item, feriadoDates);
                                  if (ot) types.add(ot.code);
                                });
                                const arr = Array.from(types);
                                if (arr.length === 0) return <span style={styles.noFeriado}>—</span>;
                                return (
                                  <div style={styles.mbGroup}>
                                    {arr.map((code) => {
                                      const t = OT_TYPES[code];
                                      return (
                                        <span key={code} style={{ ...styles.mbBadge, color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>
                                          {t.code}
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </td>
                            <td style={styles.tdCenter}>
                              {allProcessed ? (
                                <span style={styles.processedBadge}>
                                  <CheckCheck size={13} strokeWidth={2.6} />
                                  Procesada
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  style={styles.approveAllBtn}
                                  onClick={() => approveAll(group)}
                                  title="Aprobar todas las horas de este colaborador"
                                  disabled={savingIds.size > 0}
                                >
                                  <CheckCheck size={14} strokeWidth={2.4} />
                                  {processedCount > 0
                                    ? `Aprobar resto (${group.items.length - processedCount})`
                                    : "Aprobar todo"}
                                </button>
                              )}
                            </td>
                          </tr>

                          {isExpanded ? (
                            <tr>
                              <td style={styles.detailCell} colSpan={7}>
                                <div style={styles.detailPanel}>
                                  <table style={styles.detailTable}>
                                    <thead>
                                      <tr>
                                        <th style={styles.detailTh}>Fecha</th>
                                        <th style={styles.detailTh}>Entrada</th>
                                        <th style={styles.detailTh}>Salida</th>
                                        <th style={styles.detailThCenter}>Feriado</th>
                                        <th style={styles.detailThRight}>Horas</th>
                                        <th style={styles.detailThCenter}>Tipo MB</th>
                                        <th style={styles.detailThCenter}>Acciones</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.items.map((item) => {
                                        const isoDate = resolveIsoDate(item);
                                        const isFeriado = isoDate && feriadoDates.includes(isoDate);
                                        const feriadoName = isFeriado ? (feriadosMap[isoDate] || "Feriado") : "";
                                        const weekend = isWeekendRecord(item);
                                        const procStatus = processed[itemKey(item)];

                                        return (
                                          <tr
                                            key={`${item.path}-${item.dayKey || item.id}`}
                                            style={procStatus ? styles.processedRow : undefined}
                                          >
                                            <td style={styles.detailTd}>
                                              <span style={{ ...styles.detailDate, ...(weekend ? { color: DANGER } : {}) }}>
                                                <CalendarDays size={13} strokeWidth={2.2} />
                                                {formatDate(item)}
                                              </span>
                                            </td>
                                            <td style={styles.detailTd}>
                                              <span style={styles.detailTime}>
                                                <LogIn size={13} strokeWidth={2.2} />
                                                {item.startEnroll || "—"}
                                              </span>
                                            </td>
                                            <td style={styles.detailTd}>
                                              <span style={styles.detailTime}>
                                                <LogOut size={13} strokeWidth={2.2} />
                                                {item.endEnroll || "—"}
                                              </span>
                                            </td>
                                            <td style={styles.detailTdCenter}>
                                              {isFeriado ? (
                                                <span style={styles.feriadoBadge}>
                                                  <PartyPopper size={12} strokeWidth={2.2} />
                                                  {feriadoName}
                                                </span>
                                              ) : (
                                                <span style={styles.noFeriado}>—</span>
                                              )}
                                            </td>
                                            <td style={styles.detailTdRight}>
                                              {formatHours(item.minutes)}
                                            </td>
                                            <td style={styles.detailTdCenter}>
                                              {(() => {
                                                const ot = classifyOvertime(item, feriadoDates);
                                                if (!ot) return <span style={styles.noFeriado}>—</span>;
                                                return (
                                                  <span style={{ ...styles.mbBadge, color: ot.color, background: ot.bg, border: `1px solid ${ot.border}` }}>
                                                    {ot.code}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                            <td style={styles.detailTdCenter}>
                                              {procStatus ? (
                                                <span
                                                  style={
                                                    procStatus === "rejected"
                                                      ? styles.processedBadgeReject
                                                      : styles.processedBadge
                                                  }
                                                >
                                                  {procStatus === "rejected" ? (
                                                    <X size={12} strokeWidth={2.8} />
                                                  ) : (
                                                    <Check size={12} strokeWidth={2.8} />
                                                  )}
                                                  Procesada
                                                </span>
                                              ) : (
                                                <div style={styles.actionGroup}>
                                                  <button
                                                    type="button"
                                                    style={styles.approveBtn}
                                                    onClick={() => approveRecord(item)}
                                                    title="Aprobar"
                                                    disabled={savingIds.has(itemKey(item))}
                                                  >
                                                    <Check size={13} strokeWidth={2.6} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    style={styles.rejectBtn}
                                                    onClick={() => rejectRecord(item)}
                                                    title="Rechazar"
                                                    disabled={savingIds.has(itemKey(item))}
                                                  >
                                                    <X size={13} strokeWidth={2.6} />
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
    minWidth: 200,
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
    minWidth: 760,
    borderCollapse: "collapse",
  },
  thAction: {
    width: 54,
    padding: "12px 10px",
    borderBottom: `1px solid ${BORDER}`,
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
  tdAction: {
    width: 54,
    padding: "12px 10px",
    verticalAlign: "middle",
    overflow: "visible",
  },
  tdName: {
    padding: "12px 14px",
    color: TEXT,
    verticalAlign: "middle",
    minWidth: 260,
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
  expandButton: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: ACCENT,
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
    overflow: "visible",
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
    maxWidth: 360,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: TEXT,
    fontSize: 13.5,
    fontWeight: 950,
  },
  employeeSub: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: SLATE,
    fontSize: 12,
    fontWeight: 800,
  },
  hoursTotal: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: 950,
  },
  detailCell: {
    padding: 0,
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
  },
  detailPanel: {
    margin: "0 14px 14px 64px",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    overflow: "hidden",
    background: SURFACE,
  },
  detailTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  detailTh: {
    textAlign: "left",
    padding: "10px 12px",
    color: SLATE,
    fontSize: 11.5,
    fontWeight: 950,
    background: SURFACE_INSET,
    borderBottom: `1px solid ${BORDER}`,
  },
  detailThRight: {
    textAlign: "right",
    padding: "10px 12px",
    color: SLATE,
    fontSize: 11.5,
    fontWeight: 950,
    background: SURFACE_INSET,
    borderBottom: `1px solid ${BORDER}`,
    width: 140,
  },
  detailThCenter: {
    textAlign: "center",
    padding: "10px 12px",
    color: SLATE,
    fontSize: 11.5,
    fontWeight: 950,
    background: SURFACE_INSET,
    borderBottom: `1px solid ${BORDER}`,
  },
  detailTd: {
    padding: "10px 12px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
  },
  detailTdRight: {
    padding: "10px 12px",
    borderBottom: `1px solid ${BORDER}`,
    color: TEXT,
    fontSize: 13,
    fontWeight: 950,
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  detailTdCenter: {
    padding: "10px 12px",
    borderBottom: `1px solid ${BORDER}`,
    textAlign: "center",
    verticalAlign: "middle",
  },
  detailTime: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: TEXT,
    fontSize: 13,
    fontWeight: 850,
  },
  feriadoBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: WARN_BG,
    border: `1px solid ${WARN_BORDER}`,
    color: "#92400E",
    borderRadius: 8,
    padding: "3px 9px",
    fontSize: 11.5,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  noFeriado: {
    color: SLATE,
    fontSize: 13,
  },
  detailDate: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  approveAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 10,
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: ACCENT,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  mbGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
    justifyContent: "center",
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
  actionGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  processedRow: {
    background: "rgba(8,159,138,0.05)",
  },
  processedBadge: {
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
  processedBadgeReject: {
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
  approveBtn: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    border: `1px solid ${ACCENT}`,
    background: ACCENT_SOFT,
    color: ACCENT,
    cursor: "pointer",
    padding: 0,
  },
  rejectBtn: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    border: `1px solid ${DANGER_BORDER}`,
    background: DANGER_BG,
    color: DANGER,
    cursor: "pointer",
    padding: 0,
  },
};
