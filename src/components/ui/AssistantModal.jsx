import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Copy, Send, Trash2, X } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth, db } from "../../firebase";
import {
  OT_DEPARTAMENTOS,
  OT_LUGARES_PROBLEMA,
  OT_TIPOS_PROBLEMA,
} from "../../config/otOptions";
import { OPEN_ASSISTANT_EVENT } from "./assistantBus";
import { useToast } from "./Toast";
import useMrpWorkspace from "../../hooks/mrp/useMrpWorkspace";
import usePalletArticulos from "../../hooks/mrp/usePalletArticulos";
import usePalletInventory from "../../hooks/mrp/usePalletInventory";
import usePalletTransfers from "../../hooks/mrp/usePalletTransfers";
import {
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
  PALLET_REASONS,
} from "../../services/mrp/constants";
import ArticuloSearchSelect from "../../pages/MRP/components/ArticuloSearchSelect";
import {
  ACCENT,
  ACCENT_SHADOW,
  accentAlpha,
  BORDER,
  FONT_STACK,
  MUTED,
  SLATE_DEEP,
  SURFACE,
  SURFACE_INSET,
  TEXT,
  BG,
} from "../../styles/theme";
import imgApolo from "../../assets/Apolo.png";

/* ─── Design tokens ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: accentAlpha(0.1),
  accentGlow: ACCENT_SHADOW,
  bg: BG,
  surface: SURFACE,
  surfaceAlt: SURFACE_INSET,
  border: BORDER,
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  font: FONT_STACK,
};

/* ─── Assistant config ─── */
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
const ASSISTANT_WEBHOOK_URL = import.meta.env.VITE_ASSISTANT_WEBHOOK_URL;
const ASSISTANT_TIMEOUT_MS = 60000;
const ASSISTANT_ERROR_REPLY =
  "No pude conectar con el asistente en este momento. Podés intentar de nuevo en unos segundos.";
const ASSISTANT_TIMEOUT_REPLY =
  "El asistente tardó más de lo esperado en responder. Intentá de nuevo en unos segundos o hacé una pregunta más corta.";

const OT_STATE_SOLICITADA = "Solicitada";
const OT_REQUIRED_FIELDS = ["nombreOT", "activoReferencia", "departamento", "lugarProblema", "tipoProblema", "descripcionOT"];
const OT_FIELD_LABELS = {
  nombreOT: "Nombre de OT",
  activoReferencia: "Activo referencia",
  departamento: "Departamento",
  lugarProblema: "Lugar del problema",
  tipoProblema: "Tipo de problema",
  descripcionOT: "Descripcion",
  notas: "Notas",
};
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
  { value: "Instalacion electrica", terms: ["luz", "lampara", "apagon", "toma", "breaker", "cableado", "electric"] },
  { value: "Canerias", terms: ["tuberia", "tubo", "cano", "fuga de agua", "llave de agua", "lavamanos"] },
  { value: "Banos", terms: ["bano", "banos", "inodoro", "sanitario", "ducha", "urinario"] },
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
const OT_DRAFT_INVALID_REPLY =
  "Antes de crear la OT necesito que el borrador tenga datos validos.\nElegi opciones oficiales en los campos pendientes para proteger las metricas.";

