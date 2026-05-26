import { useEffect, useRef, useState, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { ArrowLeft, UserCheck, AlertCircle, CheckCircle2, User, ScanLine, ShieldX } from "lucide-react";
import { db } from "../../firebase";
import { AuthCtx } from "../../auth/AuthProvider";
import { isInUserScope } from "../../utils/dataScope";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8,159,138,0.12)";
const ACCENT_MID = "rgba(8,159,138,0.25)";
const SLATE = "#64748B";
const WARN = "#D97706";
const WARN_SOFT = "rgba(217,119,6,0.10)";
const DANGER = "#DC2626";
const DANGER_SOFT = "rgba(220,38,38,0.08)";
const DANGER_MID = "rgba(220,38,38,0.22)";

const COUNTDOWN_S = 5;

export default function ValidarIngreso() {
  const nav = useNavigate();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const inputRef = useRef(null);
  const lockRef = useRef(false);
  const countdownRef = useRef(null);

  const [cedula, setCedula] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [bloqueado, setBloqueado] = useState(null); // { nombre, cedula, empresa }

  /* ── foco permanente ── */
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    document.addEventListener("click", focus);
    return () => document.removeEventListener("click", focus);
  }, []);

  useEffect(() => {
    if (!resultado) inputRef.current?.focus();
  }, [resultado]);

  /* ── cuenta regresiva ── */
  useEffect(() => {
    if (!resultado) return;
    setCountdown(COUNTDOWN_S);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setResultado(null);
          setCedula("");
          setTimeout(() => inputRef.current?.focus(), 50);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [resultado]);

  /* ── firestore ── */
  const findUsuarioByCedula = async (val) => {
    const q = query(
      collection(db, "usuariosTerceros"),
      where("cedula", "==", String(val).trim()),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const tenantId = String(profile?.tenantId || "").trim();
    const company = String(profile?.company || "").trim();
    const row = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((it) => isInUserScope(it, tenantId, company));
    return row || null;
  };

  const procesarCedula = useCallback(async (raw) => {
    if (lockRef.current) return;
    const val = String(raw ?? "").trim();
    if (!val) return;

    lockRef.current = true;
    setBusy(true);
    setCedula("");
    clearInterval(countdownRef.current);
    setResultado(null);

    try {
      const usuario = await findUsuarioByCedula(val);
      if (usuario?.id) {
        if (usuario.usuarioBloqueado === true) {
          setBloqueado({
            nombre: String(usuario.nombre ?? "").trim(),
            cedula: String(usuario.cedula ?? val).trim(),
            empresa: String(usuario.empresa ?? "").trim(),
          });
        } else {
          setResultado({
            found: true,
            nombre: String(usuario.nombre ?? "").trim(),
            empresa: String(usuario.empresa ?? "").trim(),
            cedula: String(usuario.cedula ?? val).trim(),
            fotoURL: String(usuario.fotoURL ?? "").trim(),
            text: "",
          });
        }
      } else {
        setResultado({
          found: false,
          nombre: "", empresa: "", cedula: val, fotoURL: "",
          text: "Usuario no encontrado. Consulte a S.S.O para validar el ingreso.",
        });
      }
    } catch {
      setResultado({
        found: false,
        nombre: "", empresa: "", cedula: val, fotoURL: "",
        text: "Ocurrió un error al consultar la información.",
      });
    } finally {
      setBusy(false);
      setTimeout(() => { lockRef.current = false; inputRef.current?.focus(); }, 300);
    }
  }, []);

  const handleKeyDown = (e) => { if (e.key === "Enter") procesarCedula(cedula); };

  const cerrarBloqueado = () => {
    setBloqueado(null);
    setCedula("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const progressPct = (countdown / COUNTDOWN_S) * 100;

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={UserCheck}
          title="Validar ingreso"
          subtitle="Servicios generales"
          onClick={() => nav("/servicios-generales")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/servicios-generales")}>
            Servicios generales
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main center>
        <Container max={480}>

          {/* ── scan card ── */}
          <div style={ui.scanCard}>
            {/* icono grande */}
            <div style={ui.heroIcon}>
              <ScanLine size={32} strokeWidth={1.8} color={ACCENT} />
            </div>
            <div style={ui.scanTitle}>Validación de ingreso</div>
            <div style={ui.scanSub}>Escaneá el QR o ingresá la cédula y presioná Enter</div>

            {/* input */}
            <div style={ui.inputWrap}>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Cédula del colaborador…"
                disabled={busy}
                style={{ ...ui.input, ...(busy ? ui.inputBusy : {}) }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {busy
                ? <div style={ui.spinner} />
                : <ScanLine size={18} color={ACCENT} style={ui.inputIcon} />
              }
            </div>

            <div style={ui.statusRow}>
              <div style={{ ...ui.dot, background: busy ? WARN : ACCENT }} />
              <span style={ui.statusText}>
                {busy ? "Consultando base de datos…" : "Listo para escanear"}
              </span>
            </div>
          </div>

          {/* ── resultado ── */}
          {resultado && (
            <div style={{ ...ui.resultCard, ...(resultado.found ? ui.resultOk : ui.resultWarn) }}>

              {/* barra de progreso */}
              <div style={ui.progressTrack}>
                <div style={{
                  ...ui.progressBar,
                  width: `${progressPct}%`,
                  background: resultado.found ? ACCENT : WARN,
                  transition: countdown < COUNTDOWN_S ? "width 1s linear" : "none",
                }} />
              </div>

              {resultado.found ? (
                <div style={ui.foundLayout}>
                  {/* foto */}
                  <div style={ui.photoCol}>
                    {resultado.fotoURL ? (
                      <img src={resultado.fotoURL} alt="foto colaborador" style={ui.photo} />
                    ) : (
                      <div style={ui.photoFallback}>
                        <User size={52} color="#C4CAD8" strokeWidth={1.3} />
                      </div>
                    )}
                    <div style={ui.foundBadge}>
                      <CheckCircle2 size={13} color={ACCENT} strokeWidth={2.5} />
                      <span style={ui.foundBadgeText}>Validado</span>
                    </div>
                  </div>

                  {/* datos */}
                  <div style={ui.infoCol}>
                    <div style={ui.infoName}>{resultado.nombre || "—"}</div>
                    <div style={ui.infoEmpresa}>{resultado.empresa || "—"}</div>
                    <div style={ui.infoDivider} />
                    <div style={ui.infoRow}>
                      <span style={ui.infoLabel}>Cédula</span>
                      <span style={ui.infoVal}>{resultado.cedula || "—"}</span>
                    </div>
                    <div style={ui.countdownRow}>
                      <span style={ui.countdownLabel}>Cerrando en</span>
                      <span style={{ ...ui.countdownNum, color: ACCENT }}>{countdown}s</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={ui.notFoundLayout}>
                  <div style={ui.warnIconWrap}>
                    <AlertCircle size={28} color={WARN} strokeWidth={2} />
                  </div>
                  <div style={ui.warnTitle}>No encontrado</div>
                  <div style={ui.warnText}>{resultado.text}</div>
                  <div style={ui.countdownRow}>
                    <span style={ui.countdownLabel}>Cerrando en</span>
                    <span style={{ ...ui.countdownNum, color: WARN }}>{countdown}s</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </Container>
      </Main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* ── modal usuario bloqueado ── */}
      {bloqueado && (
        <div style={ui.modalOverlay}>
          <div style={ui.modalBox}>
            <div style={ui.modalIconWrap}>
              <ShieldX size={36} color={DANGER} strokeWidth={1.8} />
            </div>
            <div style={ui.modalTitle}>Acceso denegado</div>
            <div style={ui.modalName}>{bloqueado.nombre || bloqueado.cedula}</div>
            {bloqueado.empresa ? <div style={ui.modalEmpresa}>{bloqueado.empresa}</div> : null}
            <div style={ui.modalDivider} />
            <p style={ui.modalMsg}>
              Este usuario <strong>no puede ingresar</strong> a las instalaciones de OLO.
              Contacte con S.S.O para más detalles.
            </p>
            <button type="button" onClick={cerrarBloqueado} style={ui.modalBtn}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

const ui = {
  /* scan card */
  scanCard: {
    background: "#fff",
    borderRadius: 24,
    border: "1px solid #E2E5EF",
    padding: "32px 28px 24px",
    display: "grid",
    gap: 14,
    boxShadow: "0 4px 24px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)",
    textAlign: "center",
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    background: ACCENT_SOFT,
    border: `1.5px solid ${ACCENT_MID}`,
    display: "grid",
    placeItems: "center",
    margin: "0 auto",
  },
  scanTitle: {
    fontWeight: 980,
    fontSize: 20,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  scanSub: {
    fontWeight: 700,
    fontSize: 13,
    color: SLATE,
    lineHeight: 1.5,
    marginTop: -4,
  },

  /* input */
  inputWrap: { position: "relative" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "15px 48px 15px 18px",
    borderRadius: 16,
    border: `2px solid ${ACCENT_MID}`,
    background: "#F8FFFE",
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
    fontFamily: "inherit",
    outline: "none",
    letterSpacing: 2,
    textAlign: "center",
    boxShadow: `0 0 0 4px ${ACCENT_SOFT}`,
  },
  inputBusy: { opacity: 0.55, pointerEvents: "none" },
  inputIcon: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
  },
  spinner: {
    position: "absolute",
    right: 14,
    top: "50%",
    transform: "translateY(-50%)",
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: `2.5px solid ${ACCENT_SOFT}`,
    borderTopColor: ACCENT,
    animation: "spin 0.7s linear infinite",
  },

  /* status */
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 800,
    color: SLATE,
  },

  /* result card */
  resultCard: {
    borderRadius: 24,
    border: "1px solid #E2E5EF",
    overflow: "hidden",
    boxShadow: "0 4px 24px rgba(15,23,42,0.07)",
    animation: "fadeSlide 0.22s ease",
  },
  resultOk: {
    background: "#fff",
    borderColor: ACCENT_MID,
  },
  resultWarn: {
    background: "#fff",
    borderColor: "rgba(217,119,6,0.28)",
  },

  /* progress bar */
  progressTrack: {
    height: 4,
    background: "#EEF1F7",
    width: "100%",
  },
  progressBar: {
    height: "100%",
    borderRadius: 0,
  },

  /* found layout */
  foundLayout: {
    display: "flex",
    gap: 0,
    alignItems: "stretch",
  },
  photoCol: {
    width: 140,
    flexShrink: 0,
    background: ACCENT_SOFT,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "24px 16px",
    borderRight: `1px solid ${ACCENT_MID}`,
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 20,
    objectFit: "cover",
    border: `2px solid ${ACCENT_MID}`,
    background: "#EEF2F7",
  },
  photoFallback: {
    width: 88,
    height: 88,
    borderRadius: 20,
    border: "2px solid #DDE2EF",
    background: "#F2F4FB",
    display: "grid",
    placeItems: "center",
  },
  foundBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fff",
    border: `1px solid ${ACCENT_MID}`,
  },
  foundBadgeText: {
    fontSize: 11,
    fontWeight: 900,
    color: ACCENT,
  },

  infoCol: {
    flex: 1,
    padding: "22px 22px 18px",
    display: "grid",
    gap: 6,
    alignContent: "start",
  },
  infoName: {
    fontSize: 20,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  infoEmpresa: {
    fontSize: 13,
    fontWeight: 700,
    color: SLATE,
  },
  infoDivider: {
    height: 1,
    background: "#EEF1F7",
    margin: "4px 0",
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoVal: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0F172A",
  },
  countdownRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTop: "1px solid #EEF1F7",
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  countdownNum: {
    fontSize: 18,
    fontWeight: 980,
    letterSpacing: -0.5,
  },

  /* not found layout */
  notFoundLayout: {
    padding: "28px 24px 24px",
    display: "grid",
    gap: 8,
    textAlign: "center",
    justifyItems: "center",
  },
  warnIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    background: WARN_SOFT,
    border: "1.5px solid rgba(217,119,6,0.22)",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  warnTitle: {
    fontSize: 18,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  warnText: {
    fontSize: 13,
    fontWeight: 700,
    color: "#92400E",
    lineHeight: 1.55,
    maxWidth: 320,
  },

  /* modal bloqueado */
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,14,26,0.55)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    zIndex: 100,
    padding: 20,
  },
  modalBox: {
    background: "#fff",
    borderRadius: 26,
    border: `1.5px solid ${DANGER_MID}`,
    padding: "32px 28px 28px",
    maxWidth: 400,
    width: "100%",
    boxShadow: "0 24px 60px rgba(220,38,38,0.18), 0 4px 16px rgba(15,23,42,0.12)",
    display: "grid",
    gap: 10,
    textAlign: "center",
    justifyItems: "center",
    animation: "popIn 0.2s ease",
  },
  modalIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    background: DANGER_SOFT,
    border: `1.5px solid ${DANGER_MID}`,
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 980,
    color: DANGER,
    letterSpacing: -0.4,
  },
  modalName: {
    fontSize: 17,
    fontWeight: 900,
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  modalEmpresa: {
    fontSize: 13,
    fontWeight: 700,
    color: SLATE,
    marginTop: -4,
  },
  modalDivider: {
    height: 1,
    background: "#F1F3F9",
    width: "100%",
    margin: "4px 0",
  },
  modalMsg: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
    lineHeight: 1.6,
    maxWidth: 320,
  },
  modalBtn: {
    marginTop: 6,
    width: "100%",
    padding: "13px 0",
    borderRadius: 16,
    border: "none",
    background: DANGER,
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 14px rgba(220,38,38,0.30)",
  },
};
