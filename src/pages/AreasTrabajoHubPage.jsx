import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { AuthCtx } from "../auth/AuthProvider";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Cog,
  Copy,
  Home,
  Inbox,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  LogOut,
  Lock,
  Menu,
  Pin,
  Search,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { auth, db } from "../firebase";

import { isEpaRestrictedUser } from "../config/epaOnlyUids";
import {
  OT_DEPARTAMENTOS,
  OT_LUGARES_PROBLEMA,
  OT_TIPOS_PROBLEMA,
} from "../config/otOptions";
import { getVisibleAreas } from "../config/workAreas";
import { AreasSidebar, SidebarAreaIcon, TopbarAccount, BodegaSwitcher, openCommandPalette, useConfirm, useToast } from "../components/ui";
import {
  ACCENT,
  ACCENT_SHADOW,
  accentAlpha,
  BG,
  BORDER,
  FONT_STACK,
  MUTED,
  SLATE_DEEP,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../styles/theme";
import logoAppolo from "../assets/AppOLO_logo.png";
import imgApolo from "../assets/Apolo.png";

/* ─── Design tokens — thin adapter over the shared theme (src/styles/theme.js)
   so the hub stays visually in sync with the rest of the app from a single
   source of truth. Keys preserved to avoid churn across ~167 `T.` references.
   Only `accentDark`, `borderSoft` and the custom shadow stack have no theme
   token yet and remain literals. ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A", // darker brand shade — no theme token yet
  accentSoft: accentAlpha(0.1),
  accentGlow: ACCENT_SHADOW,
  bg: BG,
  surface: SURFACE,
  surfaceAlt: SURFACE_INSET,
  border: BORDER,
  borderSoft: "rgba(226, 232, 240, 0.7)", // translucent slate hairline
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  font: FONT_STACK,
};

/* Radial geometry (percentages relative to the wheel container / viewBox).
   Icons are centred in the band between the core and the outer rim. */
const RING_RADIUS = 33;
const WEDGE_RADIUS = 48; // normal wheel radius (base sectors / rim)
const ACTIVE_WEDGE_RADIUS = 58; // active sector grows beyond the base circle
const INNER_ACTIVE_RADIUS = 22; // inner edge of the active slice (aligns with the ring around the core)
const GRAY_ARC_RADIUS = 54; // grey arc inside the expanded sector, closer to the outer edge
const DASHED_ARC_RADIUS = 51; // dashed arc just before (inward of) the grey arc

/**
 * Fixed main menu of the wheel — 4 large actions, one per quadrant.
 * `angle` is in degrees on screen coords (0 = right, 90 = down). These are
 * intentionally NOT the work areas: the "Áreas" action opens a modal that lists
 * the work areas (Encarta-style lateral categories + dynamic central panel).
 */
const MENU_ACTIONS = [
  { key: "areas", title: "Áreas", icon: <LayoutGrid />, angle: 225, accent: "#00C3AE", soft: "rgba(0,195,174,0.12)" },
  { key: "pins", title: "Mis Pin", icon: <Pin />, angle: 315, accent: ACCENT, soft: accentAlpha(0.12) },
  { key: "reportes", title: "Reportes", icon: <BarChart3 />, angle: 135, accent: "#7C3AED", soft: "rgba(124,58,237,0.12)" },
  { key: "configuracion", title: "Configuración", icon: <Cog />, angle: 45, accent: "#EA580C", soft: "rgba(234,88,12,0.12)" },
];

/* ─── Assistant chat (mock / local — n8n wired in a later step) ─── */
const ASSISTANT_INTRO =
  "Hola, soy el asistente de AppoloDesk. Puedo ayudarte a consultar módulos, procesos y funcionamiento del sistema.";
const ASSISTANT_MOCK_REPLY =
  "Todavía estoy en modo de prueba. En el siguiente paso me conectaremos a n8n para responder con la documentación real de AppoloDesk.";
const ASSISTANT_SUGGESTIONS = [
  "¿Cómo uso las áreas?",
  "¿Qué puedo hacer en mantenimiento?",
  "¿Dónde veo reportes?",
  "Explicame el flujo general",
];
/* Human-readable labels for OT draft fields (used by the create_ot_draft card). */
const OT_FIELD_LABELS = {
  nombreOT: "Nombre de OT",
  activoReferencia: "Activo referencia",
  departamento: "Departamento",
  lugarProblema: "Lugar del problema",
  tipoProblema: "Tipo de problema",
  descripcionOT: "Descripción",
  notas: "Notas",
};
const OT_REQUIRED_FIELDS = [
  "nombreOT",
  "activoReferencia",
  "departamento",
  "lugarProblema",
  "tipoProblema",
  "descripcionOT",
];
const OT_SELECT_OPTIONS = {
  departamento: OT_DEPARTAMENTOS,
  lugarProblema: OT_LUGARES_PROBLEMA,
  tipoProblema: OT_TIPOS_PROBLEMA,
};
const OT_SELECT_FIELDS = Object.keys(OT_SELECT_OPTIONS);
const OT_PROBLEM_TYPE_RULES = [
  { value: "Puertas y portones", terms: ["porton", "portones", "puerta", "puertas", "cerradura"] },
  { value: "Goteras", terms: ["gotera", "goteras", "filtracion", "filtraciones", "agua cayendo"] },
  { value: "Techos", terms: ["techo", "techos", "cubierta", "lamina"] },
  { value: "Instalación eléctrica", terms: ["luz", "lampara", "apagado", "apagon", "toma", "breaker", "cableado", "electric"] },
  { value: "Cañerías", terms: ["tuberia", "tubo", "cano", "fuga de agua", "llave de agua", "lavamanos"] },
  { value: "Baños", terms: ["bano", "banos", "inodoro", "sanitario", "ducha", "urinario"] },
  { value: "Aire acondicionado", terms: ["aire acondicionado", "a/c", " ac ", "no enfria"] },
  { value: "Camaras / CCTV", terms: ["camara", "camaras", "cctv", "monitoreo"] },
  { value: "Racks", terms: ["rack", "racks", "estanteria"] },
  { value: "Andenes de carga", terms: ["anden", "andenes", "rampa de carga"] },
  { value: "Banda transportadora", terms: ["banda transportadora"] },
  { value: "Sistema de incendios", terms: ["extintor", "alarma", "detector", "rociador", "incendio"] },
  { value: "Pintura", terms: ["pintura", "pintar", "despintada", "retoque"] },
  { value: "Soldadura", terms: ["soldar", "soldadura", "pieza quebrada", "metalica"] },
  { value: "Control de plagas", terms: ["plaga", "plagas", "insecto", "insectos", "fumigacion"] },
];
const OT_DRAFT_READY_REPLY =
  "Ya tengo el borrador listo. En el siguiente paso voy a conectar la creación real de la OT.";
const OT_DRAFT_INVALID_REPLY =
  "Antes de crear la OT necesito que el borrador tenga datos válidos.\nElegí opciones oficiales en los campos pendientes para proteger las métricas.";
const OT_STATE_SOLICITADA = "Solicitada";

/* n8n webhook (optional). When absent, the chat falls back to a local mock. */
const ASSISTANT_WEBHOOK_URL = import.meta.env.VITE_ASSISTANT_WEBHOOK_URL;
const ASSISTANT_TIMEOUT_MS = 60000;
const ASSISTANT_ERROR_REPLY =
  "No pude conectar con el asistente en este momento. Podés intentar de nuevo en unos segundos.";
const ASSISTANT_TIMEOUT_REPLY =
  "El asistente tardó más de lo esperado en responder. Intentá de nuevo en unos segundos o hacé una pregunta más corta.";

/* Local conversation id (no deps). */
function newConversationId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `conv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cleanOtValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  return "";
}

function normalizeOtText(value) {
  return cleanOtValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findOfficialOtOption(field, value) {
  const options = OT_SELECT_OPTIONS[field];
  const clean = cleanOtValue(value);
  if (!options || !clean) return "";
  return options.find((opt) => opt === clean) || options.find((opt) => opt.toLowerCase() === clean.toLowerCase()) || "";
}

function isOtFieldComplete(field, draft) {
  const value = cleanOtValue(draft?.[field]);
  if (!value) return false;
  if (OT_SELECT_OPTIONS[field]) return Boolean(findOfficialOtOption(field, value));
  return true;
}

function getOtMissingFields(draft) {
  return OT_REQUIRED_FIELDS.filter((field) => !isOtFieldComplete(field, draft));
}

function inferOtTipoProblema(draft) {
  const current = findOfficialOtOption("tipoProblema", draft?.tipoProblema);
  if (current) return current;

  const haystack = normalizeOtText(
    [
      draft?.nombreOT,
      draft?.activoReferencia,
      draft?.descripcionOT,
      draft?.notas,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (!haystack) return "";
  return OT_PROBLEM_TYPE_RULES.find((rule) => rule.terms.some((term) => haystack.includes(term)))?.value || "";
}

function normalizeOtDraftAction(action) {
  if (!action || action.type !== "create_ot_draft") return action || null;
  if (action.status === "cancelled") return action;

  const draft = {
    ...(action.draft && typeof action.draft === "object" ? action.draft : {}),
  };

  OT_SELECT_FIELDS.forEach((field) => {
    const official = findOfficialOtOption(field, draft[field]);
    if (official) draft[field] = official;
  });

  if (!cleanOtValue(draft.tipoProblema)) {
    const inferredType = inferOtTipoProblema(draft);
    if (inferredType) draft.tipoProblema = inferredType;
  }

  const missingFields = getOtMissingFields(draft);
  return {
    ...action,
    status: missingFields.length > 0 ? "missing_fields" : "ready",
    draft,
    missingFields,
  };
}

function patchOtDraftAction(action, patch) {
  if (!action || action.type !== "create_ot_draft") return action;

  const draft = {
    ...(action.draft && typeof action.draft === "object" ? action.draft : {}),
    ...patch,
  };
  const missingFields = getOtMissingFields(draft);

  return {
    ...action,
    status: missingFields.length > 0 ? "missing_fields" : "ready",
    draft,
    missingFields,
  };
}

function buildOtDraftValidationReply(missingFields) {
  if (!missingFields.length) return OT_DRAFT_READY_REPLY;
  const list = missingFields
    .map((field, index) => `${index + 1}. ${OT_FIELD_LABELS[field] || field}`)
    .join("\n");
  return `${OT_DRAFT_INVALID_REPLY}\n${list}`;
}

function buildAssistantOtPayload({ draft, user, profile }) {
  const departamento = findOfficialOtOption("departamento", draft?.departamento);
  const lugarProblema = findOfficialOtOption("lugarProblema", draft?.lugarProblema);
  const tipoProblema = findOfficialOtOption("tipoProblema", draft?.tipoProblema);
  const NroSolicitud = `SOL-OT-${Date.now()}`;
  const createdByName =
    cleanOtValue(profile?.displayName) ||
    cleanOtValue(user?.displayName) ||
    cleanOtValue(user?.email) ||
    "Usuario";

  const payload = {
    solicitanteNombre: createdByName,
    solicitanteFicha: cleanOtValue(profile?.numeroFicha || profile?.ficha),
    fecha: todayISO(),
    nombreOT: cleanOtValue(draft?.nombreOT),
    activoReferencia: cleanOtValue(draft?.activoReferencia),

    departamento,
    departamentoBase: departamento,

    lugarProblema,
    lugarProblemaBase: lugarProblema,

    tipoProblema,
    tipoProblemaBase: tipoProblema,

    descripcionOT: cleanOtValue(draft?.descripcionOT),
    notas: cleanOtValue(draft?.notas),

    OTState: OT_STATE_SOLICITADA,
    NroSolicitud,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user?.uid || null,
    createdByName,
    createdArea: cleanOtValue(profile?.areaTrabajo),
  };

  const tenantId = cleanOtValue(profile?.tenantId);
  const company = cleanOtValue(profile?.company);
  if (tenantId && company) {
    payload.tenantId = tenantId;
    payload.company = company;
  }

  const bodegaId = cleanOtValue(profile?.bodegaId);
  const bodegaNombre = cleanOtValue(profile?.bodegaNombre);
  if (bodegaId) {
    payload.bodegaId = bodegaId;
    payload.bodegaNombre = bodegaNombre;
  }

  return payload;
}

/* Turn an area accent (hex) into a soft rgba tint — used to derive module colors. */
function hexToRgba(hex, alpha) {
  if (typeof hex !== "string" || !hex.startsWith("#")) return `rgba(8,159,138,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Convert a polar angle into the SVG arc endpoints of a sector wedge. */
function sectorPath(centerAngle, span, radius = WEDGE_RADIUS) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const x1 = 50 + radius * Math.cos(a1);
  const y1 = 50 + radius * Math.sin(a1);
  const x2 = 50 + radius * Math.cos(a2);
  const y2 = 50 + radius * Math.sin(a2);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M 50 50 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/* A single arc (no radial edges) at a given radius — used to echo the wheel's
   normal rim curvature inside the expanded active sector. */
function arcPath(centerAngle, span, radius) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const x1 = 50 + radius * Math.cos(a1);
  const y1 = 50 + radius * Math.sin(a1);
  const x2 = 50 + radius * Math.cos(a2);
  const y2 = 50 + radius * Math.sin(a2);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}

/* Annular ("donut slice") sector between innerR and outerR — used for the
   active piece so it reads as a grown chunk of the wheel without covering the
   centre. The stroke of this single path yields the outer arc, the inner arc
   and both radial edges at once. */
function annularSectorPath(centerAngle, span, innerR, outerR) {
  const a1 = centerAngle - span / 2;
  const a2 = centerAngle + span / 2;
  const ox1 = 50 + outerR * Math.cos(a1);
  const oy1 = 50 + outerR * Math.sin(a1);
  const ox2 = 50 + outerR * Math.cos(a2);
  const oy2 = 50 + outerR * Math.sin(a2);
  const ix2 = 50 + innerR * Math.cos(a2);
  const iy2 = 50 + innerR * Math.sin(a2);
  const ix1 = 50 + innerR * Math.cos(a1);
  const iy1 = 50 + innerR * Math.sin(a1);
  const largeArc = span > Math.PI ? 1 : 0;
  return (
    `M ${ox1.toFixed(3)} ${oy1.toFixed(3)} ` +
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2.toFixed(3)} ${oy2.toFixed(3)} ` +
    `L ${ix2.toFixed(3)} ${iy2.toFixed(3)} ` +
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1.toFixed(3)} ${iy1.toFixed(3)} Z`
  );
}

