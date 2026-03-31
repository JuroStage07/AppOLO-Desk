import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  LayoutGrid,
  Loader2,
  LogOut,
  User,
} from "lucide-react";
import { auth } from "../firebase";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function ServiciosGeneralesOTGestion() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [busyLogout, setBusyLogout] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  return (
    <div style={ui.shell}>
      <header style={ui.topbar}>
        <div style={ui.topbarInner}>
          <div style={ui.topbarLeft}>
            <button
              type="button"
              onClick={() => nav("/servicios-generales/ordenes-trabajo")}
              style={ui.backBtn}
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
              Órdenes de trabajo
            </button>
          </div>

          <div style={ui.brand}>
            <div style={ui.brandMark}>
              <LayoutGrid size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Gestión de OTs</div>
              <div style={ui.brandSub}>Servicios generales</div>
            </div>
          </div>

          <div style={ui.topbarRight}>
            <div style={ui.userBox}>
              <div style={ui.userAvatar}>
                <User size={16} strokeWidth={2.2} />
              </div>
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <div style={ui.userName}>{user?.displayName || "Usuario"}</div>
                <div style={ui.userMail}>{user?.email || "—"}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              disabled={busyLogout}
              style={ui.btnGhost}
            >
              {busyLogout ? (
                <Loader2 size={16} style={{ animation: "sgotgSpin 0.7s linear infinite" }} />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
              Salir
            </button>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes sgotgSpin { to { transform: rotate(360deg); } }
      `}</style>

      <main style={ui.main}>
        <div style={ui.container}>
          <h1 style={ui.pageTitle}>Gestión de órdenes de trabajo</h1>
          <p style={ui.pageLead}>
            Listados, filtros, estados y seguimiento de OT de Servicios generales.
            El tablero o listas se conectarán acá.
          </p>
          <div style={ui.placeholder}>
            <p style={ui.placeholderText}>Área en construcción.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },
  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    zIndex: 10,
  },
  topbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    padding: "12px 18px",
    minHeight: 64,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
  },
  topbarLeft: { display: "flex", justifyContent: "flex-start" },
  topbarRight: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifySelf: "center",
    minWidth: 0,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  brandTitle: {
    fontWeight: 950,
    fontSize: 15,
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },
  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 10px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    maxWidth: 260,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
    color: ACCENT,
    flexShrink: 0,
  },
  userName: {
    fontWeight: 900,
    fontSize: 12,
    color: "#0F172A",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userMail: {
    fontWeight: 700,
    fontSize: 11,
    color: SLATE,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "22px 16px 32px",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 16,
  },
  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 980,
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  pageLead: {
    margin: 0,
    maxWidth: 720,
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
    lineHeight: 1.45,
  },
  placeholder: {
    padding: 22,
    borderRadius: 18,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
  },
  placeholderText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#64748B",
  },
};