function newConversationId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `conv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findOfficialOtOption(field, value) {
  const options = OT_SELECT_OPTIONS[field];
  const clean = cleanOtValue(value);
  if (!options || !clean) return "";
  const normalized = normalizeOtText(clean);
  return options.find((opt) => opt === clean) || options.find((opt) => normalizeOtText(opt) === normalized) || "";
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
    [draft?.nombreOT, draft?.activoReferencia, draft?.descripcionOT, draft?.notas]
      .filter(Boolean)
      .join(" ")
  );

  if (!haystack) return "";
  const raw = OT_PROBLEM_TYPE_RULES.find((rule) => rule.terms.some((term) => haystack.includes(term)))?.value || "";
  return findOfficialOtOption("tipoProblema", raw);
}

function normalizeOtDraftAction(action) {
  if (!action || action.type !== "create_ot_draft") return action || null;
  if (action.status === "cancelled" || action.status === "created") return action;

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

  return payload;
}

function OtDraftCard({ action, creating, onCreate, onCompleteByChat, onDraftFieldChange }) {
  if (!action || action.type !== "create_ot_draft") return null;

  const draft = action.draft && typeof action.draft === "object" ? action.draft : {};
  const computedMissing = getOtMissingFields(draft);
  const missing = Array.from(new Set([...(Array.isArray(action.missingFields) ? action.missingFields : []), ...computedMissing]))
    .filter((key) => OT_REQUIRED_FIELDS.includes(key) && !isOtFieldComplete(key, draft));
  const isCancelled = action.status === "cancelled";
  const isCreated = action.status === "created";
  const isReady = !isCancelled && !isCreated && missing.length === 0;

  const filled = Object.keys(OT_FIELD_LABELS)
    .filter((key) => !OT_SELECT_FIELDS.includes(key))
    .map((key) => [key, draft[key]])
    .filter(([, value]) => typeof value === "string" && value.trim());

  return (
    <div style={S.otCard}>
      <div style={S.otCardHead}>
        <span style={S.otCardTitle}>Borrador de OT</span>
        <span
          style={{
            ...S.otStatus,
            ...(isCancelled || isCreated ? S.otStatusDone : isReady ? S.otStatusReady : S.otStatusMissing),
          }}
        >
          {isCancelled ? "Cancelado" : isCreated ? "Creada" : isReady ? "Listo para crear" : "Faltan datos"}
        </span>
      </div>

      {filled.length > 0 && (
        <div style={S.otFields}>
          {filled.map(([key, value]) => (
            <div key={key} style={S.otField}>
              <span style={S.otFieldLabel}>{OT_FIELD_LABELS[key]}</span>
              <span style={S.otFieldValue}>{value.trim()}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.otSelectPanel}>
        <div style={S.otSelectPanelTitle}>Campos para metricas</div>
        {OT_SELECT_FIELDS.map((field) => {
          const rawValue = cleanOtValue(draft[field]);
          const selectedValue = findOfficialOtOption(field, rawValue);
          const hasInvalidSuggestion = rawValue && !selectedValue;
          return (
            <label key={field} style={S.otSelectField}>
              <span style={S.otFieldLabel}>{OT_FIELD_LABELS[field]}</span>
              <select
                value={selectedValue}
                onChange={(e) => onDraftFieldChange?.(field, e.target.value)}
                disabled={isCancelled || isCreated}
                style={{ ...S.otSelect, ...(missing.includes(field) ? S.otSelectMissing : {}) }}
              >
                <option value="">Seleccionar opcion oficial</option>
                {OT_SELECT_OPTIONS[field].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {hasInvalidSuggestion && (
                <span style={S.otInvalidHint}>Detectado: {rawValue}. Elegi una opcion oficial.</span>
              )}
            </label>
          );
        })}
      </div>

      {!isReady && missing.length > 0 && (
        <div style={S.otPending}>
          <span style={S.otPendingLabel}>Pendiente</span>
          <div style={S.otPendingChips}>
            {missing.map((key) => (
              <span key={key} style={S.otPendingChip}>{OT_FIELD_LABELS[key] || key}</span>
            ))}
          </div>
        </div>
      )}

      {!isCancelled && !isCreated && (
        <div style={S.otActions}>
          {isReady ? (
            <button
              type="button"
              onClick={() => onCreate?.(action)}
              disabled={creating}
              style={{ ...S.otBtnPrimary, opacity: creating ? 0.65 : 1, cursor: creating ? "not-allowed" : "pointer" }}
            >
              {creating ? "Creando..." : "Crear OT"}
            </button>
          ) : (
            <button type="button" onClick={onCompleteByChat} style={S.otBtnSecondary}>
              Completar por chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── MRP transfer draft helpers ─── */
const MRP_LOCATION_TEXT_MAP = {
  pendiente: "pend",
  pendientes: "pend",
  pend: "pend",
  almacen: "almacen",
  patio: "patio",
  reparacion: "reparacion",
  merma: "merma",
  tienda: "tienda",
};
const MRP_FIELD_LABELS = {
  articuloId: "Artículo",
  quantity: "Cantidad",
  originLocation: "Origen",
  destinationLocation: "Destino",
  reason: "Motivo",
};

function mrpLocationLabel(code) {
  return PALLET_LOCATION_LABELS[code] || code || "—";
}

function resolveMrpLocation(value) {
  const clean = cleanOtValue(value);
  if (!clean) return "";
  if (PALLET_LOCATIONS.includes(clean)) return clean;
  const normalized = normalizeOtText(clean);
  if (PALLET_LOCATIONS.includes(normalized)) return normalized;
  return MRP_LOCATION_TEXT_MAP[normalized] || "";
}

function findArticuloByCodigo(articulos, codigo) {
  const clean = cleanOtValue(codigo).toLowerCase();
  if (!clean || !Array.isArray(articulos)) return null;
  return articulos.find((a) => cleanOtValue(a?.codigo).toLowerCase() === clean) || null;
}

function getMrpTransferMissingFields(draft) {
  const missing = [];
  if (!cleanOtValue(draft?.articuloId)) missing.push("articuloId");
  const qty = Number(draft?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) missing.push("quantity");
  if (!cleanOtValue(draft?.originLocation)) missing.push("originLocation");
  if (!cleanOtValue(draft?.destinationLocation)) missing.push("destinationLocation");
  return missing;
}

function buildMrpTransferStatus(draft) {
  const missing = getMrpTransferMissingFields(draft);
  const sameLoc =
    draft?.originLocation && draft?.originLocation === draft?.destinationLocation;
  return {
    missing,
    status: missing.length === 0 && !sameLoc ? "ready" : "missing_fields",
  };
}

function normalizeMrpTransferAction(action, articulos = []) {
  if (!action || action.type !== "mrp_transfer_draft") return action || null;
  if (action.status === "cancelled" || action.status === "created") return action;

  const draft = {
    ...(action.draft && typeof action.draft === "object" ? action.draft : {}),
  };

  draft.originLocation = resolveMrpLocation(draft.originLocation);
  draft.destinationLocation = resolveMrpLocation(draft.destinationLocation);

  if (!cleanOtValue(draft.articuloId) && cleanOtValue(draft.articuloCodigo)) {
    const found = findArticuloByCodigo(articulos, draft.articuloCodigo);
    if (found) {
      draft.articuloId = found.id;
      draft.articuloCodigo = found.codigo;
    }
  }

  const { missing, status } = buildMrpTransferStatus(draft);
  return { ...action, status, draft, missingFields: missing };
}

function patchMrpTransferAction(action, patch, articulos = []) {
  if (!action || action.type !== "mrp_transfer_draft") return action;
  const draft = {
    ...(action.draft && typeof action.draft === "object" ? action.draft : {}),
    ...patch,
  };

  if (patch && Object.prototype.hasOwnProperty.call(patch, "originLocation"))
    draft.originLocation = resolveMrpLocation(draft.originLocation);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "destinationLocation"))
    draft.destinationLocation = resolveMrpLocation(draft.destinationLocation);

  if (
    !cleanOtValue(draft.articuloId) &&
    cleanOtValue(draft.articuloCodigo) &&
    Array.isArray(articulos) &&
    articulos.length
  ) {
    const found = findArticuloByCodigo(articulos, draft.articuloCodigo);
    if (found) {
      draft.articuloId = found.id;
      draft.articuloCodigo = found.codigo;
    }
  }

  const { missing, status } = buildMrpTransferStatus(draft);
  return { ...action, status, draft, missingFields: missing };
}

function MrpTransferCard({ action, onPatch, onCreated, onNavigate }) {
  const { warehouse, warehouseId } = useMrpWorkspace();
  const { articulos } = usePalletArticulos({ warehouseId });
  const { transfer } = usePalletTransfers();

  const draft = action?.draft && typeof action.draft === "object" ? action.draft : {};
  const articuloId = cleanOtValue(draft.articuloId);
  const originLocation = cleanOtValue(draft.originLocation);
  const destinationLocation = cleanOtValue(draft.destinationLocation);
  const reason = cleanOtValue(draft.reason);
  const quantity = Number(draft.quantity);

  const { inventory } = usePalletInventory({
    warehouseId: warehouseId || null,
    articuloId: articuloId || null,
    onlyWithStock: false,
  });

  const [submitting, setSubmitting] = useState(false);

  const isCancelled = action?.status === "cancelled";
  const isCreated = action?.status === "created";
  const editable = !isCancelled && !isCreated;

  // Preselección por código cuando el bot manda articuloCodigo.
  useEffect(() => {
    if (!editable || articuloId) return;
    const code = cleanOtValue(draft.articuloCodigo);
    if (!code || !articulos.length) return;
    const found = findArticuloByCodigo(articulos, code);
    if (found) onPatch?.({ articuloId: found.id, articuloCodigo: found.codigo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, articuloId, draft.articuloCodigo, articulos]);

  const available = useMemo(() => {
    if (!warehouseId || !articuloId || !originLocation) return null;
    return inventory
      .filter((r) => r.location === originLocation)
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [inventory, warehouseId, articuloId, originLocation]);

  const quantityValid = Number.isInteger(quantity) && quantity > 0;
  const sameLoc = Boolean(
    originLocation && destinationLocation && originLocation === destinationLocation
  );
  const overStock = available != null && quantityValid && quantity > available;
  const missing = getMrpTransferMissingFields(draft);

  const baseStatus = isCancelled
    ? "cancelled"
    : isCreated
    ? "created"
    : missing.length === 0 && !sameLoc
    ? "ready"
    : "missing_fields";

  const canConfirm =
    editable &&
    !submitting &&
    !!warehouseId &&
    !!articuloId &&
    quantityValid &&
    !!originLocation &&
    !!destinationLocation &&
    !sameLoc &&
    !overStock;

  const onPickArticulo = (id) => {
    const found = articulos.find((a) => a.id === id);
    onPatch?.({ articuloId: id, articuloCodigo: found ? found.codigo : "" });
  };

  const doConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const res = await transfer({
        warehouseId,
        originLocation,
        destinationLocation,
        articuloId,
        quantity: Number(quantity),
        reason: reason || null,
      });
      onCreated?.({
        movement_code: res?.movement_code || null,
        movement_id: res?.movement_id || null,
        task_id: res?.task_id || null,
        quantity: Number(quantity),
        originLabel: mrpLocationLabel(originLocation),
        destinationLabel: mrpLocationLabel(destinationLocation),
      });
    } catch {
      /* el hook usePalletTransfers ya muestra el toast de error */
    } finally {
      setSubmitting(false);
    }
  };

  const statusText =
    baseStatus === "cancelled"
      ? "Cancelado"
      : baseStatus === "created"
      ? "Traslado registrado"
      : baseStatus === "ready"
      ? "Listo para trasladar"
      : "Faltan datos";

  return (
    <div style={S.otCard}>
      <div style={S.otCardHead}>
        <span style={S.otCardTitle}>Borrador de traslado MRP</span>
        <span
          style={{
            ...S.otStatus,
            ...(isCancelled || isCreated
              ? S.otStatusDone
              : baseStatus === "ready"
              ? S.otStatusReady
              : S.otStatusMissing),
          }}
        >
          {statusText}
        </span>
      </div>

      {warehouseId ? (
        <div style={S.mrpInfoRow}>
          Almacén de trabajo: <b>{warehouse?.name || warehouse?.code || "—"}</b>
        </div>
      ) : (
        <div style={S.mrpWarn}>
          <span>
            Seleccioná un almacén de trabajo en MRP Tarimas para poder registrar el
            traslado.
          </span>
          <button
            type="button"
            onClick={() => onNavigate?.("/mrp-tarimas")}
            style={S.otBtnSecondary}
          >
            Ir a MRP Tarimas
          </button>
        </div>
      )}

      <div style={S.otSelectPanel}>
        <div style={S.otSelectPanelTitle}>Datos del traslado</div>

        <label style={S.otSelectField}>
          <span style={S.otFieldLabel}>{MRP_FIELD_LABELS.articuloId}</span>
          {editable ? (
            <ArticuloSearchSelect
              articulos={articulos}
              value={articuloId}
              onChange={onPickArticulo}
              allLabel="Seleccionar artículo"
              maxWidth={9999}
              size="md"
            />
          ) : (
            <span style={S.otFieldValue}>
              {(() => {
                const a = articulos.find((x) => x.id === articuloId);
                return a
                  ? `${a.codigo} · ${a.nombre}`
                  : cleanOtValue(draft.articuloCodigo) || "—";
              })()}
            </span>
          )}
        </label>

        <label style={S.otSelectField}>
          <span style={S.otFieldLabel}>{MRP_FIELD_LABELS.quantity}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(quantity) && quantity > 0 ? quantity : draft.quantity ?? ""}
            onChange={(e) => onPatch?.({ quantity: e.target.value })}
            disabled={!editable}
            style={{
              ...S.mrpNumberInput,
              ...(missing.includes("quantity") ? S.otSelectMissing : {}),
            }}
          />
        </label>

        <label style={S.otSelectField}>
          <span style={S.otFieldLabel}>{MRP_FIELD_LABELS.originLocation}</span>
          <select
            value={originLocation}
            onChange={(e) => onPatch?.({ originLocation: e.target.value })}
            disabled={!editable}
            style={{
              ...S.otSelect,
              ...(missing.includes("originLocation") ? S.otSelectMissing : {}),
            }}
          >
            <option value="">Seleccionar ubicación</option>
            {PALLET_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {PALLET_LOCATION_LABELS[loc] || loc}
              </option>
            ))}
          </select>
          {originLocation && available != null && (
            <span style={S.mrpInfoRow}>
              Disponible en {mrpLocationLabel(originLocation)}: <b>{available}</b>
            </span>
          )}
        </label>

        <label style={S.otSelectField}>
          <span style={S.otFieldLabel}>{MRP_FIELD_LABELS.destinationLocation}</span>
          <select
            value={destinationLocation}
            onChange={(e) => onPatch?.({ destinationLocation: e.target.value })}
            disabled={!editable}
            style={{
              ...S.otSelect,
              ...(missing.includes("destinationLocation") ? S.otSelectMissing : {}),
            }}
          >
            <option value="">Seleccionar ubicación</option>
            {PALLET_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {PALLET_LOCATION_LABELS[loc] || loc}
              </option>
            ))}
          </select>
        </label>

        <label style={S.otSelectField}>
          <span style={S.otFieldLabel}>{MRP_FIELD_LABELS.reason} (opcional)</span>
          <select
            value={reason}
            onChange={(e) => onPatch?.({ reason: e.target.value })}
            disabled={!editable}
            style={S.otSelect}
          >
            <option value="">Sin motivo</option>
            {PALLET_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sameLoc && (
        <span style={S.otInvalidHint}>
          El origen y el destino no pueden ser iguales.
        </span>
      )}
      {overStock && (
        <span style={S.otInvalidHint}>
          La cantidad ({quantity}) supera el disponible ({available}) en{" "}
          {mrpLocationLabel(originLocation)}.
        </span>
      )}

      {editable && (
        <div style={S.otActions}>
          <button
            type="button"
            onClick={doConfirm}
            disabled={!canConfirm}
            style={{
              ...S.otBtnPrimary,
              opacity: canConfirm ? 1 : 0.55,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Registrando..." : "Confirmar traslado"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Global assistant chatbot modal. Self-contained: manages its own messages,
 * typing state, and n8n webhook integration. Opens via the assistantBus event
 * or programmatically. Mount once at the app root (alongside CircleMenu).
 */
export default function AssistantModal() {
  const nav = useNavigate();
  const location = useLocation();
  const { profile, role, permisos, epaAdmin, user: ctxUser } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: ASSISTANT_INTRO }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [creatingOt, setCreatingOt] = useState(false);
  const [convId, setConvId] = useState(() => newConversationId());
  const timers = useRef([]);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const copyTimer = useRef(null);

  // Listen for the open event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, handler);
  }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // Focus input on open
  useEffect(() => {
    if (open && !typing && taRef.current) {
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [open, typing]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    timers.current.forEach((t) => clearTimeout(t));
    clearTimeout(copyTimer.current);
  }, []);

  if (!open || !user) return null;

  const close = () => setOpen(false);

  const clearChat = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    setTyping(false);
    setCreatingOt(false);
    setInput("");
    setMessages([{ role: "assistant", text: ASSISTANT_INTRO }]);
    setConvId(newConversationId());
  };

  const copyMsg = (i, text) => {
    const value = (text || "").trim();
    if (!value) return;
    try { navigator.clipboard?.writeText(value); } catch { /* */ }
    setCopiedIdx(i);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedIdx(null), 1200);
  };

  const canSend = input.trim().length > 0 && !typing;

  const sendMessage = (text) => {
    const clean = (text || "").trim();
    if (!clean) return;

    const userMsg = { role: "user", text: clean };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    if (!ASSISTANT_WEBHOOK_URL) {
      const t = setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [...prev, { role: "assistant", text: ASSISTANT_MOCK_REPLY }]);
      }, 900);
      timers.current.push(t);
      return;
    }

    const history = [...messages, userMsg]
      .slice(-12)
      .map((m) => ({ role: m.role, text: m.text, action: m.action || null }));

    const payload = {
      userMessage: clean,
      userId: user?.uid || null,
      tenantId: profile?.tenantId || null,
      company: profile?.company || null,
      role: role || null,
      permisos: permisos || {},
      epaAdmin: !!epaAdmin,
      currentRoute: location.pathname,
      conversationId: convId,
      history,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
    timers.current.push(timeoutId);

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
        const data = Array.isArray(raw) ? raw[0] || {} : raw || {};
        const answer =
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer.trim()
            : "Recibí tu mensaje, pero no obtuve una respuesta válida.";
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const suggestedActions = Array.isArray(data.suggestedActions) ? data.suggestedActions : [];
        const rawAction =
          data.action && typeof data.action === "object" && !Array.isArray(data.action)
            ? data.action
            : null;
        const action =
          rawAction?.type === "mrp_transfer_draft"
            ? normalizeMrpTransferAction(rawAction)
            : normalizeOtDraftAction(rawAction);
        setTyping(false);
        setMessages((prev) => [...prev, { role: "assistant", text: answer, sources, suggestedActions, action }]);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: err?.name === "AbortError" ? ASSISTANT_TIMEOUT_REPLY : ASSISTANT_ERROR_REPLY },
        ]);
      });
  };

  const updateOtDraft = (messageIndex, field, value) => {
    setMessages((prev) =>
      prev.map((message, index) => {
        if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
        return {
          ...message,
          action: patchOtDraftAction(message.action, { [field]: value }),
        };
      })
    );
  };

  const updateMrpDraft = (messageIndex, patch) => {
    setMessages((prev) =>
      prev.map((message, index) => {
        if (index !== messageIndex || message?.action?.type !== "mrp_transfer_draft")
          return message;
        return { ...message, action: patchMrpTransferAction(message.action, patch) };
      })
    );
  };

  const markMrpTransferCreated = (messageIndex, info) => {
    setMessages((prev) => {
      const next = prev.map((message, index) => {
        if (index !== messageIndex || message?.action?.type !== "mrp_transfer_draft")
          return message;
        return {
          ...message,
          action: {
            ...message.action,
            status: "created",
            movement_code: info.movement_code,
            movement_id: info.movement_id,
            task_id: info.task_id,
          },
        };
      });
      return [
        ...next,
        {
          role: "assistant",
          text: `Traslado MRP registrado correctamente.\n1. Movimiento: ${
            info.movement_code || "—"
          }\n2. Cantidad: ${info.quantity}\n3. Origen: ${info.originLabel}\n4. Destino: ${
            info.destinationLabel
          }`,
          suggestedActions: [
            { label: "Historial MRP", path: "/mrp-tarimas/movimientos" },
            { label: "Inventario MRP", path: "/mrp-tarimas/inventario" },
          ],
        },
      ];
    });
  };

  const createOtFromDraft = async (messageIndex, action) => {
    if (creatingOt) return;

    const normalizedAction = normalizeOtDraftAction(action);
    const draft = normalizedAction?.draft || {};
    const missingFields = getOtMissingFields(draft);

    if (missingFields.length > 0) {
      setMessages((prev) => {
        const next = prev.map((message, index) => {
          if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
          return { ...message, action: normalizedAction };
        });
        return [...next, { role: "assistant", text: buildOtDraftValidationReply(missingFields) }];
      });
      return;
    }

    if (!user?.uid) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "No pude crear la OT porque no encontrÃ© una sesiÃ³n activa. VolvÃ© a iniciar sesiÃ³n e intentÃ¡ de nuevo." },
      ]);
      return;
    }

    try {
      setCreatingOt(true);
      const payload = buildAssistantOtPayload({ draft, user, profile });
      const docRef = await addDoc(collection(db, "solicitudesOT"), payload);
      const createdAction = {
        ...normalizedAction,
        status: "created",
        createdId: docRef.id,
        createdNroSolicitud: payload.NroSolicitud,
      };

      setMessages((prev) => {
        const next = prev.map((message, index) => {
          if (index !== messageIndex || message?.action?.type !== "create_ot_draft") return message;
          return { ...message, action: createdAction };
        });
        return [
          ...next,
          {
            role: "assistant",
            text: `OT creada correctamente.\n1. Solicitud: ${payload.NroSolicitud}\n2. Nombre: ${payload.nombreOT}\n3. Estado: ${OT_STATE_SOLICITADA}`,
            suggestedActions: [
              { label: "GestiÃ³n de OTs", path: "/mantenimiento/OTsPage" },
              { label: "OTs Servicios Generales", path: "/servicios-generales/ordenes-trabajo/gestion" },
            ],
          },
        ];
      });
      toast.success("Solicitud OT creada correctamente.");
    } catch (err) {
      console.error("assistant create OT", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "No pude crear la OT en este momento. RevisÃ¡ tus permisos o intentÃ¡ de nuevo." },
      ]);
    } finally {
      setCreatingOt(false);
    }
  };

  const submit = () => { if (canSend) sendMessage(input.trim()); };
  const onKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };
  const showSuggestions = messages.length <= 1;

  return (
    <div style={S.root}>
      <style>{cssAnim}</style>
      <button type="button" aria-label="Cerrar" onClick={close} style={S.backdrop} />

      <div role="dialog" aria-modal="true" aria-label="Asistente AppoloDesk" style={S.chat}>
        {/* Header */}
        <div style={S.chatHeader}>
          <div style={S.chatHeaderLeft}>
            <span style={S.chatHeaderIcon}>
              <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={S.chatTitle}>Asistente AppoloDesk</div>
              <div style={S.chatSubtitle}>Consultá procesos, módulos y funcionamiento</div>
            </div>
          </div>
          <div style={S.chatHeaderActions}>
            <button
              type="button"
              onClick={clearChat}
              disabled={messages.length <= 1 && !typing}
              aria-label="Limpiar chat"
              title="Limpiar chat"
              style={{ ...S.chatClose, opacity: messages.length <= 1 && !typing ? 0.45 : 1, cursor: messages.length <= 1 && !typing ? "not-allowed" : "pointer" }}
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
            <button type="button" onClick={close} aria-label="Cerrar asistente" style={S.chatClose}>
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={S.chatBody}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const actions = !isUser && Array.isArray(m.suggestedActions) ? m.suggestedActions.filter((a) => a && a.path) : [];
            const sources = !isUser && Array.isArray(m.sources)
              ? m.sources.map((s) => s?.title || s?.ref).filter(Boolean).slice(0, 3)
              : [];
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredMsg(i)}
                onMouseLeave={() => setHoveredMsg((cur) => (cur === i ? null : cur))}
                style={{ ...S.msgRow, justifyContent: isUser ? "flex-end" : "flex-start", animation: "amMsgIn 280ms cubic-bezier(0.22,1,0.36,1) both" }}
              >
                {!isUser && (
                  <span style={S.msgAvatar}>
                    <img src={imgApolo} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} draggable={false} />
                  </span>
                )}
                <div style={{ ...S.msgCol, alignItems: isUser ? "flex-end" : "flex-start" }}>
                  <div style={S.bubbleWrap}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => copyMsg(i, m.text)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copyMsg(i, m.text)}
                      title="Copiar mensaje"
                      style={{ ...(isUser ? S.bubbleUser : S.bubbleBot), cursor: "pointer" }}
                    >
                      {m.text}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyMsg(i, m.text)}
                      aria-label="Copiar"
                      style={{ ...S.copyBtn, ...(isUser ? S.copyBtnUser : S.copyBtnBot), opacity: hoveredMsg === i ? 1 : 0, pointerEvents: hoveredMsg === i ? "auto" : "none" }}
                    >
                      {copiedIdx === i ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} strokeWidth={2.2} />}
                    </button>
                  </div>
                  {actions.length > 0 && (
                    <div style={S.msgActions}>
                      {actions.map((a, idx) => (
                        <button key={idx} type="button" onClick={() => { close(); nav(a.path); }} style={S.msgActionChip}>
                          {a.label || a.path}
                        </button>
                      ))}
                    </div>
                  )}
                  {!isUser && m.action && m.action.type === "create_ot_draft" && (
                    <OtDraftCard
                      action={m.action}
                      creating={creatingOt}
                      onCreate={(nextAction) => createOtFromDraft(i, nextAction)}
                      onCompleteByChat={() => taRef.current?.focus()}
                      onDraftFieldChange={(field, value) => updateOtDraft(i, field, value)}
                    />
                  )}
                  {!isUser && m.action && m.action.type === "mrp_transfer_draft" && (
                    <MrpTransferCard
                      action={m.action}
                      onPatch={(patch) => updateMrpDraft(i, patch)}
                      onCreated={(info) => markMrpTransferCreated(i, info)}
                      onNavigate={(path) => { close(); nav(path); }}
                    />
                  )}
                  {sources.length > 0 && (
                    <div style={S.msgSources}>Fuentes: {sources.join(" · ")}</div>
                  )}
                </div>
              </div>
            );
          })}

          {typing && (
            <div style={{ ...S.msgRow, justifyContent: "flex-start" }}>
              <span style={S.msgAvatar}>
                <img src={imgApolo} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} draggable={false} />
              </span>
              <div style={S.typingBubble}>
                <span style={{ ...S.typingDot, animationDelay: "0ms" }} />
                <span style={{ ...S.typingDot, animationDelay: "150ms" }} />
                <span style={{ ...S.typingDot, animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          {showSuggestions && (
            <div style={S.suggWrap}>
              <div style={S.suggLabel}>Sugerencias</div>
              <div style={S.suggRow}>
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="am-sugg" onClick={() => sendMessage(s)} style={S.suggChip}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={S.chatInputBar}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Escribí tu consulta…"
            style={S.chatTextarea}
            aria-label="Mensaje para el asistente"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Enviar mensaje"
            style={{ ...S.chatSend, opacity: canSend ? 1 : 0.45, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            <Send size={30} strokeWidth={2.2} style={{ width: 30, height: 30 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Animations ─── */
const cssAnim = `
  @keyframes amFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes amChatIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes amMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes amTyping { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
  .am-sugg:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; background: ${accentAlpha(0.08)} !important; }
