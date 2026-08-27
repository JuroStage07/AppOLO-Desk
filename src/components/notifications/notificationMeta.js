/**
 * Presentación por tipo de notificación.
 *
 * Punto de extensión del centro de notificaciones: para que otro módulo aporte
 * sus propias notificaciones basta agregar una entrada acá (icono + etiqueta de
 * origen). Un tipo desconocido cae en `DEFAULT_META`, así que el panel nunca se
 * rompe si el backend empieza a emitir un tipo nuevo antes de tocar el frontend.
 */
import { Bell, CalendarClock, CalendarDays, Wrench } from "lucide-react";

import { ACCENT } from "../../styles/theme";

const BLUE = "#2563EB";
const AMBER = "#F59E0B";

export const NOTIFICATION_META = {
  scheduled_maintenance_deadline: {
    icon: CalendarClock,
    source: "Mantenimiento programado",
    color: AMBER,
  },
  scheduled_maintenance_monthly: {
    icon: CalendarDays,
    source: "Mantenimiento programado",
    color: BLUE,
  },
};

export const DEFAULT_META = {
  icon: Bell,
  source: "AppoloDesk",
  color: ACCENT,
};

/** Icono, origen y color para un tipo de notificación. */
export function notificationMeta(type) {
  return NOTIFICATION_META[type] || DEFAULT_META;
}

/**
 * Entidad relacionada (chip de contexto). Igual que `NOTIFICATION_META`, es un
 * punto de extensión: agregar acá el `entityType` que emita otro módulo.
 */
export const ENTITY_META = {
  solicitudOT: { label: "Orden de trabajo", icon: Wrench },
};

const EMPTY_ENTITY_META = { label: "", icon: null };

/** Etiqueta e icono de la entidad relacionada; nunca devuelve undefined. */
export function entityMeta(entityType) {
  if (!entityType) return EMPTY_ENTITY_META;
  return ENTITY_META[entityType] || { label: String(entityType), icon: null };
}

/** Fecha relativa corta, en español, para la lista. */
export function relativeTimeEs(createdAtMs, nowMs = Date.now()) {
  if (!createdAtMs) return "";
  const diff = Math.max(0, nowMs - createdAtMs);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  return new Date(createdAtMs).toLocaleDateString("es-CR");
}
