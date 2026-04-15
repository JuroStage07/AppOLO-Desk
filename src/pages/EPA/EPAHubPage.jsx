import React from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { ArrowLeft, ArrowRight, ClipboardList, User } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";
import imgEpa from "../../assets/epalogo.jpeg";

const ACCENT = "#089F8A";
const SLATE = "#64748B";

const MODULES = [
  {
    key: "aperturas-finalizadas",
    title: "Aperturas finalizadas",
    desc: "Historial de aperturas cerradas o completadas para consulta y seguimiento.",
    path: "/epa/aperturas-finalizadas",
    icon: ClipboardList,
  },
];

export default function EPAHubPage() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const isMobile = useIsMobile();

  return (
    <div style={{ ...ui.shell, ...(isMobile ? ui.mShell : {}) }}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div style={ui.brand}>
            <div style={ui.brandMark}>
              <img src={imgEpa} alt="" style={ui.brandImg} />
            </div>
            <div>
              <div style={ui.brandTitle}>EPA</div>
              <div style={ui.brandSub}>Elegí un módulo para continuar</div>
            </div>
          </div>

          <div style={ui.topbarRight}>
            <div style={ui.userBox}>
              <div style={ui.userAvatar}>
                <User size={16} strokeWidth={2.2} />
              </div>
              <div>
                <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
                <div style={ui.userMail}>{user?.email || "—"}</div>
              </div>
            </div>

            <button type="button" onClick={() => nav("/")} style={ui.btnGhost}>
              <span style={ui.btnInlineIcon}>
                <ArrowLeft size={16} />
                Inicio
              </span>
            </button>
          </div>
        </div>
      </header>

      <main style={ui.main}>
        <div style={ui.container}>
          <div style={ui.hero}>
            <div>
              <h1 style={ui.title}>Módulos EPA</h1>
              <p style={ui.subtitle}>
                Accedé al historial de aperturas finalizadas según tu tarea operativa.
              </p>
            </div>
          </div>

          <div style={{ ...ui.moduleGrid, ...(isMobile ? ui.mModuleGrid : {}) }}>
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => nav(m.path)}
                  style={ui.moduleCard}
                >
                  <div style={ui.moduleIconWrap}>
                    <Icon size={26} strokeWidth={2.2} color={ACCENT} />
                  </div>
                  <div style={ui.moduleBody}>
                    <div style={ui.moduleTitle}>{m.title}</div>
                    <div style={ui.moduleDesc}>{m.desc}</div>
                    <div style={ui.moduleFooter}>
                      <span style={ui.moduleCta}>
                        Abrir
                        <ArrowRight size={16} strokeWidth={2.5} />
                      </span>
                      <span style={ui.modulePath}>{m.path}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
  },
  mShell: {},
  topbar: {
    width: "100%",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
  },
  topbarInner: {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "12px 18px",
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "#eef2f6",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 12px 28px rgba(8,159,138,0.18)",
    overflow: "hidden",
    flexShrink: 0,
  },
  brandImg: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  brandTitle: { fontWeight: 950, fontSize: 14 },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },
  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 14,
    padding: "8px 12px",
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(8,159,138,0.12)",
    color: ACCENT,
  },
  userName: { fontWeight: 800, fontSize: 13 },
  userMail: { fontSize: 12, color: SLATE },
  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    fontFamily: "inherit",
  },
  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  main: {
    padding: "18px 16px 28px",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  hero: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    padding: 20,
  },
  title: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 28px)",
    fontWeight: 950,
  },
  subtitle: {
    margin: "8px 0 0",
    color: SLATE,
    fontWeight: 650,
    fontSize: 14,
    lineHeight: 1.45,
    maxWidth: 640,
  },
  moduleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
    alignItems: "stretch",
  },
  mModuleGrid: {
    gridTemplateColumns: "1fr",
  },
  moduleCard: {
    display: "flex",
    gap: 16,
    textAlign: "left",
    padding: 20,
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease",
  },
  moduleIconWrap: {
    flexShrink: 0,
    width: 52,
    height: 52,
    borderRadius: 16,
    background: "rgba(8,159,138,0.1)",
    display: "grid",
    placeItems: "center",
  },
  moduleBody: {
    minWidth: 0,
    display: "grid",
    gap: 8,
    flex: 1,
  },
  moduleTitle: {
    fontSize: 17,
    fontWeight: 950,
    color: "#0F172A",
  },
  moduleDesc: {
    fontSize: 13,
    color: SLATE,
    fontWeight: 650,
    lineHeight: 1.45,
  },
  moduleFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  moduleCta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 900,
    fontSize: 13,
    color: ACCENT,
  },
  modulePath: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: 700,
  },
};
