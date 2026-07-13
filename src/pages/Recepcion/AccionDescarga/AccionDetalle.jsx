// screens/AccionDetalle.jsx
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Truck } from "lucide-react";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { isInUserScope } from "../../../utils/dataScope";
import { Brand, Topbar, useToast, useConfirm } from "../../../components/ui";
import { ACCENT, ACCENT_SOFT, SLATE } from "../../../styles/theme";

/* ===================== Helpers ===================== */
const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.toMillis === "function") return new Date(value.toMillis());
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatDateTime = (value) => {
  const d = toDateSafe(value);
  if (!d) return "—";
  let s = d.toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  s = s.replace(/\u00A0/g, " ").trim();
  s = s
    .replace(/\bAM\b/i, "a. m.")
    .replace(/\bPM\b/i, "p. m.")
    .replace(/\ba\.m\.\b/i, "a. m.")
    .replace(/\bp\.m\.\b/i, "p. m.");
  s = s.replace(/(\b[a-záéíóúñ]{3,})\./gi, "$1");
  return s;
};

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const iniciarAccion = async (accionId, tipoDescarga, cantidadBultos) => {
  const ref = doc(db, "accion_descarga", accionId);
  await updateDoc(ref, {
    startedAt: Timestamp.now(),
    tipoDescarga,
    cantidadBultos: Number(cantidadBultos),
  });
};

const finalizarAccion = async (accionId) => {
  const ref = doc(db, "accion_descarga", accionId);
  await updateDoc(ref, { completedAt: serverTimestamp() });
};

const formatValue = (v) => {
  if (v == null) return "—";
  const d = toDateSafe(v);
  if (d) return formatDateTime(v);

  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";

  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    const preview = v.slice(0, 3).map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
    return v.length > 3 ? `[${preview.join(", ")} …] (${v.length})` : `[${preview.join(", ")}] (${v.length})`;
  }

  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 0) return "{}";
    const show = keys.slice(0, 4).map((k) => `${k}: ${typeof v[k] === "string" ? v[k] : ""}`.trim());
    return keys.length > 4 ? `{ ${show.join(", ")} … }` : `{ ${show.join(", ")} }`;
  }

  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

async function copyToClipboard(txt) {
  try {
    await navigator.clipboard.writeText(String(txt ?? ""));
    return true;
  } catch {
    return false;
  }
}

/* ===================== UI bits ===================== */
function EstadoChip({ label, tone }) {
  const toneStyle =
    tone === "success"
      ? ui.chipSuccess
      : tone === "warning"
      ? ui.chipWarning
      : tone === "danger"
      ? ui.chipDanger
      : ui.chipNeutral;

  const txtStyle =
    tone === "success"
      ? ui.chipTxtSuccess
      : tone === "warning"
      ? ui.chipTxtWarning
      : tone === "danger"
      ? ui.chipTxtDanger
      : ui.chipTxtNeutral;

  return (
    <span style={{ ...ui.chip, ...toneStyle }}>
      <span style={{ ...ui.chipTxt, ...txtStyle }}>{label}</span>
    </span>
  );
}

function Section({ title, subtitle, right, children }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={ui.sectionHeader}>
        <div style={{ flex: 1 }}>
          <div style={ui.sectionTitle}>{title}</div>
          {!!subtitle && <div style={ui.sectionSubtitle}>{subtitle}</div>}
        </div>
        {!!right && <div>{right}</div>}
      </div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono = false, onClick, rightHint }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => clickable && (e.key === "Enter" || e.key === " ") && onClick?.()}
      style={{ ...ui.row, ...(clickable ? ui.rowClickable : {}) }}
      title={clickable ? "Click para copiar" : undefined}
    >
      <div style={ui.rowLabel}>{label}</div>
      <div style={{ flex: 1, textAlign: "right" }}>
        <div style={{ ...ui.rowValue, ...(mono ? ui.mono : {}) }}>{value ?? "—"}</div>
        {!!rightHint && <div style={ui.rowHint}>{rightHint}</div>}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }) {
  return (
    <div style={ui.statPill}>
      <div style={ui.statIcon} aria-hidden="true">
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={ui.statLabel}>{label}</div>
        <div style={ui.statValue} title={String(value ?? "—")}>
          {value ?? "—"}
        </div>
      </div>
    </div>
  );
}

