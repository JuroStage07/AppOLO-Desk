import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CircleCheck, Plus } from "lucide-react";
import { auth } from "../../firebase";
import { NewOTModal } from "../Mantenimiento/OTs/NewOTModal";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

export default function ServiciosGeneralesOTCrear() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const [successModal, setSuccessModal] = useState({
    open: false,
    nroSolicitud: "",
    nombreOT: "",
  });

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={Plus}
          title="Crear OT"
          subtitle="Servicios generales"
          onClick={() => nav("/servicios-generales/ordenes-trabajo")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/servicios-generales/ordenes-trabajo")}>
            Órdenes de trabajo
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <h1 style={styles.pageTitle}>Nueva solicitud de OT</h1>
          <p style={styles.pageLead}>
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
        </Container>
      </Main>

      {successModal.open ? (
        <div
          style={styles.successBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sg-ot-success-title"
        >
          <div style={styles.successSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.successIconWrap}>
              <CircleCheck size={36} strokeWidth={2.25} color={ACCENT} />
            </div>
            <div id="sg-ot-success-title" style={styles.successTitle}>
              Solicitud creada
            </div>
            <p style={styles.successBody}>
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
              style={styles.successOk}
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
    </Shell>
  );
}

const styles = {
  pageTitle: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 30px)",
    fontWeight: 950,
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  pageLead: {
    margin: 0,
    maxWidth: 720,
    fontSize: 14,
    fontWeight: 650,
    color: SLATE,
    lineHeight: 1.5,
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
