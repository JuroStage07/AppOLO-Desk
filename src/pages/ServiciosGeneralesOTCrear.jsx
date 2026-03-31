import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  CircleCheck,
  Loader2,
  LogOut,
  Plus,
  User,
} from "lucide-react";
import { auth } from "../firebase";
import { NewOTModal } from "./Mantenimiento/OTs/NewOTModal";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function ServiciosGeneralesOTCrear() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [busyLogout, setBusyLogout] = useState(false);
  const [successModal, setSuccessModal] = useState({
    open: false,
    nroSolicitud: "",
    nombreOT: "",
  });

  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
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
    <div style={ui.scrollViewport}>
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
              <Plus size={20} strokeWidth={2.25} color="#fff" />
            </div>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <div style={ui.brandTitle}>Crear OT</div>
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
                <Loader2 size={16} style={{ animation: "sgotcSpin 0.7s linear infinite" }} />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
              Salir
            </button>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes sgotcSpin { to { transform: rotate(360deg); } }
      `}</style>

      <main style={ui.main}>
        <div style={ui.container}>
          <h1 style={ui.pageTitle}>Nueva solicitud de OT</h1>
          <p style={ui.pageLead}>
            Completá los campos y enviá la solicitud. Es el mismo alta que en
            Mantenimiento (Nueva OT).
          </p>
          <NewOTModal
            variant="page"
            open
            suppressSuccessAlert
            onClose={() => nav("/servicios-generales/ordenes-trabajo")}
            onCreate={(item) => {
              setSuccessModal({
                open: true,
                nroSolicitud: item.nroSolicitud || "",
                nombreOT: item.taskTitle || "",
              });
            }}
          />
        </div>
      </main>

      {successModal.open ? (
        <div
          style={ui.successBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sg-ot-success-title"
        >
          <div style={ui.successSheet} onClick={(e) => e.stopPropagation()}>
            <div style={ui.successIconWrap}>
              <CircleCheck size={36} strokeWidth={2.25} color={ACCENT} />
            </div>
            <div id="sg-ot-success-title" style={ui.successTitle}>
              Solicitud creada
            </div>
            <p style={ui.successBody}>
              La orden de trabajo se registró correctamente.
              {successModal.nroSolicitud ? (
                <>
                  {" "}
                  <span style={{ fontWeight: 800, color: "#0F172A" }}>
                    {successModal.nroSolicitud}
                  </span>
                </>
              ) : null}
              {successModal.nombreOT ? (
                <>
                  <br />
                  <span style={{ fontWeight: 700 }}>{successModal.nombreOT}</span>
                </>
              ) : null}
            </p>
            <button
              type="button"
              style={ui.successOk}
              onClick={() => {
                setSuccessModal({ open: false, nroSolicitud: "", nombreOT: "" });
                nav("/");
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

const ui = {
  /**
   * El `html/body/#root` del proyecto usa `height: 100%`, que fija la altura al
   * viewport y suele cortar el scroll del documento. Este contenedor `fixed`
   * con `overflow-y: auto` asegura scroll completo del formulario.
   */
  scrollViewport: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflowX: "hidden",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    background: "#F6F7FB",
    zIndex: 0,
  },
  shell: {
    minHeight: "100%",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "flex",
    flexDirection: "column",
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
    flex: "1 1 auto",
    width: "100%",
    boxSizing: "border-box",
    padding: "22px 16px 48px",
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
  successBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 20000,
    background: "rgba(15,23,42,0.5)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    boxSizing: "border-box",
  },
  successSheet: {
    width: "min(400px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 24px 48px rgba(15,23,42,0.2)",
    padding: "28px 24px 24px",
    display: "grid",
    gap: 14,
    justifyItems: "center",
    textAlign: "center",
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
  },
  successTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  successBody: {
    margin: 0,
    fontSize: 14,
    fontWeight: 650,
    color: SLATE,
    lineHeight: 1.5,
    maxWidth: 320,
  },
  successOk: {
    marginTop: 4,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    borderRadius: 14,
    padding: "12px 28px",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    minWidth: 160,
    boxShadow: "0 12px 24px rgba(8,159,138,0.25)",
  },
};