/* ===================== Screen ===================== */
export default function AccionDetalle() {
  const nav = useNavigate();
  const params = useParams();
  const authCtx = useContext(AuthCtx);
  const toast = useToast();
  const confirm = useConfirm();
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  // Ruta esperada: /recepcion/accion-descarga/:accionId
  const accionId = params?.accionId || null;

  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(null);
  const [err, setErr] = useState(null);

  const [detailsOpen, setDetailsOpen] = useState(false);

  // tipo de la apertura: preferimos el copiado en la acción; si falta, lo leemos de la apertura.
  const [aperturaTipo, setAperturaTipo] = useState(null);

  // Modal iniciar
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [tipoDescarga, setTipoDescarga] = useState("A granel");
  const [cantidadBultos, setCantidadBultos] = useState("");

  const ref = useMemo(() => (accionId ? doc(db, "accion_descarga", accionId) : null), [accionId]);

  const completedAtValue = accion?.completedAt ?? accion?.completeAt;
  const started = !!accion?.startedAt;
  const completed = !!completedAtValue;

  const proveedor = (accion?.proveedorNombre || "").trim() || "Sin proveedor";
  const anden = (accion?.idAnden || "").toString().trim() || "—";
  const nombre = (accion?.nombreAccion || "").trim() || `AC - ${proveedor} · Andén ${anden}`;

  const tipo = accion?.tipoDescarga || "—";
  const bultos = accion?.cantidadBultos != null ? String(accion.cantidadBultos) : "—";
  const tiempo = accion?.totalTimeTxt || "—";

  const canStart = !!accion && !started && !completed;
  const canFinish = !!accion && started && !completed;

  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prev;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!ref) {
      setLoading(false);
      setErr("Falta accionId");
      return;
    }

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setAccion(null);
          setErr("No existe la acción.");
        } else {
          const data = snap.data();
          if (!isInUserScope(data, profile?.tenantId, profile?.company, profile?.bodegaId)) {
            setAccion(null);
            setErr("No tenés acceso a esta acción.");
          } else {
            setAccion({ id: snap.id, ...data });
            setErr(null);
          }
        }
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setErr(e?.message || "Error leyendo acción.");
        setLoading(false);
      }
    );

    return () => unsub && unsub();
  }, [authLoading, ref, profile?.tenantId, profile?.company, profile?.bodegaId]);

  // Resuelve el tipo de la apertura: 1) el campo copiado en la acción;
  // 2) respaldo leyendo la apertura por aperturaId (aperturas → aperturasRecepcion).
  useEffect(() => {
    let cancel = false;
    setAperturaTipo(null);

    const own = (accion?.tipo ?? "").toString().trim();
    if (own) {
      setAperturaTipo(own);
      return;
    }

    const apId = accion?.aperturaId;
    if (!apId) return;

    (async () => {
      try {
        let snap = await getDoc(doc(db, "aperturas", String(apId)));
        if (!snap.exists()) {
          snap = await getDoc(doc(db, "aperturasRecepcion", String(apId)));
        }
        if (!cancel && snap.exists()) {
          const t = (snap.data()?.tipo ?? "").toString().trim();
          if (t) setAperturaTipo(t);
        }
      } catch (e) {
        console.error("No se pudo leer el tipo de la apertura:", e);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [accion?.id, accion?.tipo, accion?.aperturaId]);

  const refreshOnce = useCallback(async () => {
    try {
      if (!ref) return;
      setLoading(true);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setAccion(null);
        setErr("No existe la acción.");
      } else {
        const data = snap.data();
        if (!isInUserScope(data, profile?.tenantId, profile?.company, profile?.bodegaId)) {
          setAccion(null);
          setErr("No tenés acceso a esta acción.");
        } else {
          setAccion({ id: snap.id, ...data });
          setErr(null);
        }
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Error refrescando.");
    } finally {
      setLoading(false);
    }
  }, [ref, profile?.tenantId, profile?.company, profile?.bodegaId]);

  const estadoChip = useMemo(() => {
    const estado = accion?.estado;
    if (estado) return { label: String(estado), tone: "neutral" };

    const done = !!completedAtValue;
    if (done) return { label: "Completada", tone: "success" };
    if (!!accion?.startedAt) return { label: "En proceso", tone: "warning" };
    return { label: "Pendiente", tone: "neutral" };
  }, [accion, completedAtValue]);

  const orderedKeys = useMemo(() => {
    if (!accion) return [];
    const prefer = [
      "nombreAccion",
      "proveedorNombre",
      "idAnden",
      "aperturaId",
      "creadoPorNombre",
      "creadoPorUid",
      "creadoAt",
      "startedAt",
      "completedAt",
      "completeAt",
      "tipoDescarga",
      "cantidadBultos",
      "totalTimeTxt",
      "totalTimeMs",
    ];
    const keys = Object.keys(accion).filter((k) => k !== "id");
    const rest = keys.filter((k) => !prefer.includes(k)).sort((a, b) => a.localeCompare(b));
    return [...prefer.filter((k) => keys.includes(k)), ...rest];
  }, [accion]);

  const copiar = async (txt, label = "Copiado") => {
    window?.navigator?.vibrate?.(10);
    const ok = await copyToClipboard(txt);
    if (ok) toast.success(`${label}: listo`);
    else toast.error("No se pudo copiar");
  };

  const onStartPress = () => {
    if (started || completed) return;
    setTipoDescarga("A granel");
    setCantidadBultos("");
    setStartModalOpen(true);
  };

  const confirmStart = async () => {
    try {
      const n = Number(cantidadBultos);
      if (!Number.isFinite(n) || n <= 0) {
        toast.warning("Ingresá una cantidad de bultos válida (mayor a 0).");
        return;
      }
      await iniciarAccion(accion.id, tipoDescarga, n);
      setStartModalOpen(false);
      toast.success("Iniciado");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "No se pudo iniciar la descarga.");
    }
  };

  const confirmFinish = async () => {
    if (!accion?.id) return;
    const ok = await confirm({
      title: "Finalizar descarga",
      message: "¿Deseas finalizar esta descarga?",
      confirmText: "Finalizar",
      cancelText: "Cancelar",
      tone: "warning",
    });
    if (!ok) return;

    try {
      await finalizarAccion(accion.id);
      toast.success("Finalizada");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "No se pudo finalizar la descarga.");
    }
  };

  return (
    <div style={ui.shell}>
      <Topbar>
        <Brand
          icon={Truck}
          title="Acción de Descarga"
          subtitle="Detalle y control"
          onClick={() => nav(-1)}
        />
        <Topbar.Right>
          <button type="button" onClick={() => nav(-1)} style={ui.btnGhost} title="Volver">
            <span style={ui.btnInlineIcon}>
              <ArrowLeft size={16} strokeWidth={2.2} />
              Volver
            </span>
          </button>
        </Topbar.Right>
      </Topbar>

      <main style={ui.main}>
        <div style={ui.container}>
          {loading ? (
            <div style={ui.center}>
              <div style={ui.spinner} />
              <div style={ui.loadingText}>Cargando…</div>
            </div>
          ) : !accionId ? (
            <div style={ui.blockCard}>
              <div style={ui.blockTitle}>No se recibió accionId</div>
              <div style={ui.blockText}>Volvé a la lista y abrí de nuevo.</div>
            </div>
          ) : !accion ? (
            <div style={ui.blockCard}>
              <div style={ui.blockTitle}>No disponible</div>
              <div style={ui.blockText}>{err || "No se pudo cargar la acción."}</div>

              <button type="button" onClick={refreshOnce} style={{ ...ui.actionBtn, ...ui.primaryBtn }}>
                Reintentar
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14, paddingBottom: 24 }}>
              {/* HERO */}
              <div style={ui.heroCard}>
                <div style={ui.heroTop}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ui.heroTitle} title={nombre}>
                      {nombre}
                    </div>
                    <div style={ui.heroSub} title={`Proveedor: ${proveedor} · Andén: ${anden}`}>
                      Proveedor: {proveedor} · Andén: {anden}
                    </div>
                  </div>

                  <EstadoChip label={estadoChip.label} tone={estadoChip.tone} />
                </div>

                {/* ID copy */}
                <button type="button" onClick={() => copiar(accion.id, "ID Copiado")} style={ui.idCard}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={ui.idLabel}>ID</div>
                    <div style={ui.idValue} title={accion.id}>
                      {accion.id}
                    </div>
                  </div>
                  <div style={ui.idHint}>Copiar</div>
                </button>

                {/* Stats */}
                <div style={ui.statsGrid}>
                  <StatPill icon="◻︎" label="Tipo" value={tipo} />
                  <StatPill icon="📦" label="Bultos" value={bultos} />
                  <StatPill icon="⏱" label="Tiempo" value={tiempo} />
                </div>

                {/* Actions */}
                <div style={ui.actionsGrid}>
                  <button
                    type="button"
                    onClick={onStartPress}
                    disabled={!canStart}
                    style={{ ...ui.actionBtn, ...(canStart ? {} : ui.btnDisabled) }}
                  >
                    ▶ Iniciar
                  </button>

                  <button
                    type="button"
                    onClick={confirmFinish}
                    disabled={!canFinish}
                    style={{ ...ui.actionBtn, ...ui.primaryBtn, ...(canFinish ? {} : ui.btnDisabled) }}
                  >
                    ■ Finalizar
                  </button>

                  {!!accion?.aperturaId && (
                    <button
                      type="button"
                      onClick={() => nav(`/aperturas/${accion.aperturaId}`)} // ajustá ruta si aplica
                      style={ui.actionBtn}
                    >
                      📄 Ver apertura
                    </button>
                  )}
                </div>

                {!!err && <div style={{ ...ui.sectionSubtitle, marginTop: 10 }}>{err}</div>}
              </div>

              {/* Datos clave */}
              <div style={ui.card}>
                <div style={ui.cardContent}>
                  <Section title="Datos clave" subtitle="Información principal">
                    <InfoRow
                      label="Nombre"
                      value={accion?.nombreAccion || "—"}
                      onClick={() => copiar(accion?.nombreAccion || "", "Copiado")}
                      rightHint="Click para copiar"
                    />
                    <div style={ui.divider} />
                    <InfoRow
                      label="Proveedor"
                      value={proveedor}
                      onClick={() => copiar(proveedor, "Copiado")}
                      rightHint="Click para copiar"
                    />
                    <div style={ui.divider} />
                    <InfoRow
                      label="Andén"
                      value={anden}
                      onClick={() => copiar(anden, "Copiado")}
                      rightHint="Click para copiar"
                    />
                    <div style={ui.divider} />
                    <InfoRow
                      label="Apertura ID"
                      value={accion?.aperturaId || "—"}
                      mono
                      onClick={() => accion?.aperturaId && copiar(accion?.aperturaId, "Copiado")}
                      rightHint={accion?.aperturaId ? "Click para copiar" : null}
                    />
                    <div style={ui.divider} />
                    <InfoRow
                      label="Tipo de apertura"
                      value={aperturaTipo || "—"}
                      onClick={() => aperturaTipo && copiar(aperturaTipo, "Copiado")}
                      rightHint={aperturaTipo ? "Click para copiar" : null}
                    />
                  </Section>
                </div>
              </div>

              {/* Tiempos */}
              <div style={ui.card}>
                <div style={ui.cardContent}>
                  <Section title="Tiempos" subtitle="Registro de la descarga">
                    <InfoRow label="Creada" value={formatDateTime(accion?.creadoAt)} />
                    <div style={ui.divider} />
                    <InfoRow label="Iniciada" value={formatDateTime(accion?.startedAt)} />
                    <div style={ui.divider} />
                    <InfoRow label="Completada" value={formatDateTime(completedAtValue)} />
                    <div style={ui.divider} />
                    <InfoRow label="Tiempo de descarga" value={accion?.totalTimeTxt || "—"} />
                  </Section>
                </div>
              </div>

              {/* Más detalles */}
              <div style={ui.card}>
                <div style={ui.cardContent}>
                  <Section
                    title="Más detalles"
                    subtitle="Campos técnicos / debug"
                    right={
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((v) => !v)}
                        style={ui.smallBtn}
                      >
                        {detailsOpen ? "Ocultar" : "Ver"}
                      </button>
                    }
                  >
                    {!detailsOpen ? (
                      <div style={ui.sectionSubtitle}>Abrí para ver todos los campos.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {orderedKeys.map((k) => (
                          <div key={k}>
                            <InfoRow
                              label={k}
                              value={formatValue(accion?.[k])}
                              mono={k.toLowerCase().includes("id") || k.toLowerCase().includes("uid")}
                              onClick={() => copiar(formatValue(accion?.[k]), "Copiado")}
                              rightHint="Click para copiar"
                            />
                            <div style={ui.divider} />
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal iniciar */}
      {startModalOpen && (
        <div style={ui.modalRoot} role="dialog" aria-modal="true">
          <button type="button" style={ui.modalBackdrop} onClick={() => setStartModalOpen(false)} aria-label="Cerrar" />

          <div style={ui.modalCard}>
            <div style={ui.modalIcon} aria-hidden="true">
              ▶
            </div>

            <div style={ui.modalTitle}>Iniciar descarga</div>
            <div style={ui.modalSub}>Completá los datos para comenzar.</div>

            <div style={{ marginTop: 14 }}>
              <div style={ui.label}>Tipo de descarga</div>
              <div style={ui.segmentRow}>
                <button
                  type="button"
                  onClick={() => setTipoDescarga("A granel")}
                  style={{ ...ui.segment, ...(tipoDescarga === "A granel" ? ui.segmentSelected : {}) }}
                >
                  <span style={{ ...ui.segmentTxt, ...(tipoDescarga === "A granel" ? ui.segmentTxtSelected : {}) }}>
                    A granel
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoDescarga("Entarimado")}
                  style={{ ...ui.segment, ...(tipoDescarga === "Entarimado" ? ui.segmentSelected : {}) }}
                >
                  <span style={{ ...ui.segmentTxt, ...(tipoDescarga === "Entarimado" ? ui.segmentTxtSelected : {}) }}>
                    Entarimado
                  </span>
                </button>
              </div>

              <div style={ui.label}>Cantidad de bultos</div>
              <input
                value={cantidadBultos}
                onChange={(e) => setCantidadBultos(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Ej: 120"
                inputMode="numeric"
                style={ui.input}
              />

              <div style={ui.modalActions}>
                <button type="button" onClick={() => setStartModalOpen(false)} style={ui.actionBtn}>
                  Cancelar
                </button>

                <button type="button" onClick={confirmStart} style={{ ...ui.actionBtn, ...ui.primaryBtn }}>
                  Iniciar
                </button>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />
        </div>
      )}
    </div>
  );
}

/* ===================== Styles (corporativo) ===================== */
const ui = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
  },

  topbar: {
    width: "100%",
    boxSizing: "border-box",
    borderBottom: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
    backdropFilter: "blur(8px)",
  },
  topbarInner: {
    width: "100%",
    boxSizing: "border-box",
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
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
  },
  brandTitle: { fontWeight: 950, fontSize: 14, color: "#0F172A" },
  brandSub: { fontWeight: 800, fontSize: 12, color: SLATE },

  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 12px 6px 6px",
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
    maxWidth: 220,
    minWidth: 0,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userName: {
    fontWeight: 800,
    fontSize: 12,
    color: "#0F172A",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userMail: {
    fontWeight: 650,
    fontSize: 11,
    color: SLATE,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 12,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    color: "#0F172A",
    boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  },
  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "18px 16px 28px",
    display: "grid",
    placeItems: "start center",
    WebkitOverflowScrolling: "touch",
  },
  container: {
    width: "100%",
    boxSizing: "border-box",
    display: "grid",
    gap: 14,
  },

  center: { minHeight: 320, display: "grid", placeItems: "center", gap: 10 },
  spinner: {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "3px solid rgba(15,23,42,0.12)",
    borderTopColor: ACCENT,
    animation: "spin 0.9s linear infinite",
  },
  loadingText: { color: "#64748B", fontWeight: 850 },

  heroCard: {
    padding: 16,
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  },
  heroTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  heroTitle: { fontSize: 18, fontWeight: 980, color: "#0F172A", lineHeight: 1.15 },
  heroSub: { marginTop: 6, color: "#64748B", fontWeight: 850, lineHeight: 1.35 },

  idCard: {
    marginTop: 12,
    width: "100%",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    textAlign: "left",
  },
  idLabel: { fontSize: 12, color: "#64748B", fontWeight: 900 },
  idValue: {
    marginTop: 4,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 950,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  idHint: { color: "#0F172A", fontWeight: 950, fontSize: 12 },

  statsGrid: { display: "grid", gap: 10, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" },
  statPill: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    backgroundColor: "#FBFCFF",
    padding: "10px 12px",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    backgroundColor: "#F2F4FB",
    border: "1px solid #E7E9F2",
    color: "#0F172A",
    fontWeight: 950,
  },
  statLabel: { fontSize: 12, color: "#64748B", fontWeight: 950 },
  statValue: { marginTop: 2, color: "#0F172A", fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  actionsGrid: { display: "grid", gap: 10, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" },
  actionBtn: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    backgroundColor: "#FBFCFF",
    padding: "12px 12px",
    cursor: "pointer",
    fontWeight: 980,
    color: "#0F172A",
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderColor: "rgba(8,159,138,0.35)",
    color: "#fff",
  },

  card: {
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    background: "#fff",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  cardContent: { padding: 16 },

  sectionHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: "#0F172A", fontSize: 14, fontWeight: 980 },
  sectionSubtitle: { marginTop: 4, color: "#64748B", fontWeight: 850, fontSize: 13, lineHeight: 1.35 },

  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0" },
  rowClickable: { cursor: "pointer" },
  rowLabel: { color: "#64748B", fontWeight: 900, width: 140, fontSize: 12 },
  rowValue: { color: "#0F172A", fontWeight: 900, fontSize: 12, lineHeight: 1.2 },
  rowHint: { marginTop: 4, fontSize: 11, color: "#94A3B8", fontWeight: 850 },

  divider: { height: 1, background: "#EEF0F7" },

  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  chip: { display: "inline-flex", alignItems: "center", borderRadius: 999, border: "1px solid #E7E9F2", padding: "6px 10px" },
  chipTxt: { fontWeight: 980, fontSize: 12 },

  chipNeutral: { backgroundColor: "#F2F4FB", borderColor: "#E7E9F2" },
  chipTxtNeutral: { color: "#334155" },

  chipSuccess: { backgroundColor: "#EAF7EE", borderColor: "#C6EAD2" },
  chipTxtSuccess: { color: "#1F7A3E" },

  chipWarning: { backgroundColor: "#FFF4DF", borderColor: "#FFE1A8" },
  chipTxtWarning: { color: "#8A5A00" },

  chipDanger: { backgroundColor: "#FDEAEA", borderColor: "#F6C2C2" },
  chipTxtDanger: { color: "#9A1D1D" },

  smallBtn: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 980,
    color: "#0F172A",
  },

  blockCard: {
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    display: "grid",
    gap: 10,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
  },
  blockTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A" },
  blockText: { fontWeight: 850, color: "#64748B" },

  /* Modal */
  modalRoot: { position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", border: "none" },

  modalCard: {
    width: "min(560px, calc(100% - 24px))",
    backgroundColor: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    padding: 16,
    boxShadow: "0 18px 60px rgba(15,23,42,0.22)",
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    backgroundColor: "#FBFCFF",
    display: "grid",
    placeItems: "center",
    marginBottom: 10,
    fontWeight: 980,
    color: "#0F172A",
  },
  modalTitle: { fontWeight: 980, fontSize: 16, color: "#0F172A" },
  modalSub: { fontWeight: 850, color: "#64748B", marginTop: 6 },

  label: { marginTop: 14, color: "#64748B", fontWeight: 980, fontSize: 12 },

  segmentRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  segment: {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    backgroundColor: "#F2F4FB",
    cursor: "pointer",
    textAlign: "center",
  },
  segmentSelected: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  segmentTxt: { fontWeight: 980, color: "#0F172A" },
  segmentTxtSelected: { color: "#fff" },

  input: {
    marginTop: 8,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "12px 12px",
    outline: "none",
    fontWeight: 900,
    color: "#0F172A",
    width: "100%",
  },

  modalActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 },
};