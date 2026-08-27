/**
 * Mantenimiento programado — lógica pura (sin Firestore ni firebase-admin).
 *
 * Acá vive todo lo que decide QUÉ hay que hacer: qué OTs vencieron, qué avisos
 * corresponden, cómo se agrupa el resumen mensual, quién es destinatario y qué
 * ID determinístico lleva cada notificación. El acceso a datos está en
 * `scheduledMaintenance.js`.
 *
 * Al no depender de firebase-admin, este módulo se puede testear directamente
 * (ver `scheduledMaintenanceCore.test.js`), que es donde están los casos límite.
 *
 * ── Zona horaria ────────────────────────────────────────────────────────────
 * El deadline es un string ISO `YYYY-MM-DD` (orden lexicográfico = cronológico)
 * y el "hoy" se calcula con un offset de negocio fijo, para que el runtime UTC
 * de Cloud Functions no adelante el día. Misma lógica que
 * `src/utils/scheduledMaintenance.js` (ESM, no importable desde CommonJS).
 */

const OT_STATE_SOLICITADA = "Solicitada";
const OT_STATE_EN_PROCESO = "En proceso";
const OT_STATE_FINALIZADA = "Finalizada";

/** Offset de negocio: Costa Rica (UTC−6, sin horario de verano). */
const BUSINESS_UTC_OFFSET_HOURS = -6;
/** Ventanas de aviso previas al deadline, en días. */
const ALERT_WINDOWS = [15, 7, 1];

const NOTIFICATION_TYPE_DEADLINE = "scheduled_maintenance_deadline";
const NOTIFICATION_TYPE_MONTHLY = "scheduled_maintenance_monthly";
const ENTITY_TYPE_OT = "solicitudOT";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safe(v) {
  return String(v ?? "").trim();
}