/* ─── A single fixed action placed radially on the wheel ─── */
/* Presentational only (pointerEvents: none). The hover/focus/click is handled
   by a large invisible quadrant hit area (QuadrantHit) so the user never has to
   aim precisely at the icon. This node just reflects `hovered`. */
function ActionNode({ action, x, y, delay, mounted, hovered, badge }) {
  const isHover = hovered === action.key;
  // Top quadrants show the tooltip above (outward), bottom quadrants below.
  const placeTop = y < 0;
  return (
    <div
      aria-hidden="true"
      style={{
        ...styles.nodeWrap,
        left: `calc(50% + ${x}%)`,
        top: `calc(50% + ${y}%)`,
        zIndex: isHover ? 9 : 6,
      }}
    >
      <div
        style={{
          ...styles.node,
          // Hover grows the whole node smoothly (transition lives on .node, no
          // delay); the mount stagger is handled by the entrance animation.
          transform: `scale(${isHover ? 1.1 : 1})`,
          animation: `hhNodeIn 480ms cubic-bezier(0.22,1,0.36,1) ${delay}ms backwards`,
        }}
      >
      <span
        style={{
          ...styles.nodeBtn,
          borderColor: isHover ? action.accent : T.border,
          background: isHover ? action.soft : T.surface,
          boxShadow: isHover ? `${T.shadowMd}, 0 0 0 4px ${action.soft}` : T.shadow,
        }}
      >
        <span style={{ ...styles.nodeIcon, background: isHover ? "transparent" : action.soft, color: action.accent }}>
          {React.cloneElement(action.icon, { size: "56%", strokeWidth: 2 })}
        </span>
        {badge != null && <span style={{ ...styles.nodeBadge, background: action.accent }}>{badge}</span>}
      </span>

      {/* floating tooltip — only visible on hover/focus, never shifts layout */}
      <span
        role="tooltip"
        style={{
          ...styles.nodeTip,
          ...(placeTop ? styles.nodeTipTop : styles.nodeTipBottom),
          background: action.accent,
          opacity: isHover ? 1 : 0,
          transform: `translateX(-50%) translateY(${isHover ? "0" : placeTop ? "4px" : "-4px"})`,
        }}
      >
        {action.title}
      </span>
      </div>
    </div>
  );
}