`;

/* ─── Styles ─── */
const S = {
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 31000,
    display: "grid",
    placeItems: "center",
    fontFamily: T.font,
    animation: "amFadeIn 180ms ease",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    border: "none",
    cursor: "pointer",
  },
  chat: {
    position: "relative",
    width: "min(760px, 96vw)",
    height: "min(700px, calc(100vh - 80px))",
    display: "flex",
    flexDirection: "column",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    boxShadow: T.shadowLg,
    overflow: "hidden",
    animation: "amChatIn 320ms cubic-bezier(0.22,1,0.36,1)",
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
  chatSubtitle: { fontSize: 12, fontWeight: 500, color: T.textMuted, lineHeight: 1.25, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chatClose: {
    width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`,
    background: T.surface, display: "grid", placeItems: "center", cursor: "pointer",
    color: T.textSecondary, flexShrink: 0, padding: 0,
  },
  chatBody: {
    flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 18px",
    display: "flex", flexDirection: "column", gap: 24,
    background: `radial-gradient(900px 320px at 50% -40px, ${T.accentSoft} 0%, transparent 70%), ${T.bg}`,
  },
  msgRow: { display: "flex", alignItems: "flex-start", gap: 9, width: "100%" },
  msgCol: { display: "flex", flexDirection: "column", gap: 6, maxWidth: "84%", minWidth: 0 },
  bubbleWrap: { position: "relative", width: "fit-content", maxWidth: "100%" },
  copyBtn: {
    position: "absolute", top: "calc(100% + 4px)", width: 24, height: 24, borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary,
    display: "grid", placeItems: "center", cursor: "pointer", padding: 0,
    boxShadow: T.shadow, transition: "opacity 150ms ease",
  },
  copyBtnBot: { left: 0 },
  copyBtnUser: { right: 0 },
  msgActions: { display: "flex", flexWrap: "wrap", gap: 6 },
  msgActionChip: {
    padding: "7px 12px", borderRadius: 999, border: `1px solid ${T.accent}`,
    background: T.accentSoft, color: T.accentDark, fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "filter 150ms ease",
  },
  msgSources: {
    fontSize: 11,
    fontWeight: 700,
    color: T.textMuted,
    paddingLeft: 2,
  },
  otCard: {
    width: "min(520px, 100%)",
    display: "grid",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    background: T.surface,
    border: `1px solid ${T.border}`,
    boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
  },
  otCardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  otCardTitle: { fontSize: 13.5, fontWeight: 800, color: T.text },
  otStatus: { padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  otStatusReady: { color: T.accentDark, background: T.accentSoft, border: `1px solid ${accentAlpha(0.22)}` },
  otStatusMissing: { color: "#B45309", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.24)" },
  otStatusDone: { color: "#334155", background: "#F1F5F9", border: `1px solid ${T.border}` },
  otFields: { display: "grid", gap: 8 },
  otField: { display: "grid", gap: 2 },
  otFieldLabel: { fontSize: 11, fontWeight: 850, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  otFieldValue: { fontSize: 13.5, fontWeight: 700, color: T.text, lineHeight: 1.35, overflowWrap: "anywhere" },
  otSelectPanel: { display: "grid", gap: 8, padding: 10, borderRadius: 12, background: "#F8FAFC", border: `1px solid ${T.borderSoft}` },
  otSelectPanelTitle: { fontSize: 11, fontWeight: 850, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.35 },
  otSelectField: { display: "grid", gap: 5 },
  otSelect: {
    width: "100%",
    minHeight: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: "#fff",
    color: T.text,
    fontSize: 13,
    fontWeight: 700,
    padding: "0 10px",
    outline: "none",
    fontFamily: "inherit",
  },
  otSelectMissing: {
    borderColor: "#F59E0B",
    background: "rgba(245,158,11,0.06)",
  },
  otInvalidHint: { fontSize: 11, fontWeight: 700, color: "#B45309", lineHeight: 1.35 },
  mrpInfoRow: { fontSize: 12, fontWeight: 700, color: T.textSecondary, lineHeight: 1.35 },
  mrpWarn: {
    display: "grid",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(245,158,11,0.10)",
    border: "1px solid rgba(245,158,11,0.28)",
    color: "#B45309",
    fontSize: 12.5,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  mrpNumberInput: {
    width: "100%",
    minHeight: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: "#fff",
    color: T.text,
    fontSize: 13,
    fontWeight: 700,
    padding: "0 10px",
    outline: "none",
    fontFamily: "inherit",
  },
  otPending: { display: "grid", gap: 7, borderTop: `1px solid ${T.borderSoft}`, paddingTop: 10 },
  otPendingLabel: { fontSize: 11, fontWeight: 850, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.35 },
  otPendingChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  otPendingChip: {
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid rgba(245,158,11,0.34)",
    color: "#B45309",
    background: "rgba(245,158,11,0.08)",
    fontSize: 11.5,
    fontWeight: 800,
  },
  otActions: { display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 2 },
  otBtnPrimary: {
    padding: "9px 14px",
    borderRadius: 999,
    border: "none",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    fontFamily: "inherit",
    boxShadow: `0 6px 16px ${T.accentGlow}`,
  },
  otBtnSecondary: {
    padding: "9px 14px",
    borderRadius: 999,
    border: `1px solid ${T.accent}`,
    background: T.accentSoft,
    color: T.accentDark,
    fontSize: 13,
    fontWeight: 800,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 999,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2,
    border: "2px solid #fff", boxShadow: `0 4px 12px ${T.accentGlow}`,
  },
  bubbleBot: {
    width: "fit-content", maxWidth: "100%", padding: "11px 15px",
    borderRadius: "6px 18px 18px 18px", background: T.surface,
    border: `1px solid ${T.border}`, color: T.text, fontSize: 14, fontWeight: 500,
    lineHeight: 1.55, boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
    whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
  },
  bubbleUser: {
    width: "fit-content", maxWidth: "100%", padding: "11px 15px",
    borderRadius: "18px 6px 18px 18px",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff", fontSize: 14, fontWeight: 500, lineHeight: 1.55,
    boxShadow: `0 6px 16px ${T.accentGlow}`,
    whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
  },
  typingBubble: {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "13px 15px",
    borderRadius: "6px 18px 18px 18px", background: T.surface,
    border: `1px solid ${T.border}`, boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
  },
  typingDot: {
    width: 7, height: 7, borderRadius: 999, background: T.textMuted,
    display: "inline-block", animation: "amTyping 1s ease-in-out infinite",
  },
  suggWrap: { marginTop: 4, display: "grid", gap: 8 },
  suggLabel: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.4, paddingLeft: 2 },
  suggRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  suggChip: {
    padding: "8px 14px", borderRadius: 999, border: `1px solid ${T.border}`,
    background: T.surface, color: T.textSecondary, fontSize: 12.5, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadow,
    transition: "border-color 150ms ease, color 150ms ease",
  },
  chatInputBar: {
    display: "flex", alignItems: "flex-end", gap: 10, padding: "12px 14px",
    borderTop: `1px solid ${T.borderSoft}`, background: T.surface, flexShrink: 0,
  },
  chatTextarea: {
    flex: 1, minWidth: 0, maxHeight: 120, resize: "none",
    border: `1px solid ${T.border}`, borderRadius: 14, padding: "11px 14px",
    fontSize: 14, fontWeight: 500, fontFamily: "inherit", color: T.text,
    outline: "none", background: T.bg, lineHeight: 1.45,
  },
  chatSend: {
    width: 52, height: 52, borderRadius: 15, border: "none",
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    color: "#fff", display: "grid", placeItems: "center", flexShrink: 0,
    fontFamily: "inherit", boxShadow: `0 6px 18px ${T.accentGlow}`,
    transition: "opacity 150ms ease",
  },
};
