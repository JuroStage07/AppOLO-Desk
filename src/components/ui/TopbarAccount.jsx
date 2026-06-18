import React, { useContext, useState } from "react";
import { signOut } from "firebase/auth";
import { LogOut, User, Loader2 } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE } from "../../styles/theme";

/**
 * Compact account strip rendered by <Topbar/> in the utility sub-bar: shows the
 * signed-in user and a one-click "Cerrar sesión" (with confirmation) so logout
 * is reachable from every inner page — not only the hub.
 */
export default function TopbarAccount() {
  const { user: ctxUser, profile } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const name =
    user.displayName || profile?.nombre || user.email?.split("@")[0] || "Usuario";
  const accountTitle = user.email ? `${name} · ${user.email}` : name;

  const logout = async () => {
    const ok = await confirm({
      title: "Cerrar sesión",
      message: "Vas a salir de AppoloDesk. ¿Continuar?",
      confirmText: "Cerrar sesión",
      tone: "warning",
    });
    if (!ok) return;
    try {
      setBusy(true);
      await signOut(auth);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cerrar la sesión. Intentá de nuevo.");
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <span style={avatar} title={accountTitle} aria-label={accountTitle}>
        <User size={13} strokeWidth={2.3} />
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        style={{ ...logoutBtn, ...(busy ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        {busy ? (
          <Loader2 size={14} strokeWidth={2.3} style={{ animation: "spin 0.8s linear infinite" }} />
        ) : (
          <LogOut size={14} strokeWidth={2.3} />
        )}
        <span style={logoutLabel}>Salir</span>
      </button>
    </div>
  );
}

const wrap = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};
const avatar = {
  width: 24,
  height: 24,
  borderRadius: 999,
  background: ACCENT_SOFT,
  color: ACCENT,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const logoutBtn = {
  height: 28,
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  cursor: "pointer",
  color: SLATE,
  fontFamily: "inherit",
  fontWeight: 750,
  fontSize: 12,
  flexShrink: 0,
};
const logoutLabel = { lineHeight: 1 };