/* ─── Areas modal (lateral categories + dynamic central panel) ─── */
function AreasModal({ areas, onClose, onNavigate, onComingSoon }) {
  const [activeKey, setActiveKey] = useState(areas[0]?.key ?? null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = useMemo(
    () => areas.find((a) => a.key === activeKey) || areas[0] || null,
    [areas, activeKey]
  );
  const accent = active?.theme?.accent || T.accent;

  const half = Math.ceil(areas.length / 2);
  const leftAreas = areas.slice(0, half);
  const rightAreas = areas.slice(half);

  // Navigate (or open the coming-soon dialog) and close the modal.
  const openArea = (area) => {
    if (area.blocked) return;
    onClose();
    if (area.comingSoon) onComingSoon(area);
    else onNavigate(area.path);
  };
  const go = (path) => {
    onClose();
    onNavigate(path);
  };

  const renderCard = (area) => {
    const isActive = area.key === active?.key;
    const ac = area.theme?.accent || T.accent;
    const blocked = area.blocked === true;
    return (
      <button
        key={area.key}
        type="button"
        className="hh-area-card"
        onClick={() => openArea(area)}
        onMouseEnter={() => {
          if (area.key !== activeKey) setActiveKey(area.key);
        }}
        onFocus={() => {
          if (area.key !== activeKey) setActiveKey(area.key);
        }}
        aria-label={`Ver área ${area.title}`}
        style={{
          ...styles.areaCard,
          borderColor: isActive ? ac : T.border,
          background: isActive ? hexToRgba(ac, 0.08) : T.surface,
          boxShadow: isActive ? `0 6px 18px ${hexToRgba(ac, 0.18)}` : T.shadow,
          opacity: blocked ? 0.6 : 1,
        }}
      >
        <span style={{ ...styles.areaCardIcon, background: hexToRgba(ac, 0.12), color: ac }}>
          {area.img ? (
            <img src={area.img} alt="" style={styles.areaCardImg} draggable={false} />
          ) : React.isValidElement(area.icon) ? (
            React.cloneElement(area.icon, { size: 20, strokeWidth: 2 })
          ) : (
            area.icon
          )}
        </span>
        <span style={{ ...styles.areaCardTitle, color: isActive ? ac : T.text }}>{area.title}</span>
        {blocked ? (
          <Lock size={14} strokeWidth={2.2} style={{ marginLeft: "auto", color: T.textMuted, flexShrink: 0 }} />
        ) : (
          <ChevronRight
            size={16}
            strokeWidth={2.2}
            style={{ marginLeft: "auto", color: isActive ? ac : T.textMuted, flexShrink: 0 }}
          />
        )}
      </button>
    );
  };

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div
        className="hh-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Áreas de trabajo"
        onClick={(e) => e.stopPropagation()}
        style={{ ...styles.modal, borderTop: `4px solid ${accent}` }}
      >
        {/* Header */}
        <div style={styles.modalHead}>
          <div style={styles.modalHeadTitle}>
            <span style={{ ...styles.modalHeadIcon, background: hexToRgba(accent, 0.12), color: accent }}>
              <LayoutGrid size={18} strokeWidth={2.2} />
            </span>
            <div>
              <div style={styles.modalTitle}>Áreas de trabajo</div>
              <div style={styles.modalSubtitle}>Seleccioná un área para comenzar</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal" style={styles.modalClose}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {areas.length === 0 ? (
          <div style={styles.modalEmpty}>
            <span style={styles.modalEmptyIcon}>
              <Inbox size={28} strokeWidth={1.8} />
            </span>
            <div style={styles.modalEmptyTitle}>No hay áreas disponibles</div>
            <div style={styles.modalEmptyDesc}>Tu usuario no tiene áreas asignadas por el momento.</div>
          </div>
        ) : (
          <div className="hh-modal-body">
            {/* Left categories */}
            <div className="hh-modal-side">{leftAreas.map(renderCard)}</div>

            {/* Central panel */}
            <div
              className="hh-modal-center"
              style={{
                ...styles.center,
                background: `linear-gradient(160deg, ${hexToRgba(accent, 0.07)} 0%, #fff 55%)`,
                borderColor: hexToRgba(accent, 0.25),
              }}
            >
              {active && (
                <div key={active.key} style={styles.centerInner}>
                  <div style={styles.centerHero}>
                    <span style={{ ...styles.centerIcon, background: hexToRgba(accent, 0.14), color: accent }}>
                      {active.img ? (
                        <img src={active.img} alt="" style={styles.centerImg} draggable={false} />
                      ) : React.isValidElement(active.icon) ? (
                        React.cloneElement(active.icon, { size: 30, strokeWidth: 1.9 })
                      ) : (
                        active.icon
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      {active.tag && (
                        <span style={{ ...styles.centerTag, background: hexToRgba(accent, 0.12), color: accent }}>
                          {active.tag}
                        </span>
                      )}
                      <h3 style={styles.centerTitle}>{active.title}</h3>
                    </div>
                  </div>

                  <p style={styles.centerDesc}>{active.desc}</p>

                  <button
                    type="button"
                    onClick={() => openArea(active)}
                    disabled={active.blocked}
                    aria-label={`Abrir área ${active.title}`}
                    style={{
                      ...styles.centerCta,
                      background: active.blocked ? T.textMuted : accent,
                      boxShadow: active.blocked ? "none" : `0 8px 20px ${hexToRgba(accent, 0.3)}`,
                      cursor: active.blocked ? "not-allowed" : "pointer",
                    }}
                  >
                    <span>
                      {active.blocked ? "No disponible" : active.comingSoon ? "Ver detalle" : `Abrir ${active.title}`}
                    </span>
                    {!active.blocked && <ArrowRight size={16} strokeWidth={2.4} />}
                  </button>

                  <div style={styles.modulesWrap}>
                    {active.modules && active.modules.length > 0 ? (
                      active.modules.map((m, i) => (
                        <div key={m.path || m.label} style={styles.modBlock}>
                          <button
                            type="button"
                            className="hh-mod-btn"
                            onClick={() => m.path && go(m.path)}
                            disabled={!m.path}
                            aria-label={`Abrir ${m.label}`}
                            style={{
                              ...styles.modBtn,
                              background: hexToRgba(accent, 0.09 + (i % 3) * 0.03),
                              borderColor: hexToRgba(accent, 0.22),
                              cursor: m.path ? "pointer" : "default",
                            }}
                          >
                            <span style={{ ...styles.modDot, background: accent }} />
                            <span style={styles.modLabel}>{m.label}</span>
                            {m.path && <ChevronRight size={15} strokeWidth={2.2} style={{ color: accent, flexShrink: 0 }} />}
                          </button>
                          {m.features && m.features.length > 0 && (
                            <div style={styles.featuresRow}>
                              {m.features.map((f) => (
                                <button
                                  key={f.path || f.label}
                                  type="button"
                                  onClick={() => f.path && go(f.path)}
                                  aria-label={`Abrir ${f.label}`}
                                  style={{ ...styles.featureChip, borderColor: hexToRgba(accent, 0.28), color: accent }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={styles.modEmpty}>
                        {active.comingSoon ? "Disponible próximamente." : "Sin módulos por ahora."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right categories */}
            <div className="hh-modal-side">{rightAreas.map(renderCard)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Assistant chat window (mock responses) ─── */
/* Visual card for action.type === "create_ot_draft". Renders the filled draft
   fields + official selectors for metric-sensitive fields; never shows raw JSON. */
function OtDraftCard({ action, creating, onCreate, onCompleteByChat, onDraftFieldChange }) {
  if (!action || action.type !== "create_ot_draft") return null;

  const draft = action.draft && typeof action.draft === "object" ? action.draft : {};
  const computedMissing = getOtMissingFields(draft);
  const missing = Array.from(new Set([...(Array.isArray(action.missingFields) ? action.missingFields : []), ...computedMissing]))
    .filter((key) => OT_REQUIRED_FIELDS.includes(key) && !isOtFieldComplete(key, draft));
  const isCancelled = action.status === "cancelled";
  const isCreated = action.status === "created";
  const isReady = !isCancelled && !isCreated && missing.length === 0;

  // Filled fields: keep the documented field order, only those with a value.
  const filled = Object.keys(OT_FIELD_LABELS)
    .filter((key) => !OT_SELECT_FIELDS.includes(key))
    .map((key) => [key, draft[key]])
    .filter(([, value]) => typeof value === "string" && value.trim());

  return (
    <div style={styles.otCard}>
      <div style={styles.otCardHead}>
        <span style={styles.otCardTitle}>Borrador de OT</span>
        <span
          style={{
            ...styles.otStatus,
            ...(isCancelled || isCreated ? styles.otStatusCancelled : isReady ? styles.otStatusReady : styles.otStatusMissing),
          }}
        >
          {isCancelled ? "Cancelado" : isCreated ? "Creada" : isReady ? "Listo para crear" : "Faltan datos"}
        </span>
      </div>

      {filled.length > 0 && (
        <div style={styles.otFields}>
          {filled.map(([key, value]) => (
            <div key={key} style={styles.otField}>
              <span style={styles.otFieldLabel}>{OT_FIELD_LABELS[key]}</span>
              <span style={styles.otFieldValue}>{value.trim()}</span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.otSelectPanel}>
        <div style={styles.otSelectPanelTitle}>Campos para métricas</div>
        <div style={styles.otSelectGrid}>
          {OT_SELECT_FIELDS.map((field) => {
            const rawValue = cleanOtValue(draft[field]);
            const selectedValue = findOfficialOtOption(field, rawValue);
            const hasInvalidSuggestion = rawValue && !selectedValue;
            return (
              <label key={field} style={styles.otSelectField}>
                <span style={styles.otFieldLabel}>{OT_FIELD_LABELS[field]}</span>
                <select
                  value={selectedValue}
                  onChange={(e) => onDraftFieldChange?.(field, e.target.value)}
                  style={{
                    ...styles.otSelect,
                    ...(missing.includes(field) ? styles.otSelectMissing : null),
                  }}
                  disabled={isCancelled}
                >
                  <option value="">Seleccionar opción oficial</option>
                  {OT_SELECT_OPTIONS[field].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {hasInvalidSuggestion && (
                  <span style={styles.otInvalidHint}>
                    Detectado: {rawValue}. Elegí una opción oficial para no afectar métricas.
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {!isReady && missing.length > 0 && (
        <div style={styles.otPending}>
          <span style={styles.otPendingLabel}>Pendiente</span>
          <div style={styles.otPendingChips}>
            {missing.map((key) => (
              <span key={key} style={styles.otPendingChip}>
                {OT_FIELD_LABELS[key] || key}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isCancelled && !isCreated && (
        <div style={styles.otActions}>
          {isReady ? (
            <button
              type="button"
              className="hh-msg-chip"
              onClick={() => onCreate?.(action)}
              disabled={creating}
              style={{ ...styles.otBtnPrimary, opacity: creating ? 0.65 : 1, cursor: creating ? "not-allowed" : "pointer" }}
            >
              {creating ? "Creando..." : "Crear OT"}
            </button>
          ) : (
            <button type="button" className="hh-msg-chip" onClick={onCompleteByChat} style={styles.otBtnSecondary}>
              Completar por chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantChat({ phase, messages, input, setInput, typing, creatingOt, onSend, onClear, onClose, onAction, onCopied, onCreateOtDraft, onUpdateOtDraft }) {
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyMsg = (i, text) => {
    const value = (text || "").trim();
    if (!value) return;
    try {
      navigator.clipboard?.writeText(value);
    } catch {
      /* clipboard not available */
    }
    setCopiedIdx(i);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedIdx(null), 1200);
    onCopied?.();
  };

  // Auto-scroll to the latest message / typing indicator.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Focus the textarea when the chat opens and after the bot finishes replying.
  useEffect(() => {
    if (phase === "chat" && !typing && taRef.current) taRef.current.focus();
  }, [phase, typing]);

  const focusInput = () => taRef.current?.focus();

  const canSend = input.trim().length > 0 && !typing;

  const submit = () => {
    if (!canSend) return; // ignore while empty or while the bot is responding
    onSend(input.trim());
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const showSuggestions = messages.length <= 1;

  return (
    <div
      role="dialog"
      aria-label="Asistente AppoloDesk"
      style={{
        ...styles.chat,
        animation:
          phase === "chatOut"
            ? "hhChatOut 240ms ease forwards"
            : "hhChatIn 320ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* Header */}
      <div style={styles.chatHeader}>
        <div style={styles.chatHeaderLeft}>
          <span style={styles.chatHeaderIcon}>
            <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={styles.chatTitle}>Asistente AppoloDesk</div>
            <div style={styles.chatSubtitle}>Consultá procesos, módulos y funcionamiento</div>
          </div>
        </div>
        <div style={styles.chatHeaderActions}>
          <button
            type="button"
            onClick={onClear}
            disabled={messages.length <= 1 && !typing}
            aria-label="Limpiar chat"
            title="Limpiar chat"
            style={{
              ...styles.chatClose,
              opacity: messages.length <= 1 && !typing ? 0.45 : 1,
              cursor: messages.length <= 1 && !typing ? "not-allowed" : "pointer",
            }}
          >
            <Trash2 size={17} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={onClose} aria-label="Cerrar asistente" style={styles.chatClose}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={styles.chatBody}>
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const actions = !isUser && Array.isArray(m.suggestedActions) ? m.suggestedActions.filter((a) => a && a.path) : [];
          const sources = !isUser && Array.isArray(m.sources)
            ? m.sources.map((s) => (s && (s.title || s.ref)) || "").filter(Boolean)
            : [];
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredMsg(i)}
              onMouseLeave={() => setHoveredMsg((cur) => (cur === i ? null : cur))}
              style={{
                ...styles.msgRow,
                justifyContent: isUser ? "flex-end" : "flex-start",
                animation: "hhMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both",
              }}
            >
              {!isUser && (
                <span style={styles.msgAvatar}>
                  <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
                </span>
              )}
              <div style={{ ...styles.msgCol, alignItems: isUser ? "flex-end" : "flex-start" }}>
                <div style={styles.bubbleWrap}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => copyMsg(i, m.text)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copyMsg(i, m.text)}
                    title="Copiar mensaje"
                    style={{ ...(isUser ? styles.bubbleUser : styles.bubbleBot), cursor: "pointer" }}
                  >
                    {m.text}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyMsg(i, m.text)}
                    aria-label="Copiar mensaje"
                    title={copiedIdx === i ? "Copiado" : "Copiar"}
                    style={{
                      ...styles.copyBtn,
                      ...(isUser ? styles.copyBtnUser : styles.copyBtnBot),
                      opacity: hoveredMsg === i ? 1 : 0,
                      pointerEvents: hoveredMsg === i ? "auto" : "none",
                    }}
                  >
                    {copiedIdx === i ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} strokeWidth={2.2} />}
                  </button>
                </div>

                {actions.length > 0 && (
                  <div style={styles.msgActions}>
                    {actions.map((a, idx) => (
                      <button key={idx} type="button" className="hh-msg-chip" onClick={() => onAction(a.path)} style={styles.msgActionChip}>
                        {a.label || a.path}
                      </button>
                    ))}
                  </div>
                )}

                {!isUser && m.action && m.action.type === "create_ot_draft" && (
                  <OtDraftCard
                    action={m.action}
                    creating={creatingOt}
                    onCreate={(nextAction) => onCreateOtDraft?.(i, nextAction)}
                    onCompleteByChat={focusInput}
                    onDraftFieldChange={(field, value) => onUpdateOtDraft?.(i, field, value)}
                  />
                )}

                {sources.length > 0 && (
                  <div style={styles.msgSources}>Fuentes: {sources.join(" · ")}</div>
                )}
              </div>
            </div>
          );
        })}

        {typing && (
          <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
            <span style={styles.msgAvatar}>
              <img src={imgApolo} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} draggable={false} />
            </span>
            <div style={styles.typingBubble}>
              <span style={{ ...styles.typingDot, animationDelay: "0ms" }} />
              <span style={{ ...styles.typingDot, animationDelay: "150ms" }} />
              <span style={{ ...styles.typingDot, animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {showSuggestions && (
          <div style={styles.suggWrap}>
            <div style={styles.suggLabel}>Sugerencias</div>
            <div style={styles.suggRow}>
              {ASSISTANT_SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="hh-sugg-chip" onClick={() => onSend(s)} style={styles.suggChip}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={styles.chatInputBar}>
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Escribí tu consulta…"
          style={styles.chatTextarea}
          aria-label="Mensaje para el asistente"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Enviar mensaje"
          style={{ ...styles.chatSend, opacity: canSend ? 1 : 0.45, cursor: canSend ? "pointer" : "not-allowed" }}
        >
          <Send size={30} strokeWidth={2.2} style={{ width: 30, height: 30 }} />
        </button>
      </div>
    </div>
  );
}

export default function AreasTrabajoHubPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { profile, epaAdmin, role, permisos, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const confirm = useConfirm();
  const toast = useToast();
  const [hovered, setHovered] = useState(null);
  const [busyLogout, setBusyLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPins, setSidebarPins] = useState(false); // open sidebar directly on "Mis Pin"
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [comingSoonArea, setComingSoonArea] = useState(null);
  const [areasModalOpen, setAreasModalOpen] = useState(false);

  // Assistant chat (mock). Phase drives the menu -> chat transition.
  // "menu" | "menuOut" | "chat" | "chatOut"
  const [assistantPhase, setAssistantPhase] = useState("menu");
  const [assistantMessages, setAssistantMessages] = useState([{ role: "assistant", text: ASSISTANT_INTRO }]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [assistantCreatingOt, setAssistantCreatingOt] = useState(false);
  const [assistantConvId, setAssistantConvId] = useState(() => newConversationId());
  const assistantTimers = useRef([]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = T.bg;
    document.body.style.margin = "0";

    requestAnimationFrame(() => setMounted(true));

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  const go = (path) => nav(path);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });

  const areas = useMemo(
    () => getVisibleAreas({ epaOnly, role, permisos, profile }),
    [epaOnly, role, permisos, profile]
  );

  const term = query.trim().toLowerCase();

  // Flat list of matching submodules when searching (secondary panel).
  const filteredSubModules = useMemo(() => {
    if (!term) return [];
    const results = [];
    areas.forEach((a) => {
      if (a.blocked) return;
      const titleMatch = a.title.toLowerCase().includes(term);
      (a.subModules || []).forEach((sub) => {
        if (titleMatch || sub.label.toLowerCase().includes(term)) {
          results.push({ ...sub, parentTitle: a.title, parentImg: a.img, parentIcon: a.icon, parentKey: a.key });
        }
      });
    });
    return results;
  }, [areas, term]);

  /* Central dispatcher for the fixed wheel actions. */
  const handleMenuAction = (key) => {
    switch (key) {
      case "areas":
        setAreasModalOpen(true);
        break;
      case "pins":
        setSidebarPins(true);
        setSidebarOpen(true);
        break;
      case "configuracion":
        nav("/config-region");
        break;
      case "reportes":
        nav("/areas");
        break;
      default:
        break;
    }
  };

  /* Clear any pending assistant timers on unmount. */
  useEffect(() => () => assistantTimers.current.forEach((t) => clearTimeout(t)), []);

  /* Menu -> chat: animate the wheel out, then mount the chat. */
  const openAssistant = () => {
    setAssistantPhase("menuOut");
    const t = setTimeout(() => setAssistantPhase("chat"), 280);
    assistantTimers.current.push(t);
  };

  /* Chat -> menu: animate the chat out, then bring the wheel back. */
  const closeAssistant = () => {
    setAssistantPhase("chatOut");
    const t = setTimeout(() => setAssistantPhase("menu"), 240);
    assistantTimers.current.push(t);
  };

  /* Reset the conversation back to the intro message (after confirmation). */
  const clearAssistant = async () => {
    const ok = await confirm({
      title: "Limpiar chat",
      message: "¿Deseás limpiar el chat? Esta acción es permanente.",
      confirmText: "Limpiar",
      tone: "danger",
    });
    if (!ok) return;
    assistantTimers.current.forEach((t) => clearTimeout(t));
    assistantTimers.current = [];
    setAssistantTyping(false);
    setAssistantCreatingOt(false);
    setAssistantInput("");
    setAssistantMessages([{ role: "assistant", text: ASSISTANT_INTRO }]);
    setAssistantConvId(newConversationId());
  };

  const updateAssistantOtDraft = (messageIndex, field, value) => {
    setAssistantMessages((prev) =>
      prev.map((message, index) => {
        if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
        return {
          ...message,
          action: patchOtDraftAction(message.action, { [field]: value }),
        };
      })
    );
  };

  const requestAssistantOtCreate = async (messageIndex, action) => {
    if (assistantCreatingOt) return;

    const normalizedAction = normalizeOtDraftAction(action);
    const draft = normalizedAction?.draft || {};
    const missingFields = getOtMissingFields(draft);

    const updateDraftMessage = (nextAction) => {
      setAssistantMessages((prev) =>
        prev.map((message, index) => {
          if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
          return {
            ...message,
            action: nextAction,
          };
        })
      );
    };

    if (missingFields.length > 0) {
      const reply = buildOtDraftValidationReply(missingFields);
      setAssistantMessages((prev) => {
        const next = prev.map((message, index) => {
          if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
          return {
            ...message,
            action: normalizedAction,
          };
        });

        return [...next, { role: "assistant", text: reply }];
      });
      return;
    }

    if (!user?.uid) {
      setAssistantMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "No pude crear la OT porque no encontré una sesión activa. Volvé a iniciar sesión e intentá de nuevo.",
        },
      ]);
      return;
    }

    try {
      setAssistantCreatingOt(true);
      updateDraftMessage(normalizedAction);

      const payload = buildAssistantOtPayload({ draft, user, profile });
      const docRef = await addDoc(collection(db, "solicitudesOT"), payload);
      const createdAction = {
        ...normalizedAction,
        status: "created",
        createdId: docRef.id,
        createdNroSolicitud: payload.NroSolicitud,
      };

      setAssistantMessages((prev) => {
        const next = prev.map((message, index) => {
          if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
          return {
            ...message,
            action: createdAction,
          };
        });

        return [
          ...next,
          {
            role: "assistant",
            text: `OT creada correctamente.\n1. Solicitud: ${payload.NroSolicitud}\n2. Nombre: ${payload.nombreOT}\n3. Estado: ${OT_STATE_SOLICITADA}`,
            suggestedActions: [
              { label: "Gestión de OTs", path: "/mantenimiento/OTsPage" },
              { label: "OTs Servicios Generales", path: "/servicios-generales/ordenes-trabajo/gestion" },
            ],
          },
        ];
      });
      toast.success("Solicitud OT creada correctamente.");
    } catch (err) {
      console.error("assistant create OT", err);
      setAssistantMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "No pude crear la OT en este momento. Revisá permisos o intentá de nuevo en unos segundos.",
        },
      ]);
      toast.error("No se pudo crear la solicitud OT.");
    } finally {
      setAssistantCreatingOt(false);
    }
  };

  /* Send a message: POST to the n8n webhook when configured, otherwise reply
     with the local mock. Always pushes the user message and toggles typing. */
  const sendAssistant = (text) => {
    const clean = (text || "").trim();
    if (!clean) return;

    const userMsg = { role: "user", text: clean };
    setAssistantMessages((prev) => [...prev, userMsg]);
    setAssistantInput("");
    setAssistantTyping(true);

    // Fallback mock when no webhook is configured.
    if (!ASSISTANT_WEBHOOK_URL) {
      const t = setTimeout(() => {
        setAssistantTyping(false);
        setAssistantMessages((prev) => [...prev, { role: "assistant", text: ASSISTANT_MOCK_REPLY }]);
      }, 900);
      assistantTimers.current.push(t);
      return;
    }

    // Recent history (lightweight) + the new user message.
    const history = [...assistantMessages, userMsg]
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text, action: m.action || null }));

    const payload = {
      userMessage: clean,
      userId: user?.uid || null,
      tenantId: profile?.tenantId || null,
      company: profile?.company || null,
      bodegaId: profile?.bodegaId || null,
      bodegaNombre: profile?.bodegaNombre || null,
      role: role || null,
      permisos: permisos || {},
      epaAdmin: !!epaAdmin,
      currentRoute: location.pathname,
      conversationId: assistantConvId,
      history,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
    assistantTimers.current.push(timeoutId);

    fetch(ASSISTANT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        clearTimeout(timeoutId);
        // n8n webhooks sometimes wrap the result in an array.
        const data = Array.isArray(raw) ? raw[0] || {} : raw || {};
        const answer =
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer.trim()
            : "Recibí tu mensaje, pero no obtuve una respuesta válida.";
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const suggestedActions = Array.isArray(data.suggestedActions) ? data.suggestedActions : [];
        const action = normalizeOtDraftAction(data.action && typeof data.action === "object" ? data.action : null);
        setAssistantTyping(false);
        setAssistantMessages((prev) => [...prev, { role: "assistant", text: answer, sources, suggestedActions, action }]);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        setAssistantTyping(false);
        setAssistantMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: err?.name === "AbortError" ? ASSISTANT_TIMEOUT_REPLY : ASSISTANT_ERROR_REPLY,
          },
        ]);
      });
  };

  /* Pre-compute radial coordinates + sector wedges for the 4 fixed actions. */
  const { nodes, wedges } = useMemo(() => {
    const span = (2 * Math.PI) / MENU_ACTIONS.length; // 90° quadrants
    const nodes = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return { action, x: RING_RADIUS * Math.cos(ang), y: RING_RADIUS * Math.sin(ang) };
    });
    const wedges = MENU_ACTIONS.map((action) => {
      const ang = (action.angle * Math.PI) / 180;
      return {
        key: action.key,
        accent: action.accent,
        soft: action.soft,
        d: sectorPath(ang, span),
        dActive: annularSectorPath(ang, span, INNER_ACTIVE_RADIUS, ACTIVE_WEDGE_RADIUS),
        dArc: arcPath(ang, span, GRAY_ARC_RADIUS),
        dDash: arcPath(ang, span, DASHED_ARC_RADIUS),
      };
    });
    return { nodes, wedges };
  }, []);

  return (
    <div style={styles.shell} onClick={() => setHovered(null)}>
      <style>{cssAnimations}</style>

      {/* ─── Shared global sidebar drawer ─── */}
      <AreasSidebar
        open={sidebarOpen}
        openPins={sidebarPins}
        onClose={() => {
          setSidebarOpen(false);
          setSidebarPins(false);
        }}
      />

      {/* ─── Header ─── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={styles.menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div
            style={styles.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/areas")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/areas")}
          >
            <div style={styles.brandIcon}>
              <LayoutDashboard size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div className="hh-brand-text">
              <div style={styles.brandName}>AppoloDesk</div>
              <div style={styles.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={styles.headerActions}>
            <div style={styles.userPill}>
              <div style={styles.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span className="hh-userpill-name" style={styles.userPillName}>
                {user?.displayName || user?.email?.split("@")[0] || "Usuario"}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{ ...styles.logoutBtn, ...(busyLogout ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              {busyLogout ? (
                <Loader2 size={16} strokeWidth={2.2} style={{ animation: "homeSpin 0.7s linear infinite" }} />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>

        {/* Sub-bar: breadcrumb + tenant info */}
        <div style={styles.headerSubBar}>
          <div style={styles.headerSubBarInner}>
            <span style={styles.headerSubBarHome}>
              <Home size={13} strokeWidth={2.4} style={{ color: T.textMuted }} />
              <span style={{ fontSize: 12, fontWeight: 750, color: T.textSecondary }}>Inicio</span>
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {(profile?.tenantId || profile?.company) && (
                <div style={styles.tenantBadge}>
                  {profile.tenantId && <span style={styles.tenantPrimary}>{profile.tenantId}</span>}
                  {profile.tenantId && profile.company && <span style={styles.tenantSep}>·</span>}
                  {profile.company && <span style={styles.tenantSecondary}>{profile.company}</span>}
                </div>
              )}
              <BodegaSwitcher />
              <button
                type="button"
                onClick={openCommandPalette}
                style={styles.searchTrigger}
                title="Buscar y navegar"
                aria-label="Buscar y navegar"
              >
                <Search size={14} strokeWidth={2.3} />
                <span>Buscar</span>
                <span style={styles.searchKbd}>Ctrl K</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main style={styles.main}>
        <div style={styles.container}>
          {/* Hero (above the wheel) */}
          <section
            style={{
              ...styles.hero,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div style={styles.heroText}>
              <div style={styles.greetingChip}>
                <span style={styles.greetingDot} />
                <span>{greeting}</span>
              </div>
              <h1 style={styles.heroTitle}>{user?.displayName || "Operador"}</h1>
              <p style={styles.heroSubtitle}>
                Tu plataforma operativa. Elegí una opción para comenzar.
              </p>
            </div>

            <div style={styles.heroRight}>
              <img src={logoAppolo} alt="AppOLO Desk" style={styles.heroLogo} draggable={false} />
              <div style={{ ...styles.searchWrap, ...(searchFocus ? styles.searchWrapFocus : {}) }}>
                <Search size={17} strokeWidth={2.2} color={searchFocus ? T.accent : T.textMuted} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setSearchFocus(false)}
                  placeholder="Buscar área o sección…"
                  style={styles.searchInput}
                  aria-label="Buscar área"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} style={styles.searchClear} aria-label="Limpiar búsqueda">
                    <X size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Search results panel (secondary) OR the circular menu (default) */}
          {term ? (
            <section
              style={{
                ...styles.resultsSection,
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Resultados de búsqueda</h2>
                <button type="button" onClick={() => setQuery("")} style={styles.linkBtn}>
                  Volver al menú
                </button>
              </div>

              {filteredSubModules.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>
                    <Search size={22} strokeWidth={2} color={T.textMuted} />
                  </div>
                  <div style={styles.emptyTitle}>Sin resultados</div>
                  <div style={styles.emptyText}>No encontramos áreas ni secciones para “{query}”.</div>
                  <button type="button" onClick={() => setQuery("")} style={styles.emptyBtn}>
                    Limpiar búsqueda
                  </button>
                </div>
              ) : (
                <div style={styles.resultsGrid}>
                  {filteredSubModules.map((sub) => (
                    <div
                      key={`${sub.parentKey}:${sub.path}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => go(sub.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") go(sub.path);
                      }}
                      onMouseEnter={() => setHovered("sub-" + sub.path)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        ...styles.subModuleRow,
                        ...(hovered === "sub-" + sub.path ? styles.subModuleRowHover : {}),
                      }}
                    >
                      <SidebarAreaIcon img={sub.parentImg} fallback={sub.parentIcon} />
                      <div style={styles.subModuleInfo}>
                        <span style={styles.subModuleLabel}>{sub.label}</span>
                        <span style={styles.subModuleParent}>{sub.parentTitle}</span>
                      </div>
                      <ArrowRight
                        size={14}
                        strokeWidth={2.2}
                        color={hovered === "sub-" + sub.path ? T.accent : T.textMuted}
                        style={{ transition: "color 150ms ease" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section style={styles.areasSection} onClick={(e) => e.stopPropagation()}>
              <div style={styles.areasPanelHead}>
                <div style={styles.areasPanelHeadTitle}>
                  <span style={{ ...styles.areasPanelHeadIcon, background: `rgba(0,195,174,0.12)`, color: "#00C3AE" }}>
                    <LayoutGrid size={18} strokeWidth={2.2} />
                  </span>
                  <div>
                    <div style={styles.areasPanelTitle}>Áreas de trabajo</div>
                    <div style={styles.areasPanelSubtitle}>Seleccioná un área para comenzar</div>
                  </div>
                </div>
              </div>

              {areas.length === 0 ? (
                <div style={styles.areasPanelEmpty}>
                  <Inbox size={28} strokeWidth={1.8} color={T.textMuted} />
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>No hay áreas disponibles</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.textMuted }}>Tu usuario no tiene áreas asignadas por el momento.</div>
                </div>
              ) : (
                <div className="hh-areas-grid">
                  {/* Left column */}
                  <div className="hh-areas-side">
                    {areas.slice(0, Math.ceil(areas.length / 2)).map((area) => {
                      const isActive = area.key === hovered;
                      const ac = area.theme?.accent || T.accent;
                      const blocked = area.blocked === true;
                      return (
                        <button
                          key={area.key}
                          type="button"
                          className="hh-area-card"
                          onClick={() => {
                            if (blocked) return;
                            if (area.comingSoon) setComingSoonArea(area);
                            else nav(area.path);
                          }}
                          onMouseEnter={() => setHovered(area.key)}
                          onFocus={() => setHovered(area.key)}
                          aria-label={`Ver área ${area.title}`}
                          style={{
                            ...styles.areaCard,
                            borderColor: isActive ? ac : T.border,
                            background: isActive ? hexToRgba(ac, 0.08) : T.surface,
                            boxShadow: isActive ? `0 6px 18px ${hexToRgba(ac, 0.18)}` : T.shadow,
                            opacity: blocked ? 0.6 : 1,
                          }}
                        >
                          <span style={{ ...styles.areaCardIcon, background: hexToRgba(ac, 0.12), color: ac }}>
                            {area.img ? (
                              <img src={area.img} alt="" style={styles.areaCardImg} draggable={false} />
                            ) : React.isValidElement(area.icon) ? (
                              React.cloneElement(area.icon, { size: 20, strokeWidth: 2 })
                            ) : (area.icon)}
                          </span>
                          <span style={{ ...styles.areaCardTitle, color: isActive ? ac : T.text }}>{area.title}</span>
                          {blocked ? (
                            <Lock size={14} strokeWidth={2.2} style={{ marginLeft: "auto", color: T.textMuted, flexShrink: 0 }} />
                          ) : (
                            <ChevronRight size={16} strokeWidth={2.2} style={{ marginLeft: "auto", color: isActive ? ac : T.textMuted, flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Center detail panel */}
                  <div className="hh-areas-center" style={(() => {
                    const active = hovered ? areas.find((a) => a.key === hovered) : null;
                    const accent = active?.theme?.accent || T.accent;
                    return {
                      ...styles.center,
                      background: active
                        ? `linear-gradient(160deg, ${hexToRgba(accent, 0.07)} 0%, #fff 55%)`
                        : T.surface,
                      borderColor: active ? hexToRgba(accent, 0.25) : T.border,
                    };
                  })()}>
                    {(() => {
                      const active = hovered ? areas.find((a) => a.key === hovered) : null;
                      if (!active) {
                        // Default state: show the logo centered
                        return (
                          <div style={styles.centerPlaceholder}>
                            <img src={logoAppolo} alt="AppOLO Desk" style={styles.centerPlaceholderLogo} draggable={false} />
                            <span style={styles.centerPlaceholderText}>Pasá el cursor sobre un área para ver sus módulos</span>
                          </div>
                        );
                      }
                      const accent = active.theme?.accent || T.accent;
                      return (
                        <div key={active.key} style={styles.centerInner}>
                          <div style={styles.centerHero}>
                            <span style={{ ...styles.centerIcon, background: hexToRgba(accent, 0.14), color: accent }}>
                              {active.img ? (
                                <img src={active.img} alt="" style={styles.centerImg} draggable={false} />
                              ) : React.isValidElement(active.icon) ? (
                                React.cloneElement(active.icon, { size: 30, strokeWidth: 1.9 })
                              ) : (active.icon)}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              {active.tag && (
                                <span style={{ ...styles.centerTag, background: hexToRgba(accent, 0.12), color: accent }}>
                                  {active.tag}
                                </span>
                              )}
                              <h3 style={styles.centerTitle}>{active.title}</h3>
                            </div>
                          </div>
                          <p style={styles.centerDesc}>{active.desc}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (active.blocked) return;
                              if (active.comingSoon) setComingSoonArea(active);
                              else nav(active.path);
                            }}
                            disabled={active.blocked}
                            style={{
                              ...styles.centerCta,
                              background: active.blocked ? T.textMuted : accent,
                              boxShadow: active.blocked ? "none" : `0 8px 20px ${hexToRgba(accent, 0.3)}`,
                              cursor: active.blocked ? "not-allowed" : "pointer",
                            }}
                          >
                            <span>{active.blocked ? "No disponible" : active.comingSoon ? "Ver detalle" : `Abrir ${active.title}`}</span>
                            {!active.blocked && <ArrowRight size={16} strokeWidth={2.4} />}
                          </button>
                          <div style={styles.modulesWrap}>
                            {active.modules && active.modules.length > 0 ? (
                              active.modules.map((m, i) => (
                                <div key={m.path || m.label} style={styles.modBlock}>
                                  <button
                                    type="button"
                                    className="hh-mod-btn"
                                    onClick={() => m.path && nav(m.path)}
                                    disabled={!m.path}
                                    style={{ ...styles.modBtn, background: hexToRgba(accent, 0.09 + (i % 3) * 0.03), borderColor: hexToRgba(accent, 0.22), cursor: m.path ? "pointer" : "default" }}
                                  >
                                    <span style={{ ...styles.modDot, background: accent }} />
                                    <span style={styles.modLabel}>{m.label}</span>
                                    {m.path && <ChevronRight size={15} strokeWidth={2.2} style={{ color: accent, flexShrink: 0 }} />}
                                  </button>
                                  {m.features && m.features.length > 0 && (
                                    <div style={styles.featuresRow}>
                                      {m.features.map((f) => (
                                        <button key={f.path || f.label} type="button" onClick={() => f.path && nav(f.path)} style={{ ...styles.featureChip, borderColor: hexToRgba(accent, 0.28), color: accent }}>
                                          {f.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div style={styles.modEmpty}>{active.comingSoon ? "Disponible próximamente." : "Sin módulos por ahora."}</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right column */}
                  <div className="hh-areas-side">
                    {areas.slice(Math.ceil(areas.length / 2)).map((area) => {
                      const isActive = area.key === hovered;
                      const ac = area.theme?.accent || T.accent;
                      const blocked = area.blocked === true;
                      return (
                        <button
                          key={area.key}
                          type="button"
                          className="hh-area-card"
                          onClick={() => {
                            if (blocked) return;
                            if (area.comingSoon) setComingSoonArea(area);
                            else nav(area.path);
                          }}
                          onMouseEnter={() => setHovered(area.key)}
                          onFocus={() => setHovered(area.key)}
                          aria-label={`Ver área ${area.title}`}
                          style={{
                            ...styles.areaCard,
                            borderColor: isActive ? ac : T.border,
                            background: isActive ? hexToRgba(ac, 0.08) : T.surface,
                            boxShadow: isActive ? `0 6px 18px ${hexToRgba(ac, 0.18)}` : T.shadow,
                            opacity: blocked ? 0.6 : 1,
                          }}
                        >
                          <span style={{ ...styles.areaCardIcon, background: hexToRgba(ac, 0.12), color: ac }}>
                            {area.img ? (
                              <img src={area.img} alt="" style={styles.areaCardImg} draggable={false} />
                            ) : React.isValidElement(area.icon) ? (
                              React.cloneElement(area.icon, { size: 20, strokeWidth: 2 })
                            ) : (area.icon)}
                          </span>
                          <span style={{ ...styles.areaCardTitle, color: isActive ? ac : T.text }}>{area.title}</span>
                          {blocked ? (
                            <Lock size={14} strokeWidth={2.2} style={{ marginLeft: "auto", color: T.textMuted, flexShrink: 0 }} />
                          ) : (
                            <ChevronRight size={16} strokeWidth={2.2} style={{ marginLeft: "auto", color: isActive ? ac : T.textMuted, flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Coming-soon dialog */}
      {comingSoonArea && (
        <div style={styles.modalBackdrop} onClick={() => setComingSoonArea(null)}>
          <div
            style={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={comingSoonArea.title}
          >
            <div style={styles.modalIcon}>
              <Info size={24} strokeWidth={2.2} color={T.accent} />
            </div>
            <div style={styles.modalChip}>Próximamente</div>
            <h3 style={styles.modalTitleSoon}>{comingSoonArea.title}</h3>
            <p style={styles.modalText}>
              {comingSoonArea.comingSoonMsg || "Esta área estará disponible próximamente."}
            </p>
            <button type="button" onClick={() => setComingSoonArea(null)} style={styles.modalBtn}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── CSS Animations + responsive layout ─── */
const cssAnimations = `
  @keyframes homeSpin { to { transform: rotate(360deg); } }
  @keyframes hhFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes hhPop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  /* wheel action icons: soft scale-in on mount */
  @keyframes hhNodeIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  /* areas modal: staggered cards + panel content */
  @keyframes hhCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes hhPanelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  /* wheel <-> assistant chat transition */
  @keyframes hhWheelIn { from { opacity: 0; transform: scale(0.66) translateY(16px); } to { opacity: 1; transform: scale(0.75); } }
  @keyframes hhWheelOut { from { opacity: 1; transform: scale(0.75); } to { opacity: 0; transform: scale(0.66) translateY(18px); } }
  @keyframes hhChatIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes hhChatOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(12px) scale(0.98); } }
  @keyframes hhTyping { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
  @keyframes hhMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }

  .hh-sugg-chip:hover { border-color: #089F8A; color: #089F8A; background: rgba(8,159,138,0.08); }
  .hh-msg-chip:hover { filter: brightness(0.97); }

  /* staggered entrance for the lateral area cards when the modal opens */
  .hh-modal-side .hh-area-card { animation: hhCardIn 360ms cubic-bezier(0.22,1,0.36,1) both; }
  .hh-modal-side .hh-area-card:nth-child(1) { animation-delay: 40ms; }
  .hh-modal-side .hh-area-card:nth-child(2) { animation-delay: 90ms; }
  .hh-modal-side .hh-area-card:nth-child(3) { animation-delay: 140ms; }
  .hh-modal-side .hh-area-card:nth-child(4) { animation-delay: 190ms; }
  .hh-modal-side .hh-area-card:nth-child(5) { animation-delay: 240ms; }
  .hh-modal-side .hh-area-card:nth-child(n+6) { animation-delay: 290ms; }
  input::placeholder { color: ${T.textMuted}; }

  /* Circular menu sizing — stable on laptop, scaled down on smaller screens. */
  .hh-wheel { --areas-wheel-size: clamp(500px, 46vw, 640px); }
  @media (max-width: 900px) {
    .hh-wheel { --areas-wheel-size: clamp(420px, 78vw, 560px); }
  }
  @media (max-width: 560px) {
    .hh-wheel { --areas-wheel-size: min(92vw, 420px); }
  }

  .hh-modal {
    width: min(1180px, 96vw);
    height: min(760px, calc(100vh - 40px));
  }
  .hh-modal-body {
    display: grid;
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr) minmax(190px, 230px);
    gap: 14px;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    padding: 14px;
  }
  .hh-modal-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding: 2px;
  }
  .hh-modal-center { min-width: 0; overflow-y: auto; }
  .hh-area-card { width: 100%; }
  .hh-mod-btn:hover { filter: brightness(0.98); }

  @media (max-width: 880px) {
    .hh-modal { width: 96vw; height: min(760px, calc(100vh - 24px)); }
    .hh-modal-body { grid-template-columns: 1fr; overflow-y: auto; }
    .hh-modal-side { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; flex: 0 0 auto; }
    .hh-modal-side .hh-area-card { width: auto; flex: 0 0 auto; min-width: 180px; }
    .hh-modal-center { overflow: visible; }
  }
  @media (max-width: 560px) {
    .hh-brand-text { display: none !important; }
    .hh-userpill-name { display: none !important; }
  }

  /* Inline areas grid (replaces the wheel) */
  .hh-areas-grid {
    display: grid;
    grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(180px, 220px);
    gap: 12px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 12px;
  }
  .hh-areas-side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    padding: 2px;
  }
  .hh-areas-center { min-width: 0; overflow: hidden; }
  .hh-areas-side .hh-area-card { animation: hhCardIn 360ms cubic-bezier(0.22,1,0.36,1) both; }
  .hh-areas-side .hh-area-card:nth-child(1) { animation-delay: 40ms; }
  .hh-areas-side .hh-area-card:nth-child(2) { animation-delay: 90ms; }
  .hh-areas-side .hh-area-card:nth-child(3) { animation-delay: 140ms; }
  .hh-areas-side .hh-area-card:nth-child(4) { animation-delay: 190ms; }
  .hh-areas-side .hh-area-card:nth-child(5) { animation-delay: 240ms; }
  .hh-areas-side .hh-area-card:nth-child(n+6) { animation-delay: 290ms; }

  @media (max-width: 880px) {
    .hh-areas-grid { grid-template-columns: 1fr; overflow-y: auto; }
    .hh-areas-side { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; flex: 0 0 auto; }
    .hh-areas-side .hh-area-card { width: auto; flex: 0 0 auto; min-width: 180px; }
    .hh-areas-center { overflow: visible; }
  }
`;

/* ─── Styles ─── */
/* Stable laptop size; the actual value is driven by the --areas-wheel-size
   CSS variable (see cssAnimations) so media queries can scale it down. */
const WHEEL_SIZE = "var(--areas-wheel-size, clamp(500px, 46vw, 640px))";

const styles = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    background: T.bg,
    fontFamily: T.font,
    color: T.text,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    position: "relative",
  },

  /* Header */
  header: {
    width: "100%",
    borderBottom: `1px solid ${T.border}`,
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(12px) saturate(1.4)",
    WebkitBackdropFilter: "blur(12px) saturate(1.4)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    width: "100%",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    boxSizing: "border-box",
  },
  headerSubBar: {
    width: "100%",
    borderTop: `1px solid ${T.borderSoft}`,
    background: "rgba(248,250,252,0.7)",
  },
  headerSubBarInner: {
    width: "100%",
    padding: "6px 24px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxSizing: "border-box",
  },
  headerSubBarHome: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
  tenantBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px",
    borderRadius: 8,
    background: T.accentSoft,
    border: `1px solid rgba(8,159,138,0.2)`,
  },
  tenantPrimary: {
    fontSize: 11,
    fontWeight: 900,
    color: T.text,
    lineHeight: 1.2,
  },
  tenantSep: {
    fontSize: 10,
    color: T.textMuted,
  },
  tenantSecondary: {
    fontSize: 11,
    fontWeight: 700,
    color: T.textMuted,
    lineHeight: 1.2,
  },
  searchTrigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 28,
    padding: "0 8px 0 10px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: "#fff",
    color: T.textSecondary,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
  },
  searchKbd: {
    display: "inline-grid",
    placeItems: "center",
    padding: "1px 5px",
    borderRadius: 5,
    background: "#F1F5F9",
    border: `1px solid ${T.border}`,
    fontSize: 10,
    fontWeight: 800,
    color: T.textSecondary,
    lineHeight: 1.4,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    textDecoration: "none",
    marginLeft: 4,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: `0 4px 16px ${T.accentGlow}`,
  },
  brandName: { fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  brandLabel: { fontWeight: 600, fontSize: 11, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  headerActions: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
  userPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px 6px 6px",
    borderRadius: 999,
    background: T.surfaceAlt,
    border: `1px solid ${T.borderSoft}`,
  },
  userPillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userPillName: {
    fontWeight: 600,
    fontSize: 13,
    color: T.text,
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.text,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
    flexShrink: 0,
  },

  /* Main */
  main: {
    width: "100%",
    minHeight: 0,
    flex: 1,
    overflow: "hidden",
    padding: "12px 20px 12px",
    display: "flex",
    flexDirection: "column",
  },
  container: { width: "100%", display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 },

  /* Hero (card) */
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 18px",
    borderRadius: 14,
    background: `linear-gradient(135deg, #fff 0%, ${T.accentSoft} 150%)`,
    border: `1px solid ${T.border}`,
    boxShadow: T.shadow,
    transition: "opacity 400ms ease, transform 400ms ease",
    flexShrink: 0,
  },
  heroText: { display: "grid", gap: 4, minWidth: 0, flex: "1 1 260px" },
  heroRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  heroLogo: { width: "clamp(56px, 7vw, 72px)", height: "auto", objectFit: "contain", opacity: 0.96 },
  greetingChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    color: T.accent,
    background: T.accentSoft,
    padding: "3px 10px",
    borderRadius: 999,
    width: "fit-content",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  greetingDot: { width: 6, height: 6, borderRadius: 999, background: T.accent, boxShadow: `0 0 0 2px ${T.accentSoft}` },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(16px, 2.2vw, 20px)",
    fontWeight: 850,
    color: T.text,
    letterSpacing: -0.4,
    lineHeight: 1.15,
  },
  heroSubtitle: { margin: 0, fontSize: 12, fontWeight: 500, color: T.textSecondary, lineHeight: 1.4, maxWidth: 400 },

  /* Search */
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    boxShadow: T.shadow,
    width: "min(260px, 70vw)",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  },
  searchWrapFocus: { borderColor: T.accent, boxShadow: `0 0 0 4px ${T.accentSoft}` },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 500,
    color: T.text,
    fontFamily: "inherit",
    minWidth: 0,
  },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "none",
    background: T.surfaceAlt,
    color: T.textSecondary,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
    fontFamily: "inherit",
  },
  /* ─── Inline areas panel (replaces the wheel) ─── */
  areasSection: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 22,
    boxShadow: T.shadow,
    overflow: "hidden",
    animation: "hhPop 280ms cubic-bezier(0.22,1,0.36,1)",
  },
  areasPanelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 14px",
    borderBottom: `1px solid ${T.borderSoft}`,
  },
  areasPanelHeadTitle: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  areasPanelHeadIcon: { width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0 },
  areasPanelTitle: { fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  areasPanelSubtitle: { fontSize: 11, fontWeight: 600, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  areasPanelEmpty: {
    display: "grid",
    justifyItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "48px 24px",
  },
  centerPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flex: 1,
    minHeight: "100%",
    padding: 20,
  },
  centerPlaceholderLogo: {
    width: "clamp(80px, 14vw, 120px)",
    height: "auto",
    objectFit: "contain",
    opacity: 0.7,
  },
  centerPlaceholderText: {
    fontSize: 12,
    fontWeight: 600,
    color: T.textMuted,
    textAlign: "center",
    maxWidth: 200,
    lineHeight: 1.4,
  },
  /* ─── Legacy wheel styles (kept for CircleMenu overlay) ─── */
  wheelSection: { display: "grid", placeItems: "center", padding: "clamp(8px, 3vh, 28px) 0 24px" },
  wheel: {
    position: "relative",
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    flexShrink: 0,
    borderRadius: "50%",
    background: "radial-gradient(circle at 50% 40%, #FFFFFF 0%, #FFFFFF 56%, #F4F7FB 100%)",
    border: `1px solid ${T.border}`,
    boxShadow: "inset 0 1px 0 #fff, 0 22px 60px rgba(15,23,42,0.12), 0 6px 18px rgba(15,23,42,0.05)",
    transition: "opacity 520ms ease, transform 520ms cubic-bezier(0.22,1,0.36,1)",
    overflow: "visible", // let the active sector grow beyond the base circle
    // the 0.75 scale leaves dead space top/bottom; pull it up a bit
    marginTop: "calc(var(--areas-wheel-size, 600px) * -0.1)",
  },
  outerRing: {
    position: "absolute",
    inset: "5%",
    borderRadius: "50%",
    border: `1px dashed ${T.border}`,
    opacity: 0.7,
    pointerEvents: "none",
  },
  sectors: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" },
  /* Invisible quadrant interaction zone (one per action). */
  hitArea: {
    position: "absolute",
    width: "50%",
    height: "50%",
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    zIndex: 4,
    fontFamily: "inherit",
    outline: "none", // focus is shown via the sector/icon highlight, not a square ring
    WebkitTapHighlightColor: "transparent",
  },
  innerRing: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "44%",
    height: "44%",
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    background: "radial-gradient(circle, #FFFFFF 60%, rgba(255,255,255,0) 100%)",
    border: `1px solid ${T.borderSoft}`,
    boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
    pointerEvents: "none",
    zIndex: 3,
  },
  nodeWrap: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  },
  node: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "clamp(72px, 14vw, 96px)",
    transformOrigin: "center center",
    // smooth, slightly springy grow on hover (no delay → reacts immediately)
    transition: "transform 320ms cubic-bezier(0.34, 1.4, 0.5, 1)",
    // native button reset (the whole node is a <button> now)
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
  },
  nodeBtn: {
    position: "relative",
    width: "clamp(72px, 14vw, 96px)",
    height: "clamp(72px, 14vw, 96px)",
    borderRadius: "50%",
    border: `1.5px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    transition: "all 200ms cubic-bezier(0.22,1,0.36,1)",
  },
  nodeIcon: { width: "72%", height: "72%", borderRadius: "50%", display: "grid", placeItems: "center" },
  nodeBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    borderRadius: 999,
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
    border: "2px solid #fff",
    lineHeight: 1,
  },
  /* Floating tooltip label (hover/focus only) */
  nodeTip: {
    position: "absolute",
    left: "50%",
    padding: "5px 12px",
    borderRadius: 999,
    color: "#fff",
    fontSize: "clamp(11px, 1.4vw, 13px)",
    fontWeight: 700,
    letterSpacing: -0.1,
    whiteSpace: "nowrap",
    boxShadow: T.shadowMd,
    pointerEvents: "none",
    zIndex: 12,
    transition: "opacity 160ms ease, transform 160ms ease",
  },
  nodeTipBottom: { top: "calc(100% + 8px)" },
  nodeTipTop: { bottom: "calc(100% + 8px)" },
  core: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "30%",
    height: "30%",
    borderRadius: "50%",
    border: "none",
    background: `radial-gradient(circle at 50% 32%, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "2%",
    cursor: "pointer",
    color: "#fff",
    transition: "transform 260ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease",
    zIndex: 10,
  },
  coreImg: { width: "62%", height: "62%", objectFit: "contain" },
  coreLabel: { fontSize: "clamp(11px, 2.1vw, 15px)", fontWeight: 800, letterSpacing: 0.2, color: "#fff", whiteSpace: "nowrap" },

  /* ─── Assistant chat window ─── */
  chat: {
    width: "min(760px, 96%)",
    height: "min(750px, calc(100vh - 160px))",
    display: "flex",
    flexDirection: "column",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    boxShadow: T.shadowLg,
    overflow: "hidden",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: `1px solid ${T.borderSoft}`,
    background: `linear-gradient(135deg, ${T.accentSoft} 0%, #fff 70%)`,
    flexShrink: 0,
  },
  chatHeaderLeft: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 },
  chatHeaderActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  chatHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: `0 4px 14px ${T.accentGlow}`,
  },
  chatTitle: { fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  chatSubtitle: {
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.25,
    marginTop: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chatClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    flexShrink: 0,
    padding: 0,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    background: `radial-gradient(900px 320px at 50% -40px, ${T.accentSoft} 0%, transparent 70%), ${T.bg}`,
  },
  msgRow: { display: "flex", alignItems: "flex-start", gap: 9, width: "100%" },
  msgCol: { display: "flex", flexDirection: "column", gap: 6, maxWidth: "84%", minWidth: 0 },
  bubbleWrap: { position: "relative", width: "fit-content", maxWidth: "100%" },
  copyBtn: {
    position: "absolute",
    top: "calc(100% + 4px)",
    width: 24,
    height: 24,
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.textSecondary,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    boxShadow: T.shadow,
    transition: "opacity 150ms ease",
  },
  copyBtnBot: { left: 0 },
  copyBtnUser: { right: 0 },
  msgActions: { display: "flex", flexWrap: "wrap", gap: 6 },
  msgActionChip: {
    padding: "7px 12px",
    borderRadius: 999,
    border: `1px solid ${T.accent}`,
    background: T.accentSoft,
    color: T.accentDark,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "filter 150ms ease",
  },
  msgSources: { fontSize: 11, fontWeight: 600, color: T.textMuted, lineHeight: 1.4, paddingLeft: 2 },
  otCard: {
    display: "grid",
    gap: 10,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${T.border}`,
    background: T.surface,
    boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
  },
  otCardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  otCardTitle: { fontSize: 13.5, fontWeight: 800, color: T.text, letterSpacing: 0.1 },
  otStatus: {
    fontSize: 10.5,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    padding: "3px 9px",
    borderRadius: 999,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  otStatusReady: { background: "rgba(16,185,129,0.12)", color: "#047857", borderColor: "rgba(16,185,129,0.35)" },
  otStatusMissing: { background: "rgba(245,158,11,0.12)", color: "#b45309", borderColor: "rgba(245,158,11,0.35)" },
  otStatusCancelled: { background: "rgba(100,116,139,0.12)", color: "#475569", borderColor: "rgba(100,116,139,0.28)" },
  otFields: { display: "grid", gap: 7 },
  otField: { display: "grid", gridTemplateColumns: "minmax(96px, 38%) 1fr", gap: 8, alignItems: "baseline" },
  otFieldLabel: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  otFieldValue: { fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.45, wordBreak: "break-word", overflowWrap: "anywhere" },
  otSelectPanel: { display: "grid", gap: 8, padding: 10, borderRadius: 12, background: "#F8FAFC", border: `1px solid ${T.borderSoft}` },
  otSelectPanelTitle: { fontSize: 11, fontWeight: 850, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.35 },
  otSelectGrid: { display: "grid", gap: 8 },
  otSelectField: { display: "grid", gap: 5 },
  otSelect: {
    width: "100%",
    minHeight: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    padding: "0 10px",
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: "inherit",
    outline: "none",
    boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
  },
  otSelectMissing: { borderColor: "rgba(245,158,11,0.58)", background: "rgba(255,251,235,0.78)" },
  otInvalidHint: { fontSize: 11.5, fontWeight: 650, color: "#b45309", lineHeight: 1.35 },
  otPending: { display: "grid", gap: 6, paddingTop: 8, borderTop: `1px solid ${T.borderSoft}` },
  otPendingLabel: { fontSize: 11, fontWeight: 800, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  otPendingChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  otPendingChip: {
    fontSize: 11.5,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(245,158,11,0.10)",
    color: "#b45309",
    border: "1px solid rgba(245,158,11,0.30)",
  },
  otActions: { display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 2 },
  otBtnPrimary: {
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid transparent",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 4px 12px ${T.accentGlow}`,
    transition: "filter 150ms ease",
  },
  otBtnSecondary: {
    padding: "8px 16px",
    borderRadius: 999,
    border: `1px solid ${T.accent}`,
    background: T.accentSoft,
    color: T.accentDark,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "filter 150ms ease",
  },
  msgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    marginTop: 2,
    border: "2px solid #fff",
    boxShadow: `0 4px 12px ${T.accentGlow}`,
  },
  bubbleBot: {
    width: "fit-content",
    maxWidth: "100%",
    padding: "11px 15px",
    borderRadius: "6px 18px 18px 18px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    color: T.text,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.55,
    boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  bubbleUser: {
    width: "fit-content",
    maxWidth: "100%",
    padding: "11px 15px",
    borderRadius: "18px 6px 18px 18px",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.55,
    boxShadow: `0 6px 16px ${T.accentGlow}`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  typingBubble: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "13px 15px",
    borderRadius: "6px 18px 18px 18px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: T.textMuted,
    display: "inline-block",
    animation: "hhTyping 1s ease-in-out infinite",
  },
  suggWrap: { marginTop: 4, display: "grid", gap: 8 },
  suggLabel: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4, paddingLeft: 2 },
  suggRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  suggChip: {
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.textSecondary,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: T.shadow,
    transition: "border-color 150ms ease, color 150ms ease",
  },
  chatInputBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    padding: "12px 14px",
    borderTop: `1px solid ${T.borderSoft}`,
    background: T.surface,
    flexShrink: 0,
  },
  chatTextarea: {
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    resize: "none",
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    padding: "11px 14px",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "inherit",
    color: T.text,
    outline: "none",
    background: T.bg,
    lineHeight: 1.45,
  },
  chatSend: {
    width: 52,
    height: 52,
    borderRadius: 15,
    border: "none",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontFamily: "inherit",
    boxShadow: `0 6px 18px ${T.accentGlow}`,
    transition: "opacity 150ms ease",
  },

  /* ─── Search results (secondary panel) ─── */
  resultsSection: { display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, overflow: "hidden", transition: "opacity 400ms ease, transform 400ms ease" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { margin: 0, fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: -0.2 },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: T.accent,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10, overflowY: "auto", flex: 1, minHeight: 0 },
  subModuleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    cursor: "pointer",
    transition: "all 180ms ease",
    outline: "none",
  },
  subModuleRowHover: { borderColor: T.accent, boxShadow: T.shadow, transform: "translateX(2px)" },
  subModuleInfo: { flex: 1, display: "grid", gap: 2, minWidth: 0 },
  subModuleLabel: { fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 },
  subModuleParent: { fontSize: 11, fontWeight: 500, color: T.textMuted, lineHeight: 1.2 },

  emptyState: {
    display: "grid",
    justifyItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "48px 24px",
    background: T.surface,
    border: `1px dashed ${T.border}`,
    borderRadius: 18,
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 14, background: T.surfaceAlt, display: "grid", placeItems: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: 800, color: T.text },
  emptyText: { fontSize: 13, fontWeight: 500, color: T.textMuted, maxWidth: 320 },
  emptyBtn: {
    marginTop: 8,
    padding: "9px 18px",
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* ─── Areas modal ─── */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "grid",
    placeItems: "center",
    padding: "20px",
    zIndex: 1000,
    animation: "hhFadeIn 180ms ease",
  },
  modal: {
    background: T.surface,
    borderRadius: 22,
    border: `1px solid ${T.border}`,
    boxShadow: "0 30px 80px rgba(15,23,42,0.30)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "hhPop 220ms cubic-bezier(0.22,1,0.36,1)",
  },
  modalHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px",
    borderBottom: `1px solid ${T.borderSoft}`,
    flexShrink: 0,
  },
  modalHeadTitle: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  modalHeadIcon: { width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0 },
  modalTitle: { fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  modalSubtitle: { fontSize: 12.5, fontWeight: 600, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    flexShrink: 0,
    padding: 0,
  },
  areaCard: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 12px",
    minHeight: 48,
    borderRadius: 12,
    border: `1px solid ${T.border}`,
    background: T.surface,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
    flexShrink: 0,
  },
  areaCardIcon: { width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  areaCardImg: { width: 24, height: 24, objectFit: "contain" },
  areaCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: -0.2,
    lineHeight: 1.15,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  center: {
    borderRadius: 16,
    border: `1px solid ${T.border}`,
    padding: "14px 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "background 260ms ease, border-color 260ms ease",
    overflow: "hidden",
  },
  centerInner: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    animation: "hhPanelIn 260ms cubic-bezier(0.22,1,0.36,1)",
  },
  centerHero: { display: "flex", alignItems: "center", gap: 12 },
  centerIcon: { width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  centerImg: { width: 36, height: 36, objectFit: "contain" },
  centerTag: { display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: 0.2, marginBottom: 4 },
  centerTitle: { margin: 0, fontSize: 18, fontWeight: 850, color: T.text, letterSpacing: -0.4, lineHeight: 1.1 },
  centerDesc: { margin: 0, fontSize: 12.5, fontWeight: 500, color: T.textSecondary, lineHeight: 1.5 },
  centerCta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "fit-content",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontFamily: "inherit",
  },
  modulesWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 8,
    marginTop: 2,
    alignItems: "start",
  },
  modBlock: { display: "flex", flexDirection: "column", gap: 4, minHeight: 40 },
  modBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "filter 150ms ease",
  },
  modDot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0 },
  modLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  featuresRow: { display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 6 },
  featureChip: {
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid",
    background: "#fff",
    fontSize: 10.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 150ms ease",
  },
  modEmpty: { fontSize: 12, fontWeight: 600, color: T.textMuted, padding: "6px 2px" },

  modalEmpty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "48px 24px",
    textAlign: "center",
  },
  modalEmptyIcon: { width: 64, height: 64, borderRadius: 18, display: "grid", placeItems: "center", background: T.surfaceAlt, color: T.textMuted },
  modalEmptyTitle: { fontSize: 17, fontWeight: 800, color: T.text },
  modalEmptyDesc: { fontSize: 13.5, fontWeight: 500, color: T.textMuted, maxWidth: 320, lineHeight: 1.5 },

  /* Coming-soon modal */
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 30060 },
  modalCard: {
    width: "min(420px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: `1px solid ${T.border}`,
    boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
    padding: "26px 22px 20px",
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: 8,
  },
  modalIcon: { width: 54, height: 54, borderRadius: 16, background: T.accentSoft, display: "grid", placeItems: "center", marginBottom: 2 },
  modalChip: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: T.accent,
    background: T.accentSoft,
    padding: "4px 12px",
    borderRadius: 999,
  },
  modalTitleSoon: { margin: 0, fontSize: 18, fontWeight: 850, color: T.text, letterSpacing: -0.3 },
  modalText: { margin: 0, fontSize: 13.5, fontWeight: 500, color: T.textSecondary, lineHeight: 1.5, maxWidth: 340 },
  modalBtn: {
    marginTop: 12,
    padding: "11px 20px",
    borderRadius: 12,
    border: "none",
    background: T.accent,
    color: "#fff",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 8px 22px ${T.accentGlow}`,
  },
};
