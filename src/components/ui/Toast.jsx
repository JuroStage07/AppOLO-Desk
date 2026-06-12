import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import {
  TEXT,
  SLATE,
  BORDER,
  ACCENT,
  OK_BG,
  OK_BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  WARN_BG,
  WARN_BORDER,
} from "../../styles/theme";

/**
 * App-wide toast notifications. Replaces native alert() for non-blocking
 * success / error / info feedback.
 *
 * Mount <ToastProvider> once near the app root (it wraps the tree), then:
 *
 *   const toast = useToast();
 *   toast.success("Solicitud OT creada correctamente.");
 *   toast.error("No se pudo guardar.");
 *   toast.info("Sincronizando…");
 *   toast.show({ type: "success", title: "Listo", message: "…", duration: 6000 });
 *
 * Each call returns the toast id; dismiss manually with toast.dismiss(id).
 */

const ToastCtx = createContext(null);

const TONES = {
  success: {
    icon: CheckCircle2,
    bg: OK_BG,
    border: OK_BORDER,
    accent: "#1B7A3A",
  },
  error: {
    icon: XCircle,
    bg: DANGER_BG,
    border: DANGER_BORDER,
    accent: DANGER,
  },
  warning: {
    icon: AlertTriangle,
    bg: WARN_BG,
    border: WARN_BORDER,
    accent: "#92600A",
  },
  info: {
    icon: Info,
    bg: "#FFFFFF",
    border: BORDER,
    accent: ACCENT,
  },
};

let _seq = 0;
function nextId() {
  _seq += 1;
  return `t_${Date.now()}_${_seq}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((opts) => {
    const t =
      typeof opts === "string" ? { message: opts } : { ...(opts || {}) };
    const id = t.id || nextId();
    const toast = {
      id,
      type: t.type || "info",
      title: t.title || "",
      message: t.message || "",
      duration: t.duration == null ? 4200 : t.duration,
    };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, opts) => show({ ...opts, type: "success", message }),
      error: (message, opts) =>
        show({ duration: 6000, ...opts, type: "error", message }),
      warning: (message, opts) => show({ ...opts, type: "warning", message }),
      info: (message, opts) => show({ ...opts, type: "info", message }),
    }),
    [show, dismiss]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (ctx) return ctx;
  // Graceful fallback when provider isn't mounted (e.g. isolated tests).
  return {
    show: () => "",
    dismiss: () => {},
    success: (m) => console.info("[toast:success]", m),
    error: (m) => console.error("[toast:error]", m),
    warning: (m) => console.warn("[toast:warning]", m),
    info: (m) => console.info("[toast:info]", m),
  };
}

function ToastViewport({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={viewport} role="region" aria-label="Notificaciones">
      <style>{keyframes}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const tone = TONES[toast.type] || TONES.info;
  const Icon = tone.icon;
  const timer = useRef(null);
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 180);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (!toast.duration) return undefined;
    timer.current = window.setTimeout(close, toast.duration);
    return () => window.clearTimeout(timer.current);
  }, [toast.duration, close]);

  const pause = () => window.clearTimeout(timer.current);
  const resume = () => {
    if (!toast.duration) return;
    timer.current = window.setTimeout(close, 1800);
  };

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        ...itemStyle,
        background: tone.bg,
        borderColor: tone.border,
        animation: leaving
          ? "appoloToastOut 180ms ease forwards"
          : "appoloToastIn 220ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div style={{ ...iconWrap, color: tone.accent }}>
        <Icon size={20} strokeWidth={2.3} />
      </div>
      <div style={textWrap}>
        {toast.title ? <div style={titleStyle}>{toast.title}</div> : null}
        {toast.message ? (
          <div style={{ ...messageStyle, color: toast.title ? SLATE : TEXT }}>
            {toast.message}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={close}
        style={closeBtn}
        aria-label="Cerrar notificación"
      >
        <X size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

const viewport = {
  position: "fixed",
  top: "max(16px, env(safe-area-inset-top))",
  right: 16,
  left: "auto",
  zIndex: 30000,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: "min(390px, calc(100vw - 24px))",
  pointerEvents: "none",
};

const itemStyle = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 12px 12px 14px",
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  boxShadow: "0 14px 36px rgba(15,23,42,0.16)",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};

const iconWrap = { flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center" };
const textWrap = { flex: 1, minWidth: 0, display: "grid", gap: 2 };
const titleStyle = { fontWeight: 900, fontSize: 13.5, color: TEXT, lineHeight: 1.25 };
const messageStyle = {
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1.4,
  wordBreak: "break-word",
};
const closeBtn = {
  flexShrink: 0,
  width: 24,
  height: 24,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: SLATE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};

const keyframes = `
@keyframes appoloToastIn {
  from { opacity: 0; transform: translateX(16px) scale(0.98); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes appoloToastOut {
  from { opacity: 1; transform: translateX(0) scale(1); }
  to { opacity: 0; transform: translateX(16px) scale(0.98); }
}
`;

export default ToastProvider;
