import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";
import { ACCENT } from "../styles/theme";

export default function RequireAuth({ children }) {
  const { user, profile, loading } = useContext(AuthCtx);
  const loc = useLocation();

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.topAccent} />
          <div style={styles.title}>AppoloDesk</div>
          <div style={styles.sub}>Verificando sesión…</div>

          <div style={styles.progress} aria-hidden="true">
            <div style={styles.bar} />
          </div>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return children;
}

const styles = {
  page: {
    height: "100dvh",
    width: "100vw",
    display: "grid",
    placeItems: "center",
    padding: 16,
    overflow: "hidden",
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(8,159,138,0.10), transparent 60%), #F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
  },

  card: {
    width: "min(420px, 100%)",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
    textAlign: "center",
  },

  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },

  title: { fontWeight: 980, fontSize: 16, color: "#0F172A" },

  sub: {
    marginTop: 6,
    fontWeight: 850,
    color: "#64748B",
    fontSize: 13,
  },

  progress: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#fff",
    overflow: "hidden",
  },

  bar: {
    height: "100%",
    width: "55%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.35) 70%, rgba(8,159,138,0) 100%)`,
    animation: "reqauth_slide 900ms ease-in-out infinite alternate",
  },
};

// Inyecta keyframes sin CSS externo
if (typeof document !== "undefined" && !document.getElementById("reqauth_kf")) {
  const s = document.createElement("style");
  s.id = "reqauth_kf";
  s.innerHTML = `
    @keyframes reqauth_slide {
      from { transform: translateX(-15%); }
      to { transform: translateX(55%); }
    }
  `;
  document.head.appendChild(s);
}