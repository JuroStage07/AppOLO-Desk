// screens/aperturas/AperturaDetalle.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { doc, updateDoc, deleteDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Ban,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Play,
  Receipt,
  Shield,
  ShieldAlert,
  LifeBuoy,
  User,
  X,
} from "lucide-react";

import JSZip from "jszip";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { listenApertura } from "../../../services/aperturas";
import { isInUserScope } from "../../../utils/dataScope";
import { isEpaRestrictedUser } from "../../../config/epaOnlyUids";
import {
  Brand,
  GhostButton,
  Topbar,
} from "../../../components/ui";

const ACCENT = "#089F8A";
const ACCENT_SOFT = "rgba(8, 159, 138, 0.12)";
const SLATE = "#64748B";

/* ===================== Helpers RS (igual RN) ===================== */
const RS_KEY_BY_FORM = {
  "Proveedor Nacional": "proveedor_nacional",
  "Zona Franca": "zona_franca",
  Nacionalizados: "nacionalizados",
};
function getRS(apertura) {
  const tipo = apertura?.tipoFormulario || null;
  const key = RS_KEY_BY_FORM[tipo];
  if (!key) return null;
  return apertura?.revisionSeguridad?.[key] || null;
}
function isRSCompleted(apertura) {
  const rs = getRS(apertura);
  if (!rs) return false;
  if (typeof rs.completed === "boolean") return rs.completed;

  const tipo = apertura?.tipoFormulario;
  if (tipo === "Proveedor Nacional") {
    const vm = rs?.vieneConMarchamo;
    const nm = (rs?.numeroMarchamo || "").trim();
    const pp = rs?.puedeProceder;
    const motivo = (rs?.motivoNoProcede || "").trim();
    if (typeof vm !== "boolean" || typeof pp !== "boolean") return false;
    if (vm === true && !nm) return false;
    if (pp === false && !motivo) return false;
    return true;
  }
  return Object.values(rs).some((v) => typeof v === "boolean");
}

/* ===================== Helpers RF (igual RN) ===================== */
const RF_KEY_BY_FORM = {
  "Proveedor Nacional": "proveedor_nacional",
  "Zona Franca": "zona_franca",
  Nacionalizados: "nacionalizados",
};
function isRFCompleted(apertura) {
  const tipo = apertura?.tipoFormulario || null;
  const key = RF_KEY_BY_FORM[tipo];
  if (!key) return false;

  const rf = apertura?.registroFotografico?.[key];
  if (!rf) return false;

  return rf.completed === true;
}

function extFromImageBlobType(mime) {
  if (!mime || typeof mime !== "string") return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/** Nombre de carpeta / archivo ZIP seguro en Windows/macOS/Linux */
function sanitizeFolderNameForZip(name) {
  const cleaned = String(name ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  return cleaned.length ? cleaned : "apertura";
}

/* ===================== Date helpers ===================== */
const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
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

const isPlainObject = (v) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  typeof v?.toDate !== "function" &&
  !(v instanceof Date);

/* ===================== UI bits ===================== */
function TonePill({ label, tone = "neutral" }) {
  if (!label) return null;
  const toneStyle =
    tone === "success"
      ? ui.pillSuccess
      : tone === "warning"
      ? ui.pillWarning
      : tone === "danger"
      ? ui.pillDanger
      : ui.pillNeutral;

  return <span style={{ ...ui.pillBase, ...toneStyle }}>{label}</span>;
}

function Modal({ open, onClose, title, subtitle, children, maxWidth = 420, footer, tone = "modal" }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const backdropStyle =
    tone === "viewer"
      ? { ...ui.backdropBase, ...ui.backdropViewer }
      : { ...ui.backdropBase, ...ui.backdropModal };

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      style={backdropStyle}
    >
      <div style={{ ...ui.modalCard, maxWidth }}>
        <div style={ui.modalHeader}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={ui.modalTitle}>{title}</div>
            {subtitle ? <div style={ui.modalSubtitle}>{subtitle}</div> : null}
          </div>

          <button type="button" onClick={onClose} style={ui.iconBtn} title="Cerrar (ESC)">
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>

        <div style={ui.modalBody}>{children}</div>

        {footer !== false ? (
          <div style={ui.modalFooter}>
            {footer ?? (
              <button type="button" onClick={onClose} style={ui.btnPrimary}>
                Cerrar
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/* ===================== Keys / Ordering ===================== */
const FORM_KEY_BY_FORM = {
  "Proveedor Nacional": "proveedor_nacional",
  "Zona Franca": "zona_franca",
  Nacionalizados: "nacionalizados",
};

// Orden como tu screenshot (ajusta keys si en tu data se llaman diferente)
const FORM_ORDER = {
  "Proveedor Nacional": [
    ["asesorRecepcion", "Asesor de recepción"],
    ["fecha", "Fecha"],
    ["proveedor", "Proveedor"],
    ["numeroDUA", "N° DUA"],
    ["numeroContenedor", "N° contenedor"],
    ["numeroMatricula", "N° matrícula"],
    ["numeroExpediente", "N° expediente"],
    ["estadoAforo", "Estado del aforo"],
    ["numeroMarchamo", "N° marchamo"],
    ["idAnden", "ID andén"],
  ],
  // si querés, agrega "Zona Franca" y "Nacionalizados" igual:
  // "Zona Franca": [...],
  // Nacionalizados: [...],
};

const prettifyKey = (k) => {
  let s = String(k || "");

  // limpia prefijos típicos
  s = s.replace(/^values[_\s.-]*/i, ""); // values_, values , values-
  s = s.replace(/^values(?=[A-Z])/i, ""); // valuesEstadoAforo -> EstadoAforo
  s = s.replace(/^value[_\s.-]*/i, "");

  // normaliza
  s = s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

  // title case
  s = s.replace(/\b\w/g, (m) => m.toUpperCase());

  return s.trim();
};

const isUrl = (v) => typeof v === "string" && /^https?:\/\/|^gs:\/\//i.test(v);

function collectPhotoUrls(any) {
  const out = [];
  const seen = new Set();

  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      if (isUrl(v) && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };

  walk(any);
  return out;
}

function renderValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return String(v);

  // fechas / timestamps como string ISO
  const asDate = toDateSafe(v);
  if (asDate) return formatDateTime(asDate);

  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.length ? v.map(renderValue).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderValueNode(v) {
  if (v === null || v === undefined || v === "") return <span style={{ color: "#94A3B8" }}>—</span>;

  // unwrap { values: ... } cuando viene así
  if (isPlainObject(v) && "values" in v && Object.keys(v).length === 1) {
    return renderValueNode(v.values);
  }

  // date-like
  const asDate = toDateSafe(v);
  if (asDate) return <span style={ui.valueText}>{formatDateTime(asDate)}</span>;

  if (typeof v === "boolean") {
    return <span style={{ ...ui.pillBase, ...(v ? ui.pillSuccess : ui.pillDanger) }}>{v ? "Sí" : "No"}</span>;
  }

  if (typeof v === "number") return String(v);

  if (typeof v === "string") {
    if (/^https?:\/\/|^gs:\/\//i.test(v)) {
      return (
        <a href={v} target="_blank" rel="noreferrer" style={ui.link}>
          Abrir enlace
        </a>
      );
    }
    return <span style={ui.valueText}>{v}</span>;
  }

  if (Array.isArray(v)) {
    if (!v.length) return <span style={{ color: "#94A3B8" }}>—</span>;
    return (
      <div style={ui.chipWrap}>
        {v.map((it, idx) => (
          <span key={idx} style={ui.miniChip}>
            {String(it)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof v === "object") {
    // si es objeto plano chiquito, lo mostramos compacto (no pre grande)
    try {
      return <span style={ui.valueText}>{JSON.stringify(v)}</span>;
    } catch {
      return <span style={ui.valueText}>[objeto]</span>;
    }
  }

  return String(v);
}

function objectEntriesForView(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).filter(([k]) => !["metadata", "completed"].includes(k));
}

// Busca valor soportando:
// - key directo
// - formData.values[key]
// - valuesKey / values_key
function getAny(formData, key) {
  if (!formData || typeof formData !== "object") return undefined;

  // 1) directo
  if (Object.prototype.hasOwnProperty.call(formData, key)) return formData[key];

  // 2) dentro de values (objeto)
  if (isPlainObject(formData.values) && Object.prototype.hasOwnProperty.call(formData.values, key)) {
    return formData.values[key];
  }

  // 3) variants valuesX / values_x
  const v1 = `values${key[0]?.toUpperCase?.()}${key.slice(1)}`;
  if (Object.prototype.hasOwnProperty.call(formData, v1)) return formData[v1];

  const v2 = `values_${key}`;
  if (Object.prototype.hasOwnProperty.call(formData, v2)) return formData[v2];

  return undefined;
}

function orderedFormEntries(formData, tipoFormulario) {
  if (!formData) return [];

  const out = [];
  const used = new Set();

  const order = FORM_ORDER[tipoFormulario] || [];

  // 1) primero los del orden
  for (const [key, label] of order) {
    const val = getAny(formData, key);
    if (val !== undefined) {
      out.push([label, val, key]);
      used.add(key);
      used.add(`values${key[0]?.toUpperCase?.()}${key.slice(1)}`);
      used.add(`values_${key}`);
    }
  }

  // 2) resto: incluye keys directas + dentro de values (si existe)
  const restEntries = [];

  // directos
  for (const [k, v] of objectEntriesForView(formData)) {
    if (k === "values" && isPlainObject(v)) continue; // lo manejamos aparte
    if (!used.has(k)) restEntries.push([k, v]);
  }

  // values.*
  if (isPlainObject(formData.values)) {
    for (const [k, v] of Object.entries(formData.values)) {
      if (!used.has(k)) restEntries.push([k, v]);
    }
  }

  // ordena y agrega
  restEntries
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .forEach(([k, v]) => out.push([prettifyKey(k), v, `rest:${k}`]));

  return out;
}

/* ===================== Component ===================== */
export default function AperturaDetalle() {
  const nav = useNavigate();
  const { id } = useParams(); // /salud/aperturas/detalle/:id
  const authCtx = useContext(AuthCtx);
  const { profile = {}, epaAdmin, user: ctxUser } = authCtx || {};
  const user = ctxUser ?? auth.currentUser;

  const [apertura, setApertura] = useState(undefined);

  const { search } = useLocation();
  const isViewMode = new URLSearchParams(search).get("mode") === "ver";

  // visor de fotos (RF)
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const photoViewerFullRef = useRef(null);
  const facturaViewerFullRef = useRef(null);

  // modales
  const [formOpen, setFormOpen] = useState(false);
  const [rsOpen, setRsOpen] = useState(false);
  const [rfOpen, setRfOpen] = useState(false);
  const [rfDownloadAllBusy, setRfDownloadAllBusy] = useState(false);
  const [restrictedFormRsOpen, setRestrictedFormRsOpen] = useState(false);

  const isRestrictedFormRsView = isEpaRestrictedUser({ epaAdmin, profile, user });

  const formKey = FORM_KEY_BY_FORM[apertura?.tipoFormulario] || null;

  const formData = formKey ? apertura?.formulario?.[formKey] : null;
  const rsData = formKey ? apertura?.revisionSeguridad?.[formKey] : null;
  const rfData = formKey ? apertura?.registroFotografico?.[formKey] : null;

  const rfUrls = useMemo(() => collectPhotoUrls(rfData), [rfData]);

  const photoViewerSafeIndex =
    photoViewerOpen && rfUrls.length > 0
      ? Math.min(Math.max(0, photoViewerIndex), rfUrls.length - 1)
      : 0;
  const photoViewerCurrentUrl =
    photoViewerOpen && rfUrls.length > 0 ? rfUrls[photoViewerSafeIndex] ?? null : null;

  // extra modals
  const [timesOpen, setTimesOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // rechazo
  const REJECT_OPTIONS = useMemo(
    () => ["Informacion incompleta", "Informacion erronea", "Marchamo comprometido", "Descarga ya iniciada", "Otro"],
    []
  );
  const [rejectMotivo, setRejectMotivo] = useState(null);
  const [rejectOtroTxt, setRejectOtroTxt] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);
  const canSubmitReject = !!rejectMotivo && (rejectMotivo !== "Otro" || rejectOtroTxt.trim().length >= 3);

  // computed
  const tipoFormulario = apertura?.tipoFormulario || null;

  const isFinalizada = (apertura?.estado || "").toLowerCase() === "finalizada";
  const isRechazada = (apertura?.estado || "").toLowerCase() === "rechazada";
  const isReadOnly = isFinalizada || isRechazada;

  const estadoLabel = isFinalizada ? "Finalizada" : isRechazada ? "Rechazada" : "En proceso";
  const estadoTone = isFinalizada ? "success" : isRechazada ? "danger" : "warning";

  const formPN = apertura?.formulario?.proveedor_nacional;
  const formZF = apertura?.formulario?.zona_franca;
  const formNAC = apertura?.formulario?.nacionalizados;

  const formMap = {
    "Proveedor Nacional": { label: "Proveedor Nacional", form: formPN },
    "Zona Franca": { label: "Zona Franca", form: formZF },
    Nacionalizados: { label: "Nacionalizados", form: formNAC },
  };
  const currentForm = formMap[tipoFormulario];
  const isFormCompleted = currentForm?.form?.metadata?.completed || apertura?.formulario?.completed || false;

  const fromReception = apertura?.fromReception === true;
  const receptionStarted = apertura?.receptionStarted === true;
  const receptionUnlocked = !fromReception || receptionStarted;

  const rsDone = isRSCompleted(apertura);
  const rfDone = isRFCompleted(apertura);
  const allReady = !!isFormCompleted && rsDone && rfDone;

  const responsableLabel =
    apertura?.assignedToNombre ||
    (apertura?.assignedTo && String(apertura.assignedTo)) ||
    apertura?.creadoPorNombre ||
    "—";

  const fotoFacturaUrl = apertura?.fotoFacturaUrl || null;

  const aperturaCollection =
    apertura?.__sourceCollection === "aperturasRecepcion" ? "aperturasRecepcion" : "aperturas";

  // page body styling
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

  // realtime doc
  useEffect(() => {
    if (!id) return;
    setApertura(undefined);
    const unsub = listenApertura(String(id), setApertura);
    return () => unsub?.();
  }, [id]);

  useEffect(() => {
    if (!apertura) return;
    if (!isInUserScope(apertura, profile?.tenantId, profile?.company)) {
      alert("No tenés acceso a esta apertura.");
      nav(-1);
    }
  }, [apertura, nav, profile?.tenantId, profile?.company]);

  const isLoading = apertura === undefined;

  const go = (path) => nav(path);

  const copiarId = async () => {
    if (!apertura?.id) return;
    try {
      await navigator.clipboard.writeText(String(apertura.id));
      alert("Copiado: ID de la apertura");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(apertura.id);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Copiado: ID de la apertura");
    }
  };

  /* ===================== Actions (Firestore) ===================== */
  const iniciarApertura = async () => {
    if (!apertura?.id) return;
    if (apertura?.tiempoIniciada) return alert("Esta apertura ya fue iniciada.");

    const ok = window.confirm("¿Deseas iniciar la tarea?");
    if (!ok) return;

    try {
      const ref = doc(db, aperturaCollection, apertura.id);
      await updateDoc(ref, {
        receptionStarted: true,
        tiempoIniciada: serverTimestamp(),
        iniciadoPorUid: user?.uid || null,
        iniciadoPorNombre: user?.displayName || null,
      });
      alert("✅ Apertura iniciada");
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar la apertura.");
    }
  };

  const confirmarFinalizar = async () => {
    if (!apertura?.id) return;
    if (isFinalizada) return alert("Ya finalizada");
    if (!allReady) {
      return alert("Para finalizar, completa: Formulario, Revisión de Seguridad y Registro Fotográfico.");
    }

    const ok = window.confirm("¿Deseas finalizar la apertura y generar una acción de descarga?");
    if (!ok) return;

    try {
      const apRef = doc(db, aperturaCollection, apertura.id);

      await updateDoc(apRef, {
        estado: "finalizada",
        tiempoCerrada: serverTimestamp(),
        completed: true,
      });

      const pick = (...vals) => vals.find((v) => typeof v === "string" && v.trim().length > 0)?.trim() || null;

      const proveedorNombre =
        pick(
          apertura?.values?.proveedor,
          apertura?.values?.nombreProveedor,
          apertura?.values?.proveedorNombre,
          apertura?.values?.razonSocial,
          apertura?.values?.empresa
        ) ||
        pick(apertura?.proveedor, apertura?.proveedorNombre, apertura?.razonSocialProveedor, apertura?.nombreProveedor);

      const anden = apertura?.values?.idAnden ?? apertura?.idAnden ?? null;
      const nombreAccion = `${proveedorNombre || "Sin proveedor"} · Andén ${anden || "—"}`;

      const accionRef = await addDoc(collection(db, "accion_descarga"), {
        aperturaId: apertura.id,
        creadoPorUid: user?.uid || null,
        creadoPorNombre: user?.displayName || "—",
        creadoAt: serverTimestamp(),
        tenantId:
          String(apertura?.tenantId || "").trim() ||
          String(profile?.tenantId || "").trim(),
        company:
          String(apertura?.company || "").trim() ||
          String(profile?.company || "").trim(),
        proveedorNombre: proveedorNombre || null,
        idAnden: anden || null,
        nombreAccion,

        startedAt: null,
        completedAt: null,
        tipoDescarga: null,
        cantidadBultos: null,
      });

      alert(`✅ Apertura finalizada\nAcción de descarga creada: ${accionRef.id}`);
      go("/salud/aperturas/finalizadas");
    } catch (e) {
      console.error(e);
      alert("No se pudo finalizar la apertura y/o generar la acción de descarga.");
    }
  };

  const confirmarReabrir = async () => {
    if (!apertura?.id) return;
    const ok = window.confirm("¿Deseas reabrir esta apertura?");
    if (!ok) return;

    try {
      const ref = doc(db, aperturaCollection, apertura.id);
      await updateDoc(ref, { estado: "en_proceso" });
      alert("🔓 Reabierta");
    } catch (e) {
      console.error(e);
      alert("No se pudo reabrir.");
    }
  };

  const confirmarEliminar = async () => {
    if (!apertura?.id) return;
    const ok = window.confirm(`¿Eliminar "${apertura?.nombre || "(sin nombre)"}"?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, aperturaCollection, apertura.id));
      alert("🗑️ Eliminada");
      go("/salud/aperturas");
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar la apertura.");
    }
  };

  const openReject = () => {
    setRejectMotivo(null);
    setRejectOtroTxt("");
    setRejectOpen(true);
  };

  const submitReject = async () => {
    if (!apertura?.id) return;

    if (!canSubmitReject) {
      alert(rejectMotivo === "Otro" ? "Especifica el motivo (mínimo 3 caracteres)." : "Selecciona un motivo.");
      return;
    }

    try {
      setRejectSaving(true);
      const ref = doc(db, aperturaCollection, apertura.id);

      await updateDoc(ref, {
        estado: "rechazada",
        tiempoRechazada: serverTimestamp(),
        rechazo: {
          motivo: rejectMotivo,
          detalle: rejectMotivo === "Otro" ? rejectOtroTxt.trim() : null,
          rechazadoAt: serverTimestamp(),
          rechazadoPorUid: user?.uid || null,
          rechazadoPorNombre: user?.displayName || null,
        },
      });

      setRejectOpen(false);
      alert("🚫 Apertura rechazada");
      go("/salud/aperturas");
    } catch (e) {
      console.error(e);
      alert("No se pudo rechazar la apertura.");
    } finally {
      setRejectSaving(false);
    }
  };

  const viewQS = isReadOnly ? "?mode=ver" : "";

  // (los dejo por si los usas después)
  const goToFormulario = () => {
    if (isRestrictedFormRsView) {
      setRestrictedFormRsOpen(true);
      return;
    }
    if (!apertura?.id || !tipoFormulario) return alert("Sin tipo de formulario");
    if (tipoFormulario === "Proveedor Nacional")
      return go(`/salud/aperturas/form/proveedor-n/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Zona Franca")
      return go(`/salud/aperturas/form/zona-franca/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Nacionalizados")
      return go(`/salud/aperturas/form/nacionalizados/${encodeURIComponent(apertura.id)}${viewQS}`);
  };

  const goToRS = () => {
    if (isRestrictedFormRsView) {
      setRestrictedFormRsOpen(true);
      return;
    }
    if (!isReadOnly && !isFormCompleted) return alert("Debes completar el formulario para abrir RS.");
    if (tipoFormulario === "Proveedor Nacional")
      return go(`/salud/aperturas/rs/proveedor-n/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Zona Franca")
      return go(`/salud/aperturas/rs/zona-franca/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Nacionalizados")
      return go(`/salud/aperturas/rs/nacionalizados/${encodeURIComponent(apertura.id)}${viewQS}`);
  };

  const goToRF = () => {
    if (!tipoFormulario) return alert("Sin formulario asignado");
    if (tipoFormulario === "Proveedor Nacional")
      return go(`/salud/aperturas/rf/proveedor-n/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Zona Franca")
      return go(`/salud/aperturas/rf/zona-franca/${encodeURIComponent(apertura.id)}${viewQS}`);
    if (tipoFormulario === "Nacionalizados")
      return go(`/salud/aperturas/rf/nacionalizados/${encodeURIComponent(apertura.id)}${viewQS}`);
  };

  const enterPhotoFullscreen = async () => {
    const el = photoViewerFullRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (e) {
      console.error(e);
    }
  };

  const downloadCurrentPhoto = async () => {
    const url = photoViewerCurrentUrl;
    if (!url) return;
    const base = `registro-fotografico-${photoViewerSafeIndex + 1}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = extFromImageBlobType(blob.type);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${base}.${ext}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      console.error(e);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.jpg`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const enterFacturaFullscreen = async () => {
    const el = facturaViewerFullRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (e) {
      console.error(e);
    }
  };

  const downloadFacturaPhoto = async () => {
    const url = fotoFacturaUrl;
    if (!url) return;
    const base = "factura";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = extFromImageBlobType(blob.type);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${base}.${ext}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      console.error(e);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.jpg`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const downloadAllRfPhotos = async () => {
    if (!rfUrls.length || rfDownloadAllBusy || !apertura) return;
    const folderName = sanitizeFolderNameForZip(apertura.nombre || apertura.id);
    setRfDownloadAllBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      const zip = new JSZip();
      const root = zip.folder(folderName);
      if (!root) throw new Error("No se pudo crear la carpeta en el ZIP");
      for (let i = 0; i < rfUrls.length; i++) {
        const url = rfUrls[i];
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = extFromImageBlobType(blob.type);
          root.file(`foto-${String(i + 1).padStart(2, "0")}.${ext}`, blob);
          ok++;
        } catch (e) {
          console.error("RF ZIP foto", i, e);
          fail++;
        }
      }
      if (ok === 0) {
        alert("No se pudo descargar ninguna foto. Revisá tu conexión o los permisos de las URLs.");
        return;
      }
      const outBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const objUrl = URL.createObjectURL(outBlob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${folderName}.zip`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      if (fail > 0) {
        alert(`Se incluyeron ${ok} de ${rfUrls.length} fotos. ${fail} no se pudieron descargar.`);
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el archivo ZIP. Intentá de nuevo.");
    } finally {
      setRfDownloadAllBusy(false);
    }
  };

  useEffect(() => {
    if (!photoViewerOpen && !viewerOpen) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else if (document.webkitFullscreenElement) void document.webkitExitFullscreen?.();
    }
    if (!photoViewerOpen) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPhotoViewerIndex((i) => {
          const max = rfUrls.length - 1;
          if (max < 0) return 0;
          const cur = Math.min(Math.max(0, i), max);
          return Math.max(0, cur - 1);
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPhotoViewerIndex((i) => {
          const max = rfUrls.length - 1;
          if (max < 0) return 0;
          const cur = Math.min(Math.max(0, i), max);
          return Math.min(max, cur + 1);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoViewerOpen, viewerOpen, rfUrls.length]);

  return (
    <div style={ui.shell}>
      <style>{`
        @keyframes aperturaDetalleSpin {
          to { transform: rotate(360deg); }
        }
        .photo-rf-fs-root:fullscreen {
          background: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          box-sizing: border-box;
          border-radius: 0;
        }
        .photo-rf-fs-root:fullscreen img {
          width: auto !important;
          height: auto !important;
          max-width: 100% !important;
          max-height: 100vh !important;
          object-fit: contain !important;
        }
      `}</style>

      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Salud ocupacional"
          subtitle="Detalle de apertura"
          onClick={() => go("/salud/aperturas")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => go("/salud/aperturas")}>
            Administrar
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <main style={ui.main}>
        <div style={ui.container}>
          {isLoading ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIcon}>
                <Loader2
                  size={22}
                  color={ACCENT}
                  strokeWidth={2.2}
                  style={{ animation: "aperturaDetalleSpin 0.85s linear infinite" }}
                />
              </div>
              <div style={ui.emptyTitle}>Cargando apertura…</div>
              <div style={ui.emptyText}>Sincronizando datos.</div>
            </div>
          ) : !apertura ? (
            <div style={ui.emptyWrap}>
              <div style={ui.emptyIconMuted}>
                <HelpCircle size={24} color={SLATE} strokeWidth={2} />
              </div>
              <div style={ui.emptyTitle}>No encontrada</div>
              <div style={ui.emptyText}>No se encontró la apertura o no tenés permiso para verla.</div>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div style={ui.detailHero}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={ui.kickerRow}>
                    <span style={ui.kickerDot} />
                    <div style={ui.kicker}>Detalles</div>
                    <TonePill label={estadoLabel} tone={estadoTone} />
                    <span style={ui.badge}>{tipoFormulario || "Sin formulario"}</span>
                  </div>

                  <h1 style={ui.title}>{apertura?.nombre || "—"}</h1>
                  <p style={ui.subtitle}>
                    {apertura?.tipo || "—"} · Responsable: <b>{responsableLabel}</b>
                  </p>

                  <div style={ui.idPill} role="button" tabIndex={0} onClick={copiarId} title="Tocar para copiar">
                    <div style={ui.idPillLabel}>ID</div>
                    <div style={ui.idPillValue}>{apertura?.id}</div>
                    <div style={ui.idPillHint}>Tocar para copiar</div>
                  </div>
                </div>

                <div style={ui.quickCard}>
                  <div style={ui.quickLabel}>Progreso</div>

                  <div style={ui.progressGrid}>
                    <div style={ui.progressItem}>
                      <div style={ui.progressLabel}>Formulario</div>
                      <TonePill label={isFormCompleted ? "OK" : "Pendiente"} tone={isFormCompleted ? "success" : "warning"} />
                    </div>
                    <div style={ui.progressItem}>
                      <div style={ui.progressLabel}>RS</div>
                      <TonePill label={rsDone ? "OK" : "Pendiente"} tone={rsDone ? "success" : "warning"} />
                    </div>
                    <div style={ui.progressItem}>
                      <div style={ui.progressLabel}>RF</div>
                      <TonePill label={rfDone ? "OK" : "Pendiente"} tone={rfDone ? "success" : "warning"} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => nav(-1)} style={ui.btnGhost}>
                      <span style={ui.btnInlineIcon}>
                        <ArrowLeft size={16} strokeWidth={2.2} />
                        Volver
                      </span>
                    </button>
                    <button type="button" onClick={() => setOptionsOpen(true)} style={ui.btnGhost} title="Opciones">
                      <span style={ui.btnInlineIcon}>
                        <MoreHorizontal size={18} strokeWidth={2.2} />
                        Opciones
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Recepción lock */}
              {!receptionUnlocked ? (
                <div style={ui.card}>
                  <div style={ui.cardAccent} aria-hidden />
                  <div style={ui.cardTitle}>Recepción</div>
                  <div style={ui.cardSub}>Esta apertura viene desde recepción</div>
                  <div style={ui.cardBody}>
                    <div style={ui.helperText}>Para habilitar acciones, inicia la tarea.</div>
                    <button type="button" onClick={iniciarApertura} style={ui.btnPrimary}>
                      <span style={ui.btnInlineIcon}>
                        <Play size={17} strokeWidth={2.25} />
                        Iniciar apertura
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Info */}
                  <div style={ui.card}>
                    <div style={ui.cardAccent} aria-hidden />
                    <div style={ui.cardTitle}>Información</div>
                    <div style={ui.cardBody}>
                      <div style={ui.kvRow}>
                        <div style={ui.kvLabel}>Responsable</div>
                        <div style={ui.kvValue}>{responsableLabel}</div>
                      </div>
                      <div style={ui.kvRow}>
                        <div style={ui.kvLabel}>Estado</div>
                        <div style={ui.kvValue}>{apertura?.estado || "—"}</div>
                      </div>
                      <div style={ui.kvRow}>
                        <div style={ui.kvLabel}>Formulario asignado</div>
                        <div style={ui.kvValue}>{tipoFormulario || "—"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Factura */}
                  <div style={ui.card}>
                    <div style={ui.cardAccent} aria-hidden />
                    <div style={ui.cardTitle}>Factura</div>
                    <div style={ui.cardSub}>Adjunta una foto para completar el registro</div>
                    <div style={ui.cardBody}>
                      {fotoFacturaUrl ? (
                        <div
                          style={ui.fotoPreview}
                          role="button"
                          tabIndex={0}
                          onClick={() => setViewerOpen(true)}
                          title="Ver en pantalla completa"
                        >
                          <img src={fotoFacturaUrl} alt="Factura" style={ui.fotoThumb} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={ui.fotoTitle}>Foto de factura</div>
                            <div style={ui.fotoSubtitle}>Toca para ver en pantalla completa.</div>
                          </div>
                          <ChevronRight size={22} color="#94A3B8" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                        </div>
                      ) : (
                        <div style={ui.emptyMini}>
                          <div style={ui.emptyMiniTitle}>Sin foto de factura</div>
                          <div style={ui.emptyMiniText}>Adjunta una foto para completar el registro.</div>
                        </div>
                      )}
                      {isReadOnly ? (
                        <div style={ui.helperTextMuted}>
                          {isFinalizada
                            ? "La apertura está finalizada. No se puede modificar la factura."
                            : "La apertura está rechazada. No se puede modificar la factura."}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              )}

              {/* Taskbar */}
              {receptionUnlocked ? (
                <div style={ui.taskbar}>
                  <div style={ui.taskbarInner}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isRestrictedFormRsView) {
                          setRestrictedFormRsOpen(true);
                          return;
                        }
                        setFormOpen(true);
                      }}
                      style={ui.tbBtnPrimary}
                      title="Ver formulario"
                    >
                      <span style={ui.btnInlineIcon}>
                        <FileText size={17} strokeWidth={2.2} />
                        Ver formulario
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isRestrictedFormRsView) {
                          setRestrictedFormRsOpen(true);
                          return;
                        }
                        if (!isReadOnly && !isFormCompleted) return alert("Debes completar el formulario para abrir RS.");
                        setRsOpen(true);
                      }}
                      style={{
                        ...ui.tbBtnSoft,
                        ...(!isRestrictedFormRsView && !isReadOnly && !isFormCompleted ? ui.tbBtnDisabled : {}),
                      }}
                      disabled={!isRestrictedFormRsView && !isReadOnly && !isFormCompleted}
                      title="Ver RS"
                    >
                      <span style={ui.btnInlineIcon}>
                        <Shield size={17} strokeWidth={2.2} />
                        Ver RS
                      </span>
                    </button>

                    <button type="button" onClick={() => setRfOpen(true)} style={ui.tbBtnSoft} title="Ver RF">
                      <span style={ui.btnInlineIcon}>
                        <Camera size={17} strokeWidth={2.2} />
                        Ver RF
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* ===== Modal: Tiempos ===== */}
              <Modal open={timesOpen} onClose={() => setTimesOpen(false)} title="Tiempos" maxWidth={420}>
                <div style={ui.sheetList}>
                  <div style={ui.sheetItem}>
                    <div style={ui.sheetLabel}>Creada</div>
                    <div style={ui.sheetValue}>{formatDateTime(apertura?.tiempoCreada || apertura?.createdAt)}</div>
                  </div>
                  <div style={ui.sep} />
                  <div style={ui.sheetItem}>
                    <div style={ui.sheetLabel}>Iniciada</div>
                    <div style={ui.sheetValue}>{formatDateTime(apertura?.tiempoIniciada)}</div>
                  </div>
                  <div style={ui.sep} />
                  <div style={ui.sheetItem}>
                    <div style={ui.sheetLabel}>Finalizada</div>
                    <div style={ui.sheetValue}>{formatDateTime(apertura?.tiempoCerrada || apertura?.completedAt)}</div>
                  </div>
                  <div style={ui.sep} />
                  <div style={ui.sheetItem}>
                    <div style={ui.sheetLabel}>Duración</div>
                    <div style={ui.sheetValue}>{apertura?.tiempoEnProcesoTxt || "—"}</div>
                  </div>
                </div>

                <button type="button" onClick={() => setTimesOpen(false)} style={ui.btnPrimary}>
                  Cerrar
                </button>
              </Modal>

              {/* ===== Modal: Opciones ===== */}
              <Modal open={optionsOpen} onClose={() => setOptionsOpen(false)} title="Opciones" maxWidth={380}>
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    setTimesOpen(true);
                  }}
                  style={ui.btnGhost}
                >
                  <span style={ui.btnInlineIcon}>
                    <Clock size={16} strokeWidth={2.2} />
                    Tiempos
                  </span>
                </button>

                {!isReadOnly ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsOpen(false);
                      openReject();
                    }}
                    style={{ ...ui.btnGhost, ...ui.btnGhostDanger }}
                  >
                    <span style={ui.btnInlineIcon}>
                      <Ban size={16} strokeWidth={2.2} />
                      Rechazar apertura
                    </span>
                  </button>
                ) : null}

                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => setOptionsOpen(false)} style={ui.btnPrimary}>
                    Cerrar
                  </button>
                </div>
              </Modal>

              {/* ===== Modal: Rechazo ===== */}
              <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Motivo del rechazo" maxWidth={420}>
                <div style={ui.sheetHint}>Selecciona una opción:</div>

                <div style={ui.rejectGrid}>
                  {REJECT_OPTIONS.map((opt) => {
                    const selected = rejectMotivo === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setRejectMotivo(opt)}
                        style={{ ...ui.rejectChip, ...(selected ? ui.rejectChipSelected : {}) }}
                      >
                        <span style={{ ...ui.rejectChipTxt, ...(selected ? ui.rejectChipTxtSelected : {}) }}>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {rejectMotivo === "Otro" ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={ui.sheetHint}>Especifica:</div>
                    <textarea
                      value={rejectOtroTxt}
                      onChange={(e) => setRejectOtroTxt(e.target.value)}
                      placeholder="Escribe el motivo…"
                      style={ui.textarea}
                    />
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setRejectOpen(false)} style={ui.btnGhost} disabled={rejectSaving}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submitReject}
                    style={{ ...ui.btnDanger, ...((!canSubmitReject || rejectSaving) ? ui.btnDisabledSolid : {}) }}
                    disabled={!canSubmitReject || rejectSaving}
                  >
                    {rejectSaving ? "Rechazando…" : "Rechazar"}
                  </button>
                </div>
              </Modal>

              {/* ===== Viewer factura ===== */}
              <Modal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                title="Factura"
                maxWidth={900}
                tone="viewer"
                footer={
                  fotoFacturaUrl ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        justifyContent: "flex-end",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void enterFacturaFullscreen()}
                        style={ui.btnGhost}
                        title="Ver en pantalla completa"
                      >
                        <span style={ui.btnInlineIcon}>
                          <Maximize2 size={16} strokeWidth={2.2} />
                          Ver foto
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadFacturaPhoto()}
                        style={ui.btnGhost}
                        title="Descargar imagen de la factura"
                      >
                        <span style={ui.btnInlineIcon}>
                          <Download size={16} strokeWidth={2.2} />
                          Descargar
                        </span>
                      </button>
                      <button type="button" onClick={() => setViewerOpen(false)} style={ui.btnPrimary}>
                        Cerrar
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setViewerOpen(false)} style={ui.btnPrimary}>
                      Cerrar
                    </button>
                  )
                }
              >
                {fotoFacturaUrl ? (
                  <div
                    ref={facturaViewerFullRef}
                    className="photo-rf-fs-root"
                    style={{ ...ui.viewerBox, overflow: "hidden" }}
                  >
                    <img src={fotoFacturaUrl} alt="Factura" style={ui.viewerFacturaImg} />
                  </div>
                ) : (
                  <div style={ui.emptyWrap}>
                    <div style={ui.emptyIconMuted}>
                      <Receipt size={24} color={SLATE} strokeWidth={2} />
                    </div>
                    <div style={ui.emptyTitle}>No hay imagen</div>
                    <div style={ui.emptyText}>Esta apertura no tiene foto de factura.</div>
                  </div>
                )}
              </Modal>

              {/* ===== Modal: acceso restringido (form / RS) ===== */}
              <Modal
                open={restrictedFormRsOpen}
                onClose={() => setRestrictedFormRsOpen(false)}
                title="Vistas no habilitadas"
                subtitle="Perfil EPA (solo lectura de expediente)"
                maxWidth={480}
                footer={
                  <button
                    type="button"
                    onClick={() => setRestrictedFormRsOpen(false)}
                    style={ui.restrictedModalPrimaryBtn}
                  >
                    Entendido
                  </button>
                }
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={ui.restrictedModalHero}>
                    <div style={ui.restrictedModalIcon} aria-hidden>
                      <ShieldAlert size={30} strokeWidth={2.1} color="#C2410C" />
                    </div>
                    <p style={ui.restrictedModalLead}>
                      Tu perfil puede consultar el expediente, pero{" "}
                      <strong style={{ fontWeight: 900, color: "#0F172A" }}>no incluye</strong> las vistas de{" "}
                      <strong style={{ fontWeight: 900, color: "#0F172A" }}>Formulario</strong> ni{" "}
                      <strong style={{ fontWeight: 900, color: "#0F172A" }}>Revisión de seguridad (RS)</strong>.
                    </p>
                  </div>

                  <div style={ui.restrictedModalScope}>
                    <div style={ui.restrictedModalRow}>
                      <div style={ui.restrictedModalRowIcon} aria-hidden>
                        <FileText size={18} strokeWidth={2.2} color="#475569" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={ui.restrictedModalRowTitle}>Formulario</div>
                        <div style={ui.restrictedModalRowHint}>Vista y respuestas guardadas</div>
                      </div>
                      <span style={{ ...ui.pillBase, ...ui.pillWarning, fontSize: 11, flexShrink: 0 }}>No disponible</span>
                    </div>
                    <div style={ui.restrictedModalSep} />
                    <div style={ui.restrictedModalRow}>
                      <div style={ui.restrictedModalRowIcon} aria-hidden>
                        <Shield size={18} strokeWidth={2.2} color="#475569" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={ui.restrictedModalRowTitle}>Revisión de seguridad (RS)</div>
                        <div style={ui.restrictedModalRowHint}>Respuestas de la revisión</div>
                      </div>
                      <span style={{ ...ui.pillBase, ...ui.pillWarning, fontSize: 11, flexShrink: 0 }}>No disponible</span>
                    </div>
                  </div>

                  <div style={ui.restrictedModalCallout}>
                    <div style={ui.restrictedModalCalloutIcon} aria-hidden>
                      <LifeBuoy size={20} strokeWidth={2.2} color={ACCENT} />
                    </div>
                    <p style={ui.restrictedModalCalloutText}>
                      Si necesitás estas vistas, contactá al <strong style={{ fontWeight: 900 }}>equipo de desarrollo</strong>{" "}
                      o a <strong style={{ fontWeight: 900 }}>administración</strong>.
                    </p>
                  </div>
                </div>
              </Modal>

              {/* ===== Modal: Form ===== */}
              <Modal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                title="Formulario"
                subtitle={tipoFormulario || "Sin tipo"}
                maxWidth={720}
                footer={
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={copiarId} style={ui.btnGhost}>
                      <span style={ui.btnInlineIcon}>
                        <Copy size={16} strokeWidth={2.2} />
                        Copiar ID
                      </span>
                    </button>
                    <button type="button" onClick={() => setFormOpen(false)} style={ui.btnPrimary}>
                      Cerrar
                    </button>
                  </div>
                }
              >
                {!formData ? (
                  <div style={ui.emptyMini}>
                    <div style={ui.emptyMiniTitle}>Sin formulario</div>
                    <div style={ui.emptyMiniText}>No hay respuestas guardadas para este formulario.</div>
                  </div>
                ) : (
                  <div style={ui.modalGrid}>
                    {orderedFormEntries(formData, tipoFormulario).map(([label, value, rawKey]) => (
                      <div key={rawKey} style={ui.formField}>
                        <div style={ui.formLabel}>{label}</div>
                        <div style={ui.formValue}>{renderValueNode(value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Modal>

              {/* ===== Modal: RS ===== */}
              <Modal open={rsOpen} onClose={() => setRsOpen(false)} title="Revisión de Seguridad · Respuestas" maxWidth={780}>
                <div style={ui.cardBody}>
                  {!rsData ? (
                    <div style={ui.emptyMini}>
                      <div style={ui.emptyMiniTitle}>Sin RS</div>
                      <div style={ui.emptyMiniText}>No hay respuestas de revisión de seguridad.</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {objectEntriesForView(rsData).map(([k, v]) => (
                        <div key={k} style={ui.kvRow}>
                          <div style={ui.kvLabel}>{prettifyKey(k)}</div>
                          <div style={ui.kvValue}>{renderValue(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                    <button type="button" onClick={() => setRsOpen(false)} style={ui.btnPrimary}>
                      Cerrar
                    </button>
                  </div>
                </div>
              </Modal>

              {/* ===== Modal: RF (galería) ===== */}
              <Modal
                open={rfOpen}
                onClose={() => setRfOpen(false)}
                title="Registro Fotográfico · Fotos"
                maxWidth={900}
                footer={false}
              >
                <div style={ui.cardBody}>
                  {rfUrls.length === 0 ? (
                    <div style={ui.emptyMini}>
                      <div style={ui.emptyMiniTitle}>Sin fotos</div>
                      <div style={ui.emptyMiniText}>No hay fotos guardadas en el registro fotográfico.</div>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          marginBottom: 2,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void downloadAllRfPhotos()}
                          disabled={rfDownloadAllBusy}
                          style={{
                            ...ui.btnGhost,
                            ...(rfDownloadAllBusy ? ui.btnDisabled : {}),
                          }}
                          title="Descargar todas las fotos en un ZIP (carpeta con el nombre de la apertura)"
                        >
                          <span style={ui.btnInlineIcon}>
                            <Download size={16} strokeWidth={2.2} />
                            {rfDownloadAllBusy ? "Generando ZIP…" : "Descargar todas"}
                          </span>
                        </button>
                      </div>
                      <div style={ui.photoGrid}>
                        {rfUrls.map((url, idx) => (
                          <button
                            key={`${idx}-${url}`}
                            type="button"
                            style={ui.photoThumbBtn}
                            onClick={() => {
                              setPhotoViewerIndex(idx);
                              setPhotoViewerOpen(true);
                            }}
                            title="Ver foto"
                          >
                            <img src={url} alt="RF" style={ui.photoThumbImg} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Modal>

              {/* ===== Viewer de foto RF (SIEMPRE ENCIMA, por portal + zIndex) ===== */}
              <Modal
                open={photoViewerOpen}
                onClose={() => setPhotoViewerOpen(false)}
                title={
                  rfUrls.length > 1 ? `Foto · ${photoViewerSafeIndex + 1} / ${rfUrls.length}` : "Foto"
                }
                maxWidth={980}
                tone="viewer"
                footer={
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "flex-end",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void enterPhotoFullscreen()}
                      style={{ ...ui.btnGhost, ...(!photoViewerCurrentUrl ? ui.btnDisabled : {}) }}
                      disabled={!photoViewerCurrentUrl}
                      title="Ver en pantalla completa"
                    >
                      <span style={ui.btnInlineIcon}>
                        <Maximize2 size={16} strokeWidth={2.2} />
                        Ver foto
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadCurrentPhoto()}
                      style={{ ...ui.btnGhost, ...(!photoViewerCurrentUrl ? ui.btnDisabled : {}) }}
                      disabled={!photoViewerCurrentUrl}
                      title="Descargar esta foto"
                    >
                      <span style={ui.btnInlineIcon}>
                        <Download size={16} strokeWidth={2.2} />
                        Descargar
                      </span>
                    </button>
                    <button type="button" onClick={() => setPhotoViewerOpen(false)} style={ui.btnPrimary}>
                      Cerrar
                    </button>
                  </div>
                }
              >
                {photoViewerCurrentUrl ? (
                  <div style={ui.viewerAlbumWrap}>
                    <button
                      type="button"
                      style={{
                        ...ui.viewerNavBtn,
                        ...(photoViewerSafeIndex <= 0 ? ui.viewerNavBtnDisabled : {}),
                      }}
                      disabled={photoViewerSafeIndex <= 0}
                      onClick={() =>
                        setPhotoViewerIndex((i) => {
                          const max = rfUrls.length - 1;
                          const cur = Math.min(Math.max(0, i), max);
                          return Math.max(0, cur - 1);
                        })
                      }
                      title="Foto anterior"
                      aria-label="Foto anterior"
                    >
                      <ChevronLeft size={24} strokeWidth={2.25} />
                    </button>
                    <div style={ui.viewerAlbumMain}>
                      <div
                        ref={photoViewerFullRef}
                        className="photo-rf-fs-root"
                        style={ui.viewerBox}
                      >
                        <img src={photoViewerCurrentUrl} alt="Foto RF" style={ui.viewerImg} />
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{
                        ...ui.viewerNavBtn,
                        ...(photoViewerSafeIndex >= rfUrls.length - 1 ? ui.viewerNavBtnDisabled : {}),
                      }}
                      disabled={photoViewerSafeIndex >= rfUrls.length - 1}
                      onClick={() =>
                        setPhotoViewerIndex((i) => {
                          const max = rfUrls.length - 1;
                          const cur = Math.min(Math.max(0, i), max);
                          return Math.min(max, cur + 1);
                        })
                      }
                      title="Foto siguiente"
                      aria-label="Foto siguiente"
                    >
                      <ChevronRight size={24} strokeWidth={2.25} />
                    </button>
                  </div>
                ) : (
                  <div style={ui.emptyMini}>
                    <div style={ui.emptyMiniTitle}>Sin foto</div>
                    <div style={ui.emptyMiniText}>No se pudo cargar la imagen.</div>
                  </div>
                )}
              </Modal>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ===================== Styles ===================== */
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
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
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

  btnInlineIcon: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostDanger: {
    borderColor: "rgba(183,28,28,0.25)",
    background: "#FDEAEA",
    color: "#9A1D1D",
  },
  btnPrimary: {
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    borderRadius: 12,
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 850,
    color: "#fff",
    boxShadow: "0 12px 28px rgba(8,159,138,0.28)",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDanger: {
    border: "1px solid #B71C1C",
    background: "#B71C1C",
    borderRadius: 14,
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 980,
    color: "#fff",
    boxShadow: "0 16px 40px rgba(183,28,28,0.18)",
    whiteSpace: "nowrap",
  },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed", boxShadow: "none" },
  btnDisabledSolid: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

  main: {
    width: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    padding: "18px 16px 100px",
    WebkitOverflowScrolling: "touch",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
    display: "grid",
    gap: 16,
    paddingBottom: 8,
  },

  kickerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kickerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT,
    boxShadow: "0 0 0 3px rgba(8,159,138,0.2)",
  },
  kicker: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.08,
    textTransform: "uppercase",
    color: ACCENT,
  },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E7E9F2",
    color: "#334155",
  },

  title: { margin: 0, fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 950, letterSpacing: -0.4 },
  subtitle: { margin: 0, color: SLATE, fontWeight: 650, lineHeight: 1.5, fontSize: 14 },

  detailHero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: 18,
    alignItems: "start",
  },

  quickCard: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: "16px 18px",
    boxShadow: "0 12px 32px rgba(15,23,42,0.07)",
    display: "grid",
    alignContent: "start",
  },
  quickLabel: { fontWeight: 980, color: "#0F172A", marginBottom: 10 },

  progressGrid: { display: "flex", gap: 10, flexWrap: "wrap" },
  progressItem: {
    flex: 1,
    minWidth: 140,
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
    display: "grid",
    gap: 8,
  },
  progressLabel: { color: SLATE, fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04 },

  idPill: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    cursor: "pointer",
    userSelect: "none",
  },
  idPillLabel: { fontSize: 11, color: SLATE, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.05 },
  idPillValue: {
    marginTop: 4,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 980,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  idPillHint: { marginTop: 6, fontSize: 12, color: SLATE, fontWeight: 700 },

  card: {
    position: "relative",
    overflow: "hidden",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: "16px 18px",
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    display: "grid",
    gap: 8,
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.2) 55%, transparent 100%)`,
    pointerEvents: "none",
  },
  cardTitle: { fontWeight: 950, fontSize: 16, color: "#0F172A" },
  cardSub: { color: SLATE, fontWeight: 650, fontSize: 13, marginTop: -4 },
  cardBody: { display: "grid", gap: 10, marginTop: 4 },

  kvRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 0",
    borderBottom: "1px dashed rgba(231,233,242,0.9)",
  },
  kvLabel: { color: SLATE, fontWeight: 750, fontSize: 13, width: 170 },
  kvValue: { color: "#0F172A", fontWeight: 900, textAlign: "right", flex: 1 },

  helperText: { color: "#0F172A", opacity: 0.85, fontWeight: 850, lineHeight: 1.35 },
  helperTextMuted: { color: SLATE, fontWeight: 650, lineHeight: 1.45, fontSize: 13 },

  pillBase: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  pillNeutral: { background: "#F2F4FB" },
  pillSuccess: { background: "#EAF7EE", borderColor: "rgba(34,197,94,0.25)", color: "#166534" },
  pillWarning: { background: "#FFF4DF", borderColor: "#FFE1A8", color: "#8A5A00" },
  pillDanger: { background: "#FDEAEA", borderColor: "#F6C2C2", color: "#9A1D1D" },

  emptyWrap: {
    padding: "36px 24px",
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "linear-gradient(180deg, #fff 0%, #F8FAFC 100%)",
    display: "grid",
    placeItems: "center",
    gap: 8,
    boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
    textAlign: "center",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: `1px solid rgba(8,159,138,0.2)`,
    background: ACCENT_SOFT,
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyIconMuted: {
    width: 52,
    height: 52,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: 950, fontSize: 17, color: "#0F172A" },
  emptyText: { color: SLATE, fontWeight: 650, fontSize: 14, lineHeight: 1.5, maxWidth: 400 },

  emptyMini: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
  },
  emptyMiniTitle: { fontWeight: 980, color: "#0F172A" },
  emptyMiniText: { color: SLATE, fontWeight: 650, marginTop: 6, fontSize: 13 },

  restrictedModalHero: {
    display: "grid",
    placeItems: "center",
    gap: 12,
    textAlign: "center",
    padding: "16px 14px",
    borderRadius: 18,
    border: "1px solid rgba(251, 146, 60, 0.28)",
    background:
      "linear-gradient(135deg, rgba(255,247,237,0.95) 0%, rgba(248,250,252,0.98) 55%, rgba(241,245,249,0.95) 100%)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.06)",
  },
  restrictedModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    border: "1px solid rgba(251, 146, 60, 0.35)",
    background: "linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 100%)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 10px 24px rgba(234, 88, 12, 0.08)",
  },
  restrictedModalLead: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: SLATE,
    fontWeight: 650,
    maxWidth: 420,
    justifySelf: "center",
  },
  restrictedModalPrimaryBtn: {
    width: "100%",
    borderRadius: 14,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    fontWeight: 950,
    fontSize: 14,
    padding: "12px 16px",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(8, 159, 138, 0.22)",
  },
  restrictedModalScope: {
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    display: "grid",
    gap: 0,
  },
  restrictedModalRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "4px 0",
  },
  restrictedModalRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#fff",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  restrictedModalRowTitle: { fontWeight: 900, fontSize: 13, color: "#0F172A", letterSpacing: 0.01 },
  restrictedModalRowHint: { marginTop: 2, fontSize: 12, color: SLATE, fontWeight: 650 },
  restrictedModalSep: { height: 1, background: "rgba(231,233,242,0.95)", margin: "6px 0" },

  restrictedModalCallout: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 16,
    background: ACCENT_SOFT,
    border: "1px solid rgba(8,159,138,0.22)",
  },
  restrictedModalCalloutIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid rgba(8,159,138,0.2)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  restrictedModalCalloutText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: "#0F172A",
    fontWeight: 650,
  },

  fotoPreview: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    cursor: "pointer",
    userSelect: "none",
  },
  fotoThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    objectFit: "cover",
    background: "#eee",
    border: "1px solid #E7E9F2",
  },
  fotoTitle: { fontWeight: 980, color: "#0F172A" },
  fotoSubtitle: { marginTop: 6, color: SLATE, fontWeight: 650, fontSize: 12 },

  // modal base
  backdropBase: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.28)",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  backdropModal: { zIndex: 50 },
  backdropViewer: { zIndex: 9999, background: "rgba(15,23,42,0.45)" },

  modalCard: {
    width: "100%",
    background: "#fff",
    borderRadius: 18,
    padding: 14,
    border: "1px solid #E7E9F2",
    boxShadow: "0 18px 60px rgba(15,23,42,0.22)",
  },
  modalHeader: {
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 2,
    paddingBottom: 10,
    borderBottom: "1px solid #E7E9F2",
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: 980, color: "#0F172A" },
  modalSubtitle: { fontSize: 12, fontWeight: 700, color: SLATE },
  iconBtn: {
    width: 38,
    height: 38,
    padding: 0,
    borderRadius: 12,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    cursor: "pointer",
    color: "#475569",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  modalBody: {
    maxHeight: "70vh",
    overflow: "auto",
    paddingRight: 4,
  },

  modalFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #E7E9F2",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },

  sheetHint: { marginTop: 6, color: SLATE, fontWeight: 650, fontSize: 13 },

  sheetList: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    overflow: "hidden",
    marginBottom: 12,
  },
  sheetItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    gap: 12,
  },
  sheetLabel: { color: SLATE, fontWeight: 700, fontSize: 12 },
  sheetValue: { color: "#0F172A", fontWeight: 980, fontSize: 13, textAlign: "right" },
  sep: { height: 1, background: "#E7E9F2" },

  rejectGrid: { marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 },
  rejectChip: {
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#F2F4FB",
    padding: "10px 12px",
    cursor: "pointer",
  },
  rejectChipSelected: { background: ACCENT, borderColor: ACCENT },
  rejectChipTxt: { color: "#0F172A", fontWeight: 800, fontSize: 13 },
  rejectChipTxtSelected: { color: "#fff" },

  textarea: {
    width: "100%",
    marginTop: 8,
    minHeight: 90,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
    color: "#0F172A",
    fontWeight: 850,
    outline: "none",
    resize: "vertical",
  },

  viewerBox: {
    width: "100%",
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 10,
  },
  viewerImg: { width: "100%", height: "60vh", objectFit: "contain", borderRadius: 12 },
  /** Factura: altura flexible para evitar doble scroll en el modal */
  viewerFacturaImg: {
    width: "100%",
    height: "auto",
    maxHeight: "min(65vh, 780px)",
    objectFit: "contain",
    borderRadius: 12,
    display: "block",
  },

  viewerAlbumWrap: {
    display: "flex",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  viewerAlbumMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerNavBtn: {
    width: 44,
    height: 44,
    padding: 0,
    flexShrink: 0,
    alignSelf: "center",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#F8FAFC",
    color: "#475569",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  },
  viewerNavBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },

  // Taskbar
  taskbar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, #fff 100%)",
    borderTop: "1px solid #E7E9F2",
    padding: "12px 16px",
    zIndex: 20,
    boxShadow: "0 -8px 32px rgba(15,23,42,0.06)",
  },
  taskbarInner: {
    width: "100%",
    maxWidth: 1120,
    marginLeft: "auto",
    marginRight: "auto",
    display: "flex",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  tbBtnPrimary: {
    flex: "1 1 160px",
    maxWidth: 320,
    borderRadius: 12,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 850,
    fontSize: 13,
    fontFamily: "inherit",
    boxShadow: "0 8px 20px rgba(8,159,138,0.22)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tbBtnSoft: {
    flex: "1 1 160px",
    maxWidth: 320,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#0F172A",
    padding: "12px 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tbBtnDisabled: { opacity: 0.55, cursor: "not-allowed" },

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

  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  photoThumbBtn: {
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    borderRadius: 16,
    padding: 8,
    cursor: "pointer",
  },
  photoThumbImg: {
    width: "100%",
    height: 140,
    objectFit: "cover",
    borderRadius: 12,
    display: "block",
  },

  link: { color: ACCENT, fontWeight: 950, textDecoration: "none" },
  valueText: { wordBreak: "break-word", whiteSpace: "pre-wrap" },

  chipWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  miniChip: {
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 900,
    fontSize: 12,
    color: "#0F172A",
  },

  // Form (como tu screenshot: label arriba, value abajo)
  modalGrid: { display: "grid", gap: 12 },
  formField: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: 12,
    display: "grid",
    gap: 8,
  },
  formLabel: {
    fontWeight: 950,
    color: "#0F172A",
  },
  formValue: {
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F1F5F9",
    padding: "12px 12px",
    fontWeight: 650,
    color: "#0F172A",
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    wordBreak: "break-word",
    fontSize: 14,
  },
};