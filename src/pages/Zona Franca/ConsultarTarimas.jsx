import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Loader2, Scale, Hash, CheckCircle2, AlertCircle } from "lucide-react";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
} from "../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8,159,138,0.10)";
const ACCENT_MID = "rgba(8,159,138,0.25)";
const SLATE = "#64748B";

export default function ConsultarTarimas() {
  const nav = useNavigate();

  const [numero, setNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  const buscar = async () => {
    if (!numero.trim()) { setError("Ingresá un número."); return; }
    setLoading(true);
    setError("");
    setResultado(null);
    try {
      const snap = await getDoc(doc(db, "pesajes", numero.trim()));
      if (snap.exists()) {
        setResultado(snap.data());
      } else {
        setError("No se encontró ningún registro con ese número.");
      }
    } catch {
      setError("Ocurrió un error al consultar. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") buscar(); };

  const formatFecha = (val) => {
    if (!val) return "—";
    if (val?.toDate) return val.toDate().toLocaleString("es-UY");
    if (typeof val === "string") return new Date(val).toLocaleString("es-UY");
    return "—";
  };

  const formatRegistradoPor = (r) => {
    if (!r) return "—";
    const email = String(r.registradoPorEmail || "").trim();
    const nombre = String(r.registradoPorNombre || "").trim();
    if (nombre && email) return `${nombre} (${email})`;
    if (email) return email;
    if (nombre) return nombre;
    const uid = String(r.registradoPorUid || "").trim();
    if (uid) return `UID: ${uid}`;
    return "—";
  };

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={Search}
          title="Consultar tarimas"
          subtitle="Búsqueda de registros"
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
              <Search size={28} strokeWidth={1.8} color={ACCENT} />
            </div>
            <div>
              <div style={ui.heroTitle}>Consultar registro de pesaje</div>
              <div style={ui.heroSub}>Ingresá el número de tarima para buscar su registro de peso.</div>
            </div>
          </div>

          {/* buscador */}
          <div style={ui.card}>
            <div style={ui.fieldBlock}>
              <label htmlFor="numero" style={ui.label}>Número de tarima</label>
              <div style={{ ...ui.inputWrap, ...(error ? ui.inputError : {}) }}>
                <Hash size={17} strokeWidth={2.2} color={SLATE} style={{ flexShrink: 0 }} />
                <input
                  id="numero"
                  type="text"
                  placeholder="Ej. TAR-001"
                  value={numero}
                  onChange={(e) => { setNumero(e.target.value); setError(""); setResultado(null); }}
                  onKeyDown={handleKeyDown}
                  style={ui.input}
                  autoComplete="off"
                />
              </div>
              {error && (
                <div style={ui.errorRow}>
                  <AlertCircle size={13} color="#DC2626" strokeWidth={2.5} />
                  <span style={ui.errorText}>{error}</span>
                </div>
              )}
            </div>

            <button type="button" onClick={buscar} disabled={loading} style={{ ...ui.primaryBtn, ...(loading ? ui.btnBusy : {}) }}>
              {loading
                ? <><Loader2 size={17} style={{ animation: "spin 0.8s linear infinite" }} /> Buscando…</>
                : <><Search size={17} strokeWidth={2.3} /> Buscar</>
              }
            </button>
          </div>

          {/* resultado */}
          {resultado && (
            <div style={ui.resultCard}>
              <div style={ui.resultHeader}>
                <div style={ui.resultBadge}>
                  <CheckCircle2 size={15} color={ACCENT} strokeWidth={2.5} />
                  <span style={ui.resultBadgeText}>Registro encontrado</span>
                </div>
              </div>

              <div style={ui.resultBody}>
                <div style={ui.resultIconCol}>
                  <div style={ui.resultIconWrap}>
                    <Scale size={28} strokeWidth={1.8} color={ACCENT} />
                  </div>
                </div>

                <div style={ui.resultInfoGrid}>
                  <div style={ui.resultItem}>
                    <span style={ui.resultLabel}>Número</span>
                    <span style={ui.resultValue}>{resultado.numero || "—"}</span>
                  </div>
                  <div style={ui.resultDivider} />
                  <div style={ui.resultItem}>
                    <span style={ui.resultLabel}>Peso</span>
                    <span style={ui.resultValueLarge}>
                      {resultado.peso ?? "—"}
                      <span style={ui.resultUnit}> {resultado.unidad || ""}</span>
                    </span>
                  </div>
                  <div style={ui.resultDivider} />
                  <div style={ui.resultDivider} />
                  <div style={ui.resultItem}>
                    <span style={ui.resultLabel}>Fecha de registro</span>
                    <span style={ui.resultValue}>{formatFecha(resultado.fechaRegistro)}</span>
                  </div>
                  <div style={ui.resultItem}>
                    <span style={ui.resultLabel}>Registrado por</span>
                    <span style={ui.resultValue}>{formatRegistradoPor(resultado)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </Container>
      </Main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
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
  errorRow: { display: "flex", alignItems: "center", gap: 6 },
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
  },
  btnBusy: { opacity: 0.65, cursor: "not-allowed" },

  /* resultado */
  resultCard: {
    background: "#fff",
    borderRadius: 20,
    border: `1.5px solid ${ACCENT_MID}`,
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(15,23,42,0.06)",
    animation: "fadeUp 0.22s ease",
  },
  resultHeader: {
    padding: "14px 20px",
    borderBottom: "1px solid #EEF1F7",
    background: ACCENT_SOFT,
  },
  resultBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  resultBadgeText: {
    fontSize: 13,
    fontWeight: 900,
    color: ACCENT,
  },
  resultBody: {
    display: "flex",
    gap: 0,
  },
  resultIconCol: {
    width: 80,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRight: "1px solid #EEF1F7",
    background: "#FAFBFE",
  },
  resultIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: ACCENT_SOFT,
    border: `1px solid ${ACCENT_MID}`,
    display: "grid",
    placeItems: "center",
  },
  resultInfoGrid: {
    flex: 1,
    padding: "18px 20px",
    display: "grid",
    gap: 0,
  },
  resultItem: {
    display: "grid",
    gap: 3,
    padding: "10px 0",
  },
  resultDivider: {
    height: 1,
    background: "#EEF1F7",
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: 900,
    color: "#0F172A",
  },
  resultValueLarge: {
    fontSize: 22,
    fontWeight: 980,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  resultUnit: {
    fontSize: 14,
    fontWeight: 700,
    color: SLATE,
  },
};
