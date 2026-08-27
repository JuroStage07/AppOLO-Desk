import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, ChevronRight, Inbox, X } from "lucide-react";

import useNotifications from "../../hooks/useNotifications";
import { ErrorState, Spinner } from "../ui";
import {
  ACCENT,
  BORDER,
  BORDER_SOFT,
  DANGER,
  FONT_STACK,
  MUTED,
  RADIUS,
  RADIUS_LG,
  RADIUS_PILL,
  SHADOW_CARD,
  SLATE,
  SURFACE,
  SURFACE_ALT,
  SURFACE_SOFT,
  TEXT,
  withAlpha,
} from "../../styles/theme";
import { entityMeta, notificationMeta, relativeTimeEs } from "./notificationMeta";

const PANEL_WIDTH = 380;
const SHADOW_LG = "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)";
/** Máximo de entidades listadas dentro de una notificación agrupada. */
const MAX_LINKED_ENTITIES = 8;

/**
 * Entidades enlazadas por una notificación agrupada (p. ej. el resumen mensual
 * de mantenimientos, que referencia varias OTs en `metadata.ots`).
 * Genérico: cualquier módulo puede publicar `metadata.items` con la misma forma.
 */
function linkedEntities(notification) {
  const meta = notification?.metadata || {};
  const raw = Array.isArray(meta.ots)
    ? meta.ots
    : Array.isArray(meta.items)
      ? meta.items
      : [];

  return raw
    .map((item) => ({
      id: String(item?.id ?? ""),
      label: String(item?.nombreOT ?? item?.label ?? item?.title ?? "").trim(),
      hint: String(item?.scheduledDate ?? item?.hint ?? "").trim(),
      path: item?.actionPath || (item?.id ? `/mantenimiento/ots-solicitud/${item.id}` : ""),
    }))
    .filter((item) => item.label || item.id);
}

