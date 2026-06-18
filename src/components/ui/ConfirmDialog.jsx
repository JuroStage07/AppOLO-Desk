import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, HelpCircle, Trash2, X } from "lucide-react";
import {
  TEXT,
  SLATE,
  BORDER,
  ACCENT,
  ACCENT_BORDER,
  DANGER,
  DANGER_BG,
  DANGER_BORDER,
  WARN_BG,
} from "../../styles/theme";

/**
 * Promise-based confirmation dialog — a drop-in, on-brand replacement for
 * window.confirm().
 *
 * Mount <ConfirmProvider> once near the app root, then:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Eliminar documento",
 *     message: "Esta acción no se puede deshacer.",
 *     confirmText: "Eliminar",
 *     tone: "danger",       // "danger" | "warning" | "default"
 *   });
 *   if (!ok) return;
 *
 * Passing a plain string is also supported: await confirm("¿Continuar?").
 */

const ConfirmCtx = createContext(null);

const TONES = {
  danger: { icon: Trash2, accent: DANGER, bg: DANGER_BG, border: DANGER_BORDER },
  warning: { icon: AlertTriangle, accent: "#92600A", bg: WARN_BG, border: "#FFE1A8" },
  default: { icon: HelpCircle, accent: ACCENT, bg: "#fff", border: BORDER },
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  const resolverRef = useRef(null);

  const close = useCallback(
    (result) => {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      setState(null);
      resolve?.(result);
    },
    []
  );

  const confirm = useCallback((opts) => {
    const normalized = typeof opts === "string" ? { message: opts } : opts || {};
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ opts: normalized });
    });
  }, []);

  const api = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      {state ? (
        <ConfirmModal
          opts={state.opts}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      ) : null}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (ctx) return ctx;
  // Fallback to native confirm when provider isn't mounted.
  return (opts) => {
    const msg = typeof opts === "string" ? opts : opts?.message || "¿Continuar?";
    return Promise.resolve(window.confirm(msg));
  };
}

function ConfirmModal({ opts, onCancel, onConfirm }) {
  const {
    title = "¿Confirmás esta acción?",
    message = "",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    tone = "default",
  } = opts;

  const tn = TONES[tone] || TONES.default;
  const Icon = tn.icon;
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div style={root}>
      <style>{keyframes}</style>
      <button type="button" aria-label="Cancelar" onClick={onCancel} style={backdrop} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{ ...card, animation: "appoloConfirmIn 200ms cubic-bezier(0.22,1,0.36,1)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={topClose}
          aria-label="Cerrar"
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        <div style={{ ...iconBadge, background: tn.bg, borderColor: tn.border, color: tn.accent }}>
          <Icon size={24} strokeWidth={2.2} />
        </div>

        <div style={titleStyle}>{title}</div>
        {message ? <div style={messageStyle}>{message}</div> : null}

        <div style={actions}>
          <button type="button" onClick={onCancel} style={ghostBtn}>
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              ...primaryBtn,
              ...(tone === "danger"
                ? { background: DANGER, borderColor: DANGER, boxShadow: "0 8px 22px rgba(185,28,28,0.22)" }
                : {}),
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

const root = {
  position: "fixed",
  inset: 0,
  zIndex: 30050,
  display: "grid",
  placeItems: "center",
  padding: 16,
};
const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  border: "none",
  cursor: "pointer",
};
const card = {
  position: "relative",
  width: "min(400px, 100%)",
  background: "#fff",
  borderRadius: 20,
  border: `1px solid ${BORDER}`,
  padding: "24px 22px 20px",
  boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const topClose = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 30,
  height: 30,
  borderRadius: 9,
  border: "none",
  background: "transparent",
  color: SLATE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};
const iconBadge = {
  width: 54,
  height: 54,
  borderRadius: 16,
  border: "1px solid",
  display: "grid",
  placeItems: "center",
  marginBottom: 2,
};
const titleStyle = {
  fontSize: 17,
  fontWeight: 900,
  color: TEXT,
  lineHeight: 1.25,
  letterSpacing: -0.2,
};
const messageStyle = {
  fontSize: 13.5,
  fontWeight: 650,
  color: SLATE,
  lineHeight: 1.5,
  maxWidth: 320,
};
const actions = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  width: "100%",
  marginTop: 12,
};
const ghostBtn = {
  padding: "11px 14px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  color: TEXT,
  fontWeight: 850,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: "inherit",
};
const primaryBtn = {
  padding: "11px 14px",
  borderRadius: 12,
  border: `1px solid ${ACCENT_BORDER}`,
  background: ACCENT,
  color: "#fff",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 22px rgba(8,159,138,0.20)",
};

const keyframes = `
@keyframes appoloConfirmIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`;

export default ConfirmProvider;
