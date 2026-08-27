import React, { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  LayoutGrid,
  Plus,
  RotateCcw,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../../config/permissions";
import { filterSolicitudesOtByScope } from "../../../utils/dataScope";
import {
  SCHEDULED_ALERT_WINDOWS,
  businessToday,
  daysUntilDeadline,
  deadlineLabel,
  isValidIsoDate,
} from "../../../utils/scheduledMaintenance";
import NewScheduledOTModal from "./NewScheduledOTModal";
import {
  Badge,
  Brand,
  Container,
  EmptyState,
  ErrorState,
  GhostButton,
  Hero,
  Main,
  PrimaryButton,
  Shell,
  Spinner,
  Topbar,
  useToast,
} from "../../../components/ui";
import {
  ACCENT,
  BORDER,
  MUTED,
  RADIUS,
  RADIUS_LG,
  RADIUS_PILL,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  SURFACE_SOFT,
  TEXT,
  withAlpha,
} from "../../../styles/theme";

const OT_STATE_SOLICITADA = "Solicitada";
const OT_STATE_FINALIZADA = "Finalizada";

const STATE_TONES = {
  Solicitada: "#94A3B8",
  "En proceso": "#F59E0B",
  "En revisión": "#2563EB",
  Finalizada: ACCENT,
};

function stateTone(state) {
  return STATE_TONES[state] || SLATE;
}

/** Chip de urgencia: rojo si vence hoy o ya venció, ámbar dentro de la semana. */
function urgencyColor(days) {
  if (days == null) return SLATE;
  if (days <= 0) return "#FF4D73";
  if (days <= 7) return "#F59E0B";
  return ACCENT;
}

function responsablesText(row) {
  const names = Array.isArray(row?.responsablesNombres) ? row.responsablesNombres : [];
  if (names.length > 0) return names.filter(Boolean).join(", ");
  return String(row?.responsableNombre || "").trim() || "—";
}

/**
 * Mantenimiento programado — alta y seguimiento.
 *
 * Card del hub de OTs. Las OTs creadas acá son OTs normales de `solicitudesOT`
 * con `scheduledMaintenance: true` y una fecha programada: nacen en «Tareas
 * Pendientes» y el job diario (`scheduledMaintenanceDailyCheck`) las pasa a
 * «OTs en Proceso» al llegar el deadline. El tablero y el detalle son los mismos.
 */
export default function ScheduledMaintenancePage() {
  const nav = useNavigate();
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || null;
  const role = authCtx?.role || "";
  const permisos = authCtx?.permisos || {};
  const authLoading = !!authCtx?.loading;

  const canAccess = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["mantenimiento"] }
  );

  const [snapshot, setSnapshot] = useState({ status: "idle", rows: [], error: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [reschedulingId, setReschedulingId] = useState("");

  const today = businessToday();

  useEffect(() => {
    if (authLoading) return;
    if (!canAccess) {
      toast.error("No tenés permisos para acceder a este módulo.");
      nav(-1);
    }
  }, [authLoading, canAccess, nav, toast]);

  useEffect(() => {
    if (authLoading || !canAccess) return undefined;

    // Una sola igualdad: la sirve el índice de campo simple. El orden por fecha
    // se hace en memoria para no exigir un índice compuesto extra.
    const q = query(
      collection(db, "solicitudesOT"),
      where("scheduledMaintenance", "==", true)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = filterSolicitudesOtByScope(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          profile?.tenantId,
          profile?.company,
          profile?.bodegaId
        ).sort((a, b) =>
          String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || ""))
        );
        setSnapshot({ status: "ready", rows, error: "" });
      },
      (err) => {
        console.error("ScheduledMaintenancePage:", err);
        setSnapshot({
          status: "error",
          rows: [],
          error:
            "No se pudieron cargar los mantenimientos programados. Revisá tu conexión o los permisos.",
        });
      }
    );

    return () => unsub();
  }, [
    authLoading,
    canAccess,
    profile?.tenantId,
    profile?.company,
    profile?.bodegaId,
  ]);

  /**
   * Reprogramación del deadline. Solo mientras la OT siga pendiente: una vez
   * activada usa el flujo normal y la fecha ya no cambia nada.
   * Los avisos del nuevo calendario se emiten con claves nuevas; los del
   * calendario anterior quedan como histórico (eran correctos al enviarse).
   */
  const handleReschedule = useCallback(
    async (row, nextDate) => {
      if (!isValidIsoDate(nextDate)) return;
      if (nextDate === row.scheduledDate) return;
      if (daysUntilDeadline(nextDate) < 0) {
        toast.warning("La fecha programada no puede estar en el pasado.");
        return;
      }

      try {
        setReschedulingId(row.id);
        await updateDoc(doc(db, "solicitudesOT", row.id), {
          scheduledDate: nextDate,
          updatedAt: serverTimestamp(),
        });
        toast.success(`Mantenimiento reprogramado para el ${nextDate}.`);
      } catch (err) {
        console.error("reprogramar OT:", err);
        toast.error(
          "No se pudo reprogramar. Revisá permisos y las reglas de Firestore."
        );
      } finally {
        setReschedulingId("");
      }
    },
    [toast]
  );

  if (!canAccess) return null;

  const { status, rows, error } = snapshot;
  const loading = authLoading || status === "idle";
  const pendientes = rows.filter((r) => r.OTState === OT_STATE_SOLICITADA).length;
  const delMes = rows.filter((r) =>
    String(r.scheduledDate || "").startsWith(today.slice(0, 7))
  ).length;

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={CalendarClock}
          title="Mantenimiento programado"
          subtitle="Órdenes de trabajo"
          onClick={() => nav("/mantenimiento/ots")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mantenimiento/ots")}>
            Órdenes de trabajo
          </GhostButton>
          <GhostButton
            icon={LayoutGrid}
            onClick={() => nav("/mantenimiento/OTsPage")}
          >
            Ver en el tablero
          </GhostButton>
          <PrimaryButton icon={Plus} onClick={() => setModalOpen(true)}>
            Nuevo programado
          </PrimaryButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Preventivo"
            title="Mantenimiento programado"
            subtitle="Creá la OT con su fecha, responsable y subtareas. Queda en «Tareas Pendientes» y el sistema la activa sola al llegar el deadline."
            badge={<Badge icon={CalendarClock}>Automático</Badge>}
          />

          <div style={styles.statsRow}>
            <div style={styles.stat}>
              <div style={styles.statValue}>{rows.length}</div>
              <div style={styles.statLabel}>Programados totales</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{pendientes}</div>
              <div style={styles.statLabel}>Esperando su fecha</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{delMes}</div>
              <div style={styles.statLabel}>Este mes</div>
            </div>
          </div>

          <div style={styles.noteBox}>
            Se avisa por notificación a {SCHEDULED_ALERT_WINDOWS.join(", ")} día(s)
            del deadline, más un resumen mensual. Reciben el aviso el creador, los
            responsables y el personal con permiso de mantenimiento.
          </div>

          {loading ? (
            <Spinner label="Cargando mantenimientos programados…" />
          ) : error ? (
            <ErrorState description={error} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              center
              title="Sin mantenimientos programados"
              description="Creá el primero para que el sistema lo active automáticamente en su fecha y avise a los responsables."
              action={
                <PrimaryButton icon={Plus} onClick={() => setModalOpen(true)}>
                  Nuevo programado
                </PrimaryButton>
              }
            />
          ) : (
            <div style={styles.list}>
              {rows.map((row) => {
                const days = daysUntilDeadline(row.scheduledDate);
                const tone = urgencyColor(days);
                const state = row.OTState || OT_STATE_SOLICITADA;
                const canReschedule =
                  state === OT_STATE_SOLICITADA && reschedulingId !== row.id;

                return (
                  <div key={row.id} style={styles.card}>
                    <div
                      aria-hidden="true"
                      style={{ ...styles.cardStripe, background: stateTone(state) }}
                    />

                    <div style={styles.cardMain}>
                      <div style={styles.cardHead}>
                        <button
                          type="button"
                          onClick={() => nav(`/mantenimiento/ots-solicitud/${row.id}`)}
                          style={styles.cardCode}
                          title="Ver detalle de la OT"
                        >
                          {row.NroSolicitud || row.id}
                        </button>

                        <span
                          style={{
                            ...styles.stateChip,
                            borderColor: withAlpha(stateTone(state), 0.4),
                            color: stateTone(state),
                            background: withAlpha(stateTone(state), 0.1),
                          }}
                        >
                          {state}
                        </span>

                        {state !== OT_STATE_FINALIZADA ? (
                          <span
                            style={{
                              ...styles.deadlineChip,
                              borderColor: withAlpha(tone, 0.4),
                              color: tone,
                              background: withAlpha(tone, 0.1),
                            }}
                          >
                            {deadlineLabel(row.scheduledDate) || "Sin fecha"}
                          </span>
                        ) : null}
                      </div>

                      <div style={styles.cardTitle}>{row.nombreOT || "Sin nombre"}</div>

                      <div style={styles.cardMetaRow}>
                        <span style={styles.metaItem}>
                          <CalendarClock size={13} strokeWidth={2.4} />
                          {row.scheduledDate || "—"}
                        </span>
                        <span style={styles.metaItem}>
                          <Users size={13} strokeWidth={2.4} />
                          {responsablesText(row)}
                        </span>
                        <span style={styles.metaItem}>
                          {row.departamento || "Sin departamento"}
                        </span>
                      </div>
                    </div>

                    <div style={styles.cardActions}>
                      {canReschedule ? (
                        <label style={styles.rescheduleWrap}>
                          <span style={styles.rescheduleLabel}>
                            <RotateCcw size={11} strokeWidth={2.6} /> Reprogramar
                          </span>
                          <input
                            type="date"
                            value={row.scheduledDate || ""}
                            min={today}
                            onChange={(e) => void handleReschedule(row, e.target.value)}
                            style={styles.rescheduleInput}
                          />
                        </label>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => nav(`/mantenimiento/ots-solicitud/${row.id}`)}
                        style={styles.openBtn}
                        title="Abrir detalle"
                        aria-label="Abrir detalle"
                      >
                        <ChevronRight size={17} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Container>
      </Main>

      <NewScheduledOTModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </Shell>
  );
}

const styles = {
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  stat: {
    padding: "14px 16px",
    borderRadius: RADIUS_LG,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    boxShadow: SHADOW_CARD,
  },
  statValue: { fontSize: 24, fontWeight: 950, color: TEXT, lineHeight: 1.1 },
  statLabel: { marginTop: 4, fontSize: 11.5, fontWeight: 850, color: SLATE },

  noteBox: {
    padding: "11px 13px",
    borderRadius: RADIUS,
    background: withAlpha(ACCENT, 0.06),
    border: `1px solid ${withAlpha(ACCENT, 0.22)}`,
    color: SLATE,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.45,
    marginBottom: 14,
  },

  list: { display: "grid", gap: 10 },
  card: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 14px 14px 18px",
    borderRadius: RADIUS_LG,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    boxShadow: SHADOW_CARD,
    overflow: "hidden",
  },
  cardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  cardMain: { display: "grid", gap: 7, flex: 1, minWidth: 0 },
  cardHead: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 },
  cardCode: {
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 11.5,
    fontWeight: 950,
    color: ACCENT,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.2,
  },
  stateChip: {
    padding: "2px 8px",
    borderRadius: RADIUS_PILL,
    border: "1px solid transparent",
    fontSize: 10.5,
    fontWeight: 900,
  },
  deadlineChip: {
    padding: "2px 8px",
    borderRadius: RADIUS_PILL,
    border: "1px solid transparent",
    fontSize: 10.5,
    fontWeight: 900,
  },
  cardTitle: { fontSize: 14, fontWeight: 950, color: TEXT, lineHeight: 1.25 },
  cardMetaRow: { display: "flex", flexWrap: "wrap", gap: 12 },
  metaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    fontWeight: 800,
    color: SLATE,
  },

  cardActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  rescheduleWrap: { display: "grid", gap: 3 },
  rescheduleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontWeight: 900,
    color: MUTED,
  },
  rescheduleInput: {
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
    padding: "6px 8px",
    fontSize: 11.5,
    fontWeight: 850,
    color: TEXT,
    fontFamily: "inherit",
    outline: "none",
  },
  openBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: SLATE,
    padding: 0,
    fontFamily: "inherit",
  },
};