/** `YYYY-MM-DD` bien formado y con fecha real (rechaza 2026-02-31). */
function isValidIsoDate(value) {
  const s = safe(value);
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** Fecha de negocio (`YYYY-MM-DD`) para un instante en ms. */
function businessToday(nowMs) {
  const shifted = new Date(nowMs + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Días calendario entre dos fechas ISO (`toIso - fromIso`); null si son inválidas. */
function daysBetweenIso(fromIso, toIso) {
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) return null;
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/** Sanea un fragmento para usarlo dentro de un ID de documento de Firestore. */
function sanitizeIdPart(value) {
  return safe(value).replace(/[^A-Za-z0-9_-]/g, "_") || "_";
}

function buildNotificationId(parts) {
  return parts.map(sanitizeIdPart).join("~");
}

/** Ruta del detalle de una OT (destino de la notificación). */
function otDetailPath(otId) {
  return `/mantenimiento/ots-solicitud/${otId}`;
}

// ─── Scope y destinatarios ──────────────────────────────────────────────────

/** Clave de agrupación por scope (tenant + company + bodega). */
function scopeKeyOf(ot) {
  return [safe(ot?.tenantId), safe(ot?.company), safe(ot?.bodegaId)].join("|");
}

/**
 * ¿El perfil pertenece al scope de la OT?
 * Tolerante con documentos legados (igual que `sameTenantScope` en
 * src/utils/dataScope.js): si a un lado le falta el valor, no descarta.
 */
function profileMatchesOtScope(profile, ot) {
  const t = safe(ot?.tenantId);
  const c = safe(ot?.company);
  const b = safe(ot?.bodegaId);
  if (t && safe(profile?.tenantId) && safe(profile.tenantId) !== t) return false;
  if (c && safe(profile?.company) && safe(profile.company) !== c) return false;
  if (b && safe(profile?.bodegaId) && safe(profile.bodegaId) !== b) return false;
  return true;
}

/** Espejo de `canMantenimientoOT()`: admin/dev o `permisos.mantenimiento`. */
function isMantenimientoProfile(data) {
  if (!data || typeof data !== "object") return false;
  if (data.active === false) return false;
  const role = safe(data.role);
  if (role === "administrativo" || role === "dev") return true;
  return data.permisos != null && data.permisos.mantenimiento === true;
}

/**
 * Índice de perfiles reutilizable en toda la corrida.
 * @param {Array<{uid: string, data: object}>} entries
 */
function buildProfileIndex(entries) {
  const byUid = new Map();
  const mantenimiento = [];
  for (const entry of entries || []) {
    if (!entry?.uid) continue;
    const data = entry.data || {};
    byUid.set(entry.uid, { uid: entry.uid, data });
    if (isMantenimientoProfile(data)) mantenimiento.push({ uid: entry.uid, data });
  }
  return { byUid, mantenimiento };
}

/**
 * UIDs que reciben avisos de una OT programada: creador + responsable(s) +
 * personal con permiso de mantenimiento del mismo scope.
 *
 * Devuelve un Set, así que si una persona cae en varios grupos (p. ej. es el
 * creador Y el responsable Y tiene el permiso) recibe una sola notificación.
 * Solo se incluyen usuarios con perfil existente y activo, para no dejar
 * notificaciones huérfanas que nadie pueda leer.
 */
function resolveRecipientUids(ot, profiles) {
  const uids = new Set();

  const addIfActive = (rawUid) => {
    const uid = safe(rawUid);
    if (!uid) return;
    const entry = profiles?.byUid?.get(uid);
    if (!entry || entry.data.active === false) return;
    uids.add(uid);
  };

  addIfActive(ot?.createdBy);

  const responsables = Array.isArray(ot?.responsablesUids) ? ot.responsablesUids : [];
  responsables.forEach(addIfActive);
  addIfActive(ot?.responsableUid);

  for (const entry of profiles?.mantenimiento || []) {
    if (profileMatchesOtScope(entry.data, ot)) uids.add(entry.uid);
  }

  return uids;
}

/** Campos de scope copiados desde la OT hacia la notificación. */
function scopeFieldsOf(ot) {
  const out = {};
  if (safe(ot?.tenantId)) out.tenantId = safe(ot.tenantId);
  if (safe(ot?.company)) out.company = safe(ot.company);
  if (safe(ot?.bodegaId)) {
    out.bodegaId = safe(ot.bodegaId);
    out.bodegaNombre = safe(ot.bodegaNombre);
  }
  return out;
}

// ─── Textos ─────────────────────────────────────────────────────────────────

function deadlineAlertTexts(window, nombreOT) {
  const name = safe(nombreOT) || "sin nombre";
  if (window === 1) {
    return {
      title: "Mantenimiento programado mañana",
      message: `Mañana corresponde realizar el mantenimiento "${name}".`,
    };
  }
  if (window === 7) {
    return {
      title: "Mantenimiento programado en 1 semana",
      message: `Falta 1 semana para el mantenimiento "${name}".`,
    };
  }
  return {
    title: `Mantenimiento programado en ${window} días`,
    message: `Faltan ${window} días para el mantenimiento "${name}".`,
  };
}

function monthlySummaryTexts(count, names) {
  const list = Array.isArray(names) ? names : [];
  const listed = list.slice(0, 5).map((n) => `"${n}"`).join(", ");
  const rest = list.length > 5 ? ` y ${list.length - 5} más` : "";
  return {
    title: `Mantenimientos programados este mes: ${count}`,
    message: list.length
      ? `Este mes hay ${count} mantenimiento(s) programado(s): ${listed}${rest}.`
      : `Este mes hay ${count} mantenimiento(s) programado(s).`,
  };
}

// ─── Selección ──────────────────────────────────────────────────────────────

/**
 * OTs programadas que deben activarse: siguen en «Solicitada» y su deadline ya
 * llegó (hoy o antes). Una OT creada el mismo día del deadline entra acá en la
 * siguiente corrida del job.
 */
function selectDueOts(ots, today) {
  return (ots || []).filter((ot) => {
    if (safe(ot?.OTState) !== OT_STATE_SOLICITADA) return false;
    if (!isValidIsoDate(ot?.scheduledDate)) return false;
    const days = daysBetweenIso(today, ot.scheduledDate);
    return days != null && days <= 0;
  });
}

/**
 * Avisos de proximidad a emitir hoy: un elemento por OT, ventana y destinatario.
 *
 * - Las OTs finalizadas no generan avisos.
 * - Si la OT se creó con menos días que una ventana, esa ventana nunca dispara
 *   (no se emiten avisos retroactivos).
 * - El deadline forma parte del ID: si se reprograma la OT, el nuevo calendario
 *   vuelve a avisar y los avisos anteriores quedan como histórico.
 */
function selectDeadlineAlertTargets(ots, profiles, today) {
  const targets = [];

  for (const ot of ots || []) {
    if (safe(ot?.OTState) === OT_STATE_FINALIZADA) continue;
    if (!isValidIsoDate(ot?.scheduledDate)) continue;

    const daysLeft = daysBetweenIso(today, ot.scheduledDate);
    if (!ALERT_WINDOWS.includes(daysLeft)) continue;

    const { title, message } = deadlineAlertTexts(daysLeft, ot.nombreOT);

    for (const uid of resolveRecipientUids(ot, profiles)) {
      targets.push({
        notificationId: buildNotificationId([
          "sm",
          ot.id,
          ot.scheduledDate,
          `d${daysLeft}`,
          uid,
        ]),
        data: {
          targetUserId: uid,
          type: NOTIFICATION_TYPE_DEADLINE,
          title,
          message,
          entityType: ENTITY_TYPE_OT,
          entityId: ot.id,
          actionPath: otDetailPath(ot.id),
          metadata: {
            daysLeft,
            scheduledDate: safe(ot.scheduledDate),
            nombreOT: safe(ot.nombreOT),
            NroSolicitud: safe(ot.NroSolicitud),
          },
          ...scopeFieldsOf(ot),
        },
      });
    }
  }

  return targets;
}

/**
 * Resúmenes mensuales a emitir: uno por scope, mes y destinatario.
 * Cuenta las OTs programadas con deadline dentro del mes de `today`,
 * independientemente de su estado (es el plan del mes, no lo pendiente).
 */
function selectMonthlySummaryTargets(ots, profiles, today) {
  const month = safe(today).slice(0, 7);
  if (!month) return [];

  const groups = new Map();
  for (const ot of ots || []) {
    if (!isValidIsoDate(ot?.scheduledDate)) continue;
    if (!ot.scheduledDate.startsWith(month)) continue;
    const key = scopeKeyOf(ot);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ot);
  }

  const targets = [];
  for (const [scopeKey, groupOts] of groups.entries()) {
    const ordered = [...groupOts].sort((a, b) =>
      safe(a.scheduledDate).localeCompare(safe(b.scheduledDate))
    );
    const names = ordered.map((ot) => safe(ot.nombreOT) || "sin nombre");
    const { title, message } = monthlySummaryTexts(ordered.length, names);

    const recipients = new Set();
    for (const ot of ordered) {
      for (const uid of resolveRecipientUids(ot, profiles)) recipients.add(uid);
    }

    const items = ordered.map((ot) => ({
      id: ot.id,
      nombreOT: safe(ot.nombreOT),
      scheduledDate: safe(ot.scheduledDate),
      NroSolicitud: safe(ot.NroSolicitud),
    }));

    for (const uid of recipients) {
      targets.push({
        notificationId: buildNotificationId(["smm", scopeKey, month, uid]),
        data: {
          targetUserId: uid,
          type: NOTIFICATION_TYPE_MONTHLY,
          title,
          message,
          // Resumen de varias OTs: no apunta a una entidad concreta.
          entityType: null,
          entityId: null,
          actionPath: "/mantenimiento/ots/programado",
          metadata: { month, count: ordered.length, ots: items },
          ...scopeFieldsOf(ordered[0]),
        },
      });
    }
  }

  return targets;
}

module.exports = {
  ALERT_WINDOWS,
  BUSINESS_UTC_OFFSET_HOURS,
  ENTITY_TYPE_OT,
  NOTIFICATION_TYPE_DEADLINE,
  NOTIFICATION_TYPE_MONTHLY,
  OT_STATE_EN_PROCESO,
  OT_STATE_FINALIZADA,
  OT_STATE_SOLICITADA,
  buildNotificationId,
  buildProfileIndex,
  businessToday,
  daysBetweenIso,
  deadlineAlertTexts,
  isMantenimientoProfile,
  isValidIsoDate,
  monthlySummaryTexts,
  otDetailPath,
  profileMatchesOtScope,
  resolveRecipientUids,
  safe,
  sanitizeIdPart,
  scopeFieldsOf,
  scopeKeyOf,
  selectDeadlineAlertTargets,
  selectDueOts,
  selectMonthlySummaryTargets,
};
