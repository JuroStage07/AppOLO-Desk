import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Database, RefreshCw } from "lucide-react";

const T = {
  accent: "#089F8A",
  accentSoft: "rgba(8, 159, 138, 0.10)",
  accentGlow: "rgba(8, 159, 138, 0.28)",
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E5E9F0",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const modules = [
  {
    key: "update-supabase",
    title: "Update AppOLO Supabase",
    desc: "Sincronización y actualización de datos hacia Supabase.",
    icon: <Database size={20} strokeWidth={2} />,
    path: "/dev/update-supabase",
  },
];

export default function DevHub() {
  const nav = useNavigate();

  return (
    <div style={styles.shell}>
      {/* Header */}
      <header style={styles.header}>
        <button
          type="button"
          onClick={() => nav("/areas")}
          style={styles.backBtn}
          aria-label="Volver a áreas"
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div>
          <h1 style={styles.title}>Dev Hub</h1>
          <p style={styles.subtitle}>Herramientas exclusivas para desarrolladores</p>
        </div>
      </header>

      {/* Modules grid */}
      <main style={styles.main}>
        <div style={styles.grid}>
          {modules.map((m) => (
            <div
              key={m.key}
              role="button"
              tabIndex={0}
              onClick={() => nav(m.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") nav(m.path);
              }}
              style={styles.card}
            >
              <div style={styles.cardIcon}>{m.icon}</div>
              <div style={styles.cardBody}>
                <h3 style={styles.cardTitle}>{m.title}</h3>
                <p style={styles.cardDesc}>{m.desc}</p>
              </div>
              <RefreshCw size={16} strokeWidth={2} color={T.textMuted} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: T.bg,
    fontFamily: T.font,
    color: T.text,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "24px 24px 16px",
    maxWidth: 900,
    margin: "0 auto",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.text,
    flexShrink: 0,
    fontFamily: "inherit",
    padding: 0,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 850,
    letterSpacing: -0.4,
    lineHeight: 1.2,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    color: T.textSecondary,
    marginTop: 2,
  },
  main: {
    padding: "0 24px 48px",
    maxWidth: 900,
    margin: "0 auto",
  },
  grid: {
    display: "grid",
    gap: 12,
    marginTop: 16,
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 18px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: T.shadow,
    transition: "border-color 180ms ease, transform 180ms ease",
    outline: "none",
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 750,
    color: T.text,
    lineHeight: 1.3,
  },
  cardDesc: {
    margin: 0,
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    marginTop: 2,
    lineHeight: 1.4,
  },
};
