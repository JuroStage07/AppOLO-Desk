import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, Save, Scale, X, Hash, ChevronDown, CheckCircle2 } from "lucide-react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
  useToast,
} from "../../components/ui";
import { ACCENT, SLATE, accentAlpha } from "../../styles/theme";

const ACCENT_SOFT = accentAlpha(0.1);
const ACCENT_MID = accentAlpha(0.25);
const WARN = "#D97706";
const WARN_SOFT = "rgba(217,119,6,0.12)";
const WARN_BORDER = "rgba(217,119,6,0.35)";

export default function RegistrarTarimas() {
  const nav = useNavigate();
  const toast = useToast();

  const focusPrimerError = () => {
    requestAnimationFrame(() =>
      document
        .querySelector('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  const [numero, setNumero] = useState("");
  const [peso, setPeso] = useState("");
  const [unidad, setUnidad] = useState("kg");
  const [errores, setErrores] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  /** Ya existe doc en Firestore para este número (incluye tras salir y volver a la página) */
  const [duplicadoExistenteEnDb, setDuplicadoExistenteEnDb] = useState(false);
  const [checkingDuplicado, setCheckingDuplicado] = useState(false);

  const unidadesPeso = useMemo(() => [
    { value: "kg", label: "Kilogramos (kg)" },
    { value: "g",  label: "Gramos (g)" },
    { value: "lb", label: "Libras (lb)" },
    { value: "oz", label: "Onzas (oz)" },
    { value: "t",  label: "Toneladas (t)" },
  ], []);

  useEffect(() => {
    document.body.style.overflow = showModal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal]);

  const esNumeroDuplicado = duplicadoExistenteEnDb;

  const abrirModal = async () => {
    const e = {};
    if (!numero.trim()) e.numero = "Ingresá un número.";
    if (Object.keys(e).length) {
      setErrores(e);
      focusPrimerError();
      toast.warning("Revisá los campos marcados.");
      return;
    }
    setErrores({});
    setSaveError("");

    const id = numero.trim();
    setCheckingDuplicado(true);
    setDuplicadoExistenteEnDb(false);
    try {
      const snap = await getDoc(doc(db, "pesajes", id));
      setDuplicadoExistenteEnDb(snap.exists());
      setShowModal(true);
    } catch (err) {
      console.error(err);
      setErrores({
        numero: "No se pudo verificar si el número ya existe. Revisá la conexión e intentá de nuevo.",
      });
    } finally {
      setCheckingDuplicado(false);
    }
  };

  const cerrarModal = () => {
    setShowModal(false);
    setPeso("");
    setUnidad("kg");
    setErrores({});
    setSaveError("");
    setDuplicadoExistenteEnDb(false);
  };

  const guardar = async () => {
    const e = {};
    if (!numero.trim()) e.numero = "Ingresá un número.";
    const pesoNum = Number(peso);
    if (!peso.trim() || !Number.isFinite(pesoNum) || pesoNum <= 0) {
      e.peso = "Ingresá un peso válido mayor a 0.";
    }
    if (!unidad) e.unidad = "Seleccioná una unidad.";
    if (Object.keys(e).length) {
      setErrores(e);
      focusPrimerError();
      toast.warning("Revisá los campos marcados.");
      return;
    }

    const id = numero.trim();
    setSaveError("");

    const user = auth.currentUser;
    if (!user) {
      setSaveError("No hay sesión activa. Volvé a iniciar sesión e intentá de nuevo.");
      return;
    }

    setSaveBusy(true);
    try {
      await setDoc(
        doc(db, "pesajes", id),
        {
          numero: id,
          peso: pesoNum,
          unidad,
          fechaRegistro: serverTimestamp(),
          registradoPorUid: user.uid,
          registradoPorEmail: user.email || "",
          registradoPorNombre: user.displayName || "",
        },
        { merge: true }
      );

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setNumero("");
        setPeso("");
        setUnidad("kg");
        setErrores({});
        setDuplicadoExistenteEnDb(false);
        setShowModal(false);
      }, 1400);
    } catch (err) {
      console.error(err);
      setSaveError(
        "No se pudo guardar el registro. Revisá tu conexión o los permisos de Firestore."
      );
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={Scale}
          title="Registrar tarimas"
          subtitle="Nuevo registro de pesaje"
          onClick={() => nav("/servicios-generales/pesaje-tarimas")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/servicios-generales/pesaje-tarimas")}>
            Pesaje tarimas
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container max={560}>

          {/* hero */}
          <div style={ui.hero}>
            <div style={ui.heroIcon}>
              <Scale size={28} strokeWidth={1.8} color={ACCENT} />
            </div>
            <div>
              <div style={ui.heroTitle}>Registrar pesaje de tarima</div>
              <div style={ui.heroSub}>Ingresá el número de referencia y luego cargá el peso correspondiente.</div>
            </div>
          </div>

          {/* form */}
          <div style={ui.card}>
            <div style={ui.fieldBlock}>
              <label htmlFor="numero" style={ui.label}>Número de tarima</label>
              <div style={{ ...ui.inputWrap, ...(errores.numero ? ui.inputError : {}) }}>
                <Hash size={17} strokeWidth={2.2} color={SLATE} style={{ flexShrink: 0 }} />
                <input
                  id="numero"
                  type="text"
                  data-invalid={errores.numero ? "true" : undefined}
                  placeholder="Ej. TAR-001"
                  value={numero}
                  onChange={(e) => {
                    setNumero(e.target.value);
                    setErrores((p) => ({ ...p, numero: "" }));
                    setDuplicadoExistenteEnDb(false);
                  }}
                  style={ui.input}
                />
              </div>
              {errores.numero && <span style={ui.errorText}>{errores.numero}</span>}
            </div>

            <button
              type="button"
              onClick={abrirModal}
              disabled={checkingDuplicado}
              style={{ ...ui.primaryBtn, ...(checkingDuplicado ? ui.primaryBtnBusy : {}) }}
            >
              {checkingDuplicado ? (
                <><Loader2 size={17} style={{ animation: "spin 0.75s linear infinite" }} /> Verificando…</>
              ) : (
                <><Scale size={17} strokeWidth={2.3} /> Ingresar peso</>
              )}
            </button>
          </div>

        </Container>
      </Main>

      {/* modal */}
      {showModal && (
        <div style={ui.overlay} onClick={cerrarModal}>
          <div style={ui.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">

            <div style={ui.modalHeader}>
              <div>
                <div style={ui.modalKicker}>Pesaje</div>
                <div style={ui.modalTitle}>Registrar peso</div>
              </div>
              <button type="button" onClick={cerrarModal} style={ui.closeBtn} aria-label="Cerrar">
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>

            <div style={ui.modalBody}>
              {/* resumen número */}
              <div style={ui.resumeBox}>
                <span style={ui.resumeLabel}>Número de tarima</span>
                <span style={ui.resumeValue}>{numero}</span>
              </div>

              {esNumeroDuplicado && !saved && (
                <div style={ui.warnBanner} role="status">
                  <AlertTriangle size={18} strokeWidth={2.3} color={WARN} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={ui.warnBannerText}>
                    <span style={ui.warnBannerTitle}>Número ya registrado</span>
                    <span style={ui.warnBannerSub}>
                      Ya existe un registro guardado con este número. Si guardás de nuevo, se actualizará el peso
                      existente. Verificá que sea correcto.
                    </span>
                  </div>
                </div>
              )}

              {/* peso */}
              <div style={ui.fieldBlock}>
                <label htmlFor="peso" style={ui.label}>Peso</label>
                <div style={{ ...ui.inputWrap, ...(errores.peso ? ui.inputError : {}) }}>
                  <Scale size={17} strokeWidth={2.2} color={SLATE} style={{ flexShrink: 0 }} />
                  <input
                    id="peso"
                    type="number"
                    min="0"
                    step="0.01"
                    data-invalid={errores.peso ? "true" : undefined}
                    placeholder="Ej. 25.5"
                    value={peso}
                    onChange={(e) => { setPeso(e.target.value); setErrores((p) => ({ ...p, peso: "" })); }}
                    style={ui.input}
                  />
                </div>
                {errores.peso && <span style={ui.errorText}>{errores.peso}</span>}
              </div>

              {/* unidad */}
              <div style={ui.fieldBlock}>
                <label htmlFor="unidad" style={ui.label}>Unidad de peso</label>
                <div style={{ ...ui.selectWrap, ...(errores.unidad ? ui.inputError : {}) }}>
                  <select
                    id="unidad"
                    data-invalid={errores.unidad ? "true" : undefined}
                    value={unidad}
                    onChange={(e) => {
                      setUnidad(e.target.value);
                      setErrores((p) => ({ ...p, unidad: "" }));
                    }}
                    style={ui.select}
                  >
                    {unidadesPeso.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={17} strokeWidth={2.3} color={SLATE} style={{ flexShrink: 0, pointerEvents: "none" }} />
                </div>
                {errores.unidad && <span style={ui.errorText}>{errores.unidad}</span>}
              </div>
            </div>

            {saveError && (
              <div style={ui.modalErrorBanner} role="alert">
                {saveError}
              </div>
            )}

            <div style={ui.modalFooter}>
              <button type="button" onClick={cerrarModal} disabled={saveBusy} style={{ ...ui.ghostBtn, ...(saveBusy ? ui.btnDisabled : {}) }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={saveBusy || saved}
                style={{
                  ...ui.primaryBtn,
                  ...(saved ? ui.savedBtn : {}),
                  ...((saveBusy || saved) ? ui.btnDisabledPrimary : {}),
                }}
              >
                {saved ? (
                  <><CheckCircle2 size={17} strokeWidth={2.4} /> Guardado</>
                ) : saveBusy ? (
                  <><Loader2 size={17} style={{ animation: "spin 0.75s linear infinite" }} /> Guardando…</>
                ) : (
                  <><Save size={17} strokeWidth={2.3} /> Guardar registro</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </Shell>
  );
}

const ui = {
  hero: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E5EF",
    padding: "20px 22px",
    boxShadow: "0 4px 20px rgba(15,23,42,0.05)",
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    background: ACCENT_SOFT,
    border: `1.5px solid ${ACCENT_MID}`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  heroTitle: { fontWeight: 980, fontSize: 17, color: "#0F172A", letterSpacing: -0.2 },
  heroSub: { fontWeight: 700, fontSize: 13, color: SLATE, marginTop: 4, lineHeight: 1.5 },
  card: {
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E5EF",
    padding: "24px 22px",
    display: "grid",
    gap: 18,
    boxShadow: "0 4px 20px rgba(15,23,42,0.05)",
  },
  fieldBlock: { display: "grid", gap: 8 },
  label: { fontSize: 13, fontWeight: 900, color: "#0F172A" },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    height: 50,
    borderRadius: 14,
    border: "1.5px solid #DCE3EE",
    background: "#FAFBFE",
  },
  inputError: {
    borderColor: "#DC2626",
    boxShadow: "0 0 0 3px rgba(220,38,38,0.08)",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    fontFamily: "inherit",
  },
  selectWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    height: 50,
    borderRadius: 14,
    border: "1.5px solid #DCE3EE",
    background: "#FAFBFE",
  },
  select: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    fontFamily: "inherit",
    appearance: "none",
    cursor: "pointer",
  },
  errorText: { fontSize: 12, fontWeight: 800, color: "#DC2626" },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    padding: "0 22px",
    borderRadius: 14,
    border: "none",
    background: ACCENT,
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 6px 18px ${ACCENT_MID}`,
    transition: "background 200ms",
  },
  primaryBtnBusy: {
    opacity: 0.85,
    cursor: "wait",
  },
  savedBtn: {
    background: "#16A34A",
    boxShadow: "0 6px 18px rgba(22,163,74,0.25)",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    padding: "0 20px",
    borderRadius: 14,
    border: "1.5px solid #DCE3EE",
    background: "#fff",
    color: "#334155",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  /* modal */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,14,26,0.45)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    zIndex: 100,
  },
  modal: {
    width: "100%",
    maxWidth: 500,
    background: "#fff",
    borderRadius: 24,
    border: "1px solid #E2E5EF",
    boxShadow: "0 28px 60px rgba(15,23,42,0.20)",
    overflow: "hidden",
    animation: "fadeUp 0.2s ease",
  },
  modalHeader: {
    padding: "20px 22px 16px",
    borderBottom: "1px solid #EEF1F7",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: 980, color: "#0F172A", letterSpacing: -0.3 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    border: "1.5px solid #E2E5EF",
    background: "#F8F9FC",
    color: SLATE,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontFamily: "inherit",
  },
  modalBody: {
    padding: "20px 22px",
    display: "grid",
    gap: 16,
  },
  resumeBox: {
    padding: "14px 16px",
    borderRadius: 14,
    background: ACCENT_SOFT,
    border: `1px solid ${ACCENT_MID}`,
    display: "grid",
    gap: 4,
  },
  resumeLabel: { fontSize: 11, fontWeight: 800, color: SLATE, textTransform: "uppercase", letterSpacing: 0.3 },
  resumeValue: { fontSize: 20, fontWeight: 980, color: "#0F172A", letterSpacing: -0.2 },
  warnBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 14,
    background: WARN_SOFT,
    border: `1px solid ${WARN_BORDER}`,
  },
  warnBannerText: { display: "grid", gap: 4, minWidth: 0 },
  warnBannerTitle: { fontSize: 13, fontWeight: 950, color: "#92400E" },
  warnBannerSub: { fontSize: 12, fontWeight: 700, color: "#A16207", lineHeight: 1.45 },
  modalErrorBanner: {
    margin: "0 22px 0",
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.08)",
    border: "1px solid rgba(220,38,38,0.25)",
    fontSize: 13,
    fontWeight: 750,
    color: "#B91C1C",
    lineHeight: 1.45,
  },
  modalFooter: {
    padding: "16px 22px 20px",
    borderTop: "1px solid #EEF1F7",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  btnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    pointerEvents: "none",
  },
  btnDisabledPrimary: {
    opacity: 0.75,
    cursor: "not-allowed",
  },
};
