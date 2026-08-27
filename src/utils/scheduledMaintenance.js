/**
 * Mantenimiento programado — helpers puros compartidos por el frontend.
 *
 * Una OT programada es una OT normal de `solicitudesOT` con:
 *   - `scheduledMaintenance: true`
 *   - `scheduledDate: "YYYY-MM-DD"` (deadline)
 *   - responsable(s) y subtareas definidos desde la creación
 *
 * Nace con `OTState: "Solicitada"` (columna «Tareas Pendientes») y el job diario
 * la pasa a «En proceso» cuando llega el deadline. Desde ahí usa el flujo normal.
 *
 * ── Zona horaria ────────────────────────────────────────────────────────────
 * El deadline se guarda como string ISO `YYYY-MM-DD` y NO como Timestamp: el
 * orden lexicográfico coincide con el cronológico y el "día de hoy" se resuelve
 * en un único lugar con un offset de negocio fijo. Así un usuario en otra zona
 * horaria (o el runtime UTC de Cloud Functions) no adelanta ni atrasa el día.
 *
 * La misma constante y la misma aritmética están replicadas en
 * `functions/scheduledMaintenance.js` (CommonJS, no puede importar de `src/`).
 * Si cambia una, cambiar la otra.
 */

/** Offset de negocio: Costa Rica (UTC−6, sin horario de verano). */
export const BUSINESS_UTC_OFFSET_HOURS = -6;

/** Ventanas de aviso previas al deadline, en días. */
export const SCHEDULED_ALERT_WINDOWS = [15, 7, 1];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ¿El documento de OT es un mantenimiento programado? */
export function isScheduledMaintenanceOt(data) {
  return data?.scheduledMaintenance === true;
}

/** `YYYY-MM-DD` bien formado y con una fecha real (rechaza 2026-02-31). */
export function isValidIsoDate(value) {
  const s = String(value ?? "").trim();
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

/**
 * Fecha de negocio (`YYYY-MM-DD`) para un instante dado.
 * @param {Date|number} [now] instante de referencia; por defecto, ahora.
 */
export function businessToday(now = Date.now()) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  const shifted = new Date(ms + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Mes de negocio (`YYYY-MM`) para un instante dado. */
export function businessMonth(now = Date.now()) {
  return businessToday(now).slice(0, 7);
}

/**
 * Días calendario entre dos fechas ISO (`toIso - fromIso`).
 * Positivo = `toIso` está en el futuro. `null` si alguna fecha es inválida.
 */
export function daysBetweenIso(fromIso, toIso) {
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) return null;
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * Días que faltan para el deadline según la fecha de negocio.
 * 0 = vence hoy, negativo = vencido.
 */
export function daysUntilDeadline(scheduledDate, now = Date.now()) {
  return daysBetweenIso(businessToday(now), scheduledDate);
}

/**
 * ¿La OT programada ya debería estar activa (deadline alcanzado)?
 * Se usa solo para señalizar en la UI; la transición real la hace el job.
 */
export function isDeadlineReached(scheduledDate, now = Date.now()) {
  const days = daysUntilDeadline(scheduledDate, now);
  return days != null && days <= 0;
}

/**
 * Ventanas de aviso que ya no se pueden emitir para un deadline creado hoy.
 * Sirve para avisar en el formulario: si faltan 5 días, los avisos de 15 y 7
 * nunca van a dispararse. No es un error, solo información para el usuario.
 */
export function missedAlertWindows(scheduledDate, now = Date.now()) {
  const days = daysUntilDeadline(scheduledDate, now);
  if (days == null) return [];
  return SCHEDULED_ALERT_WINDOWS.filter((w) => w > days);
}

/** Etiqueta corta del estado temporal del deadline, para chips de la UI. */
export function deadlineLabel(scheduledDate, now = Date.now()) {
  const days = daysUntilDeadline(scheduledDate, now);
  if (days == null) return "";
  if (days < 0) return `Vencido hace ${Math.abs(days)} d`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Falta 1 día";
  return `Faltan ${days} días`;
}

/**
 * Validación de un borrador de OT programada. Reglas del negocio: no puede
 * existir una OT programada sin responsable, sin deadline o sin subtareas.
 * @returns {Record<string, string>} errores por campo (vacío = válido)
 */
export function validateScheduledOtDraft(draft, now = Date.now()) {
  const errors = {};
  const responsables = Array.isArray(draft?.responsables) ? draft.responsables : [];
  const subtareas = Array.isArray(draft?.subtareas) ? draft.subtareas : [];

  if (!String(draft?.nombreOT ?? "").trim()) {
    errors.nombreOT = "Ingresá el nombre de la OT.";
  }
  if (!String(draft?.descripcionOT ?? "").trim()) {
    errors.descripcionOT = "Ingresá la descripción.";
  }
  if (!isValidIsoDate(draft?.scheduledDate)) {
    errors.scheduledDate = "Seleccioná la fecha programada (deadline).";
  } else if (daysUntilDeadline(draft.scheduledDate, now) < 0) {
    errors.scheduledDate = "La fecha programada no puede estar en el pasado.";
  }
  if (responsables.filter((r) => String(r?.uid ?? "").trim()).length === 0) {
    errors.responsables = "Elegí al menos un responsable.";
  }
  if (subtareas.filter((s) => String(s?.title ?? "").trim()).length === 0) {
    errors.subtareas = "Agregá al menos una subtarea.";
  }

  return errors;
}