function NotificationRow({ notification, onOpen, onToggleRead, nowMs }) {
  const [expanded, setExpanded] = useState(false);
  const meta = notificationMeta(notification.type);
  const Icon = meta.icon;
  const entity = entityMeta(notification.entityType);
  const EntityIcon = entity.icon;
  const entities = linkedEntities(notification);
  const unread = !notification.read;
  const canOpen = Boolean(notification.actionPath);

  return (
    <div
      style={{
        ...styles.row,
        background: unread ? withAlpha("#2563EB", 0.04) : "transparent",
      }}
    >
      <div style={styles.rowMain}>
        <span
          aria-hidden="true"
          style={{
            ...styles.rowIcon,
            background: withAlpha(meta.color, 0.12),
            color: meta.color,
            borderColor: withAlpha(meta.color, 0.28),
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>

        <div style={styles.rowBody}>
          <div style={styles.rowHead}>
            <span style={styles.rowTitle}>{notification.title || "Notificación"}</span>
            {unread ? (
              <span aria-label="No leída" title="No leída" style={styles.unreadDot} />
            ) : null}
          </div>

          {notification.message ? (
            <p style={styles.rowMessage}>{notification.message}</p>
          ) : null}

          <div style={styles.rowChips}>
            <span style={styles.sourceChip}>{meta.source}</span>
            {notification.entityType ? (
              <span style={styles.entityChip}>
                {EntityIcon ? <EntityIcon size={11} strokeWidth={2.4} /> : null}
                {entity.label}
              </span>
            ) : null}
            <span style={styles.rowTime}>
              {relativeTimeEs(notification.createdAtMs, nowMs)}
            </span>
          </div>

          {entities.length > 0 ? (
            <div style={styles.entitiesWrap}>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={styles.entitiesToggle}
                aria-expanded={expanded}
              >
                {expanded
                  ? "Ocultar detalle"
                  : `Ver ${entities.length} orden(es) involucrada(s)`}
              </button>

              {expanded ? (
                <ul style={styles.entitiesList}>
                  {entities.slice(0, MAX_LINKED_ENTITIES).map((item, index) => (
                    <li key={item.id || `${item.label}-${index}`}>
                      <button
                        type="button"
                        onClick={() => item.path && onOpen(notification, item.path)}
                        disabled={!item.path}
                        style={{
                          ...styles.entityItem,
                          cursor: item.path ? "pointer" : "default",
                        }}
                      >
                        <span style={styles.entityDot} />
                        <span style={styles.entityItemLabel}>{item.label || item.id}</span>
                        {item.hint ? (
                          <span style={styles.entityItemHint}>{item.hint}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {entities.length > MAX_LINKED_ENTITIES ? (
                    <li style={styles.entitiesMore}>
                      y {entities.length - MAX_LINKED_ENTITIES} más
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div style={styles.rowActions}>
        <button
          type="button"
          onClick={() => onToggleRead(notification)}
          style={styles.rowActionBtn}
          title={unread ? "Marcar como leída" : "Marcar como no leída"}
          aria-label={unread ? "Marcar como leída" : "Marcar como no leída"}
        >
          <Check size={14} strokeWidth={2.6} color={unread ? SLATE : ACCENT} />
        </button>

        {canOpen ? (
          <button
            type="button"
            onClick={() => onOpen(notification, notification.actionPath)}
            style={styles.rowActionBtn}
            title="Abrir"
            aria-label="Abrir"
          >
            <ChevronRight size={15} strokeWidth={2.6} color={SLATE} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Centro de Notificaciones de AppoloDesk.
 *
 * Componente autónomo y genérico: se monta con `<NotificationCenter />` en
 * cualquier barra superior y no conoce ningún módulo en particular. Lee de la
 * colección `notifications` (persistida, generada por backend), muestra el
 * contador de pendientes, permite marcar leído/no leído y navega a la entidad
 * relacionada usando el `actionPath` que trae cada notificación.
 *
 * Para sumar un módulo nuevo alcanza con emitir documentos con su `type` y
 * registrarlo en `notificationMeta.js`.
 */
export default function NotificationCenter({ max, align = "right" }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wrapRef = useRef(null);

  const { items, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(max ? { max } : undefined);

  // Refresca las fechas relativas mientras el panel está abierto. La puesta a
  // cero se hace en el handler de apertura (`togglePanel`), no acá.
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, [open]);

  const togglePanel = useCallback(() => {
    setNowMs(Date.now());
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleOpen = useCallback(
    (notification, path) => {
      if (!notification.read) void markRead(notification.id, true);
      setOpen(false);
      if (path) nav(path);
    },
    [markRead, nav]
  );

  const handleToggleRead = useCallback(
    (notification) => {
      void markRead(notification.id, !notification.read);
    },
    [markRead]
  );

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={wrapRef} style={styles.wrap}>
      <button
        type="button"
        onClick={togglePanel}
        style={{
          ...styles.bellBtn,
          ...(open ? styles.bellBtnOpen : {}),
        }}
        title="Notificaciones"
        aria-label={
          unreadCount > 0
            ? `Notificaciones: ${unreadCount} sin leer`
            : "Notificaciones"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={16} strokeWidth={2.2} />
        {unreadCount > 0 ? (
          <span style={styles.badge} aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Centro de notificaciones"
          style={{
            ...styles.panel,
            ...(align === "left" ? { left: 0, right: "auto" } : {}),
          }}
        >
          <div style={styles.panelHead}>
            <div>
              <div style={styles.panelTitle}>Notificaciones</div>
              <div style={styles.panelSubtitle}>
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : "Estás al día"}
              </div>
            </div>

            <div style={styles.panelHeadActions}>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  style={styles.markAllBtn}
                  title="Marcar todas como leídas"
                >
                  <CheckCheck size={14} strokeWidth={2.4} />
                  Marcar todas
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={styles.closeBtn}
                aria-label="Cerrar notificaciones"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div style={styles.panelBody}>
            {loading ? (
              <div style={styles.stateWrap}>
                <Spinner size={22} label="Cargando notificaciones…" />
              </div>
            ) : error ? (
              <div style={{ padding: 12 }}>
                <ErrorState
                  title="No se pudieron cargar las notificaciones"
                  description={error}
                />
              </div>
            ) : items.length === 0 ? (
              <div style={styles.emptyWrap}>
                <span style={styles.emptyIcon}>
                  <Inbox size={24} strokeWidth={1.9} color={SLATE} />
                </span>
                <div style={styles.emptyTitle}>Sin notificaciones</div>
                <div style={styles.emptyDesc}>
                  Acá vas a ver los avisos de los módulos de AppoloDesk, como los
                  mantenimientos programados próximos a su fecha.
                </div>
              </div>
            ) : (
              items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={handleOpen}
                  onToggleRead={handleToggleRead}
                  nowMs={nowMs}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { position: "relative", display: "inline-flex", fontFamily: FONT_STACK },

  bellBtn: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: TEXT,
    padding: 0,
    fontFamily: "inherit",
  },
  bellBtnOpen: {
    borderColor: ACCENT,
    background: withAlpha(ACCENT, 0.08),
    color: ACCENT,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: RADIUS_PILL,
    background: DANGER,
    color: "#fff",
    fontSize: 10,
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    border: `2px solid ${SURFACE}`,
    lineHeight: 1,
  },

  panel: {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    width: PANEL_WIDTH,
    maxWidth: "calc(100vw - 24px)",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS_LG,
    boxShadow: SHADOW_LG,
    zIndex: 1200,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  panelHead: {
    padding: "14px 14px 12px",
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  panelTitle: { fontSize: 14, fontWeight: 900, color: TEXT, letterSpacing: -0.2 },
  panelSubtitle: { marginTop: 2, fontSize: 11, fontWeight: 800, color: SLATE },
  panelHeadActions: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  markAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 9px",
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    fontSize: 11,
    fontWeight: 850,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS,
    border: "none",
    background: SURFACE_ALT,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: SLATE,
    padding: 0,
    fontFamily: "inherit",
  },

  panelBody: { maxHeight: "min(460px, 64vh)", overflowY: "auto" },
  stateWrap: { padding: "18px 12px" },

  emptyWrap: {
    padding: "30px 22px",
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: 6,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: RADIUS_LG,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 13, fontWeight: 900, color: TEXT },
  emptyDesc: { fontSize: 12, fontWeight: 700, color: SLATE, lineHeight: 1.4, maxWidth: 260 },

  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    padding: "12px 12px",
    borderBottom: `1px solid ${BORDER_SOFT}`,
  },
  rowMain: { display: "flex", gap: 10, flex: 1, minWidth: 0 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS,
    border: "1px solid transparent",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  rowBody: { display: "grid", gap: 5, minWidth: 0 },
  rowHead: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 },
  rowTitle: {
    fontSize: 12.5,
    fontWeight: 900,
    color: TEXT,
    lineHeight: 1.3,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS_PILL,
    background: "#2563EB",
    flexShrink: 0,
  },
  rowMessage: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  rowChips: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 },
  sourceChip: {
    padding: "2px 7px",
    borderRadius: RADIUS_PILL,
    background: SURFACE_ALT,
    color: SLATE,
    fontSize: 10,
    fontWeight: 900,
  },
  entityChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 7px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${BORDER}`,
    color: SLATE,
    fontSize: 10,
    fontWeight: 850,
  },
  rowTime: { fontSize: 10, fontWeight: 800, color: MUTED, marginLeft: "auto" },

  entitiesWrap: { marginTop: 2, display: "grid", gap: 6 },
  entitiesToggle: {
    justifySelf: "start",
    border: "none",
    background: "transparent",
    padding: 0,
    color: ACCENT,
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  entitiesList: {
    listStyle: "none",
    margin: 0,
    padding: 8,
    display: "grid",
    gap: 2,
    borderRadius: RADIUS,
    background: SURFACE_SOFT,
    border: `1px solid ${BORDER}`,
    boxShadow: SHADOW_CARD,
  },
  entityItem: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 6px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    textAlign: "left",
    fontFamily: "inherit",
    minWidth: 0,
  },
  entityDot: {
    width: 5,
    height: 5,
    borderRadius: RADIUS_PILL,
    background: ACCENT,
    flexShrink: 0,
  },
  entityItemLabel: {
    fontSize: 11.5,
    fontWeight: 800,
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  entityItemHint: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: 800,
    color: MUTED,
    flexShrink: 0,
  },
  entitiesMore: { padding: "4px 6px", fontSize: 10, fontWeight: 800, color: MUTED },

  rowActions: { display: "grid", gap: 4, flexShrink: 0 },
  rowActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
  },
};
