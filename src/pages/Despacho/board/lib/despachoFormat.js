// Capa de dominio pura para "Despachos Dev".
// Utilidades de formato deterministas y sin efectos secundarios:
//   - formatSD:     formato de tarimas "S/D" con marcador por lado no numérico.
//   - relativeTime: tiempo relativo en español (recibe `now` como parámetro).
//   - orNoValue:    marcador de ausencia visible ("—") para valores nulos/vacíos.
//
// Requirements: 3.1, 3.5, 3.6, 5.3, 5.8

/**
 * Marcador de ausencia visible (guion largo). Texto no vacío para tarjetas/detalle.
 * @type {string}
 */
export const PLACEHOLDER = "—";

/**
 * Determina si un valor puede tratarse como número finito.
 * Acepta números finitos y cadenas no vacías que representan un número finito.
 * @param {unknown} value
 * @returns {boolean}
 */
function isNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    return Number.isFinite(Number(trimmed));
  }
  return false;
}

/**
 * Convierte un lado de tarimas a texto: su valor numérico normalizado o el
 * marcador de ausencia cuando el lado no es numérico.
 * @param {unknown} value
 * @returns {string}
 */
function sideText(value) {
  if (isNumericValue(value)) {
    return String(Number(value));
  }
  return PLACEHOLDER;
}

/**
 * Devuelve un marcador de ausencia legible y visible ("—") para valores nulos,
 * indefinidos, cadenas vacías o compuestas solo de espacios. Para cualquier otro
 * valor devuelve una representación de texto no vacía.
 *
 * Requirements: 3.6, 5.3, 5.8
 * @param {unknown} value
 * @returns {string} Texto visible no vacío (nunca "" ni solo espacios).
 */
export function orNoValue(value) {
  if (value === null || value === undefined) {
    return PLACEHOLDER;
  }
  if (typeof value === "string") {
    return value.trim().length === 0 ? PLACEHOLDER : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : PLACEHOLDER;
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  const text = String(value);
  return text.trim().length === 0 ? PLACEHOLDER : text;
}

/**
 * Formatea las tarimas en formato "S/D": el valor de `tarimasS` a la izquierda de
 * la barra y el de `tarimasD` a la derecha. Cualquier lado no numérico se sustituye
 * por el marcador de ausencia ("—") sin romper el formato.
 *
 * Requirements: 3.1, 3.6
 * @param {unknown} tarimasS
 * @param {unknown} tarimasD
 * @returns {string} Cadena "<S>/<D>" siempre no vacía.
 */
export function formatSD(tarimasS, tarimasD) {
  return `${sideText(tarimasS)}/${sideText(tarimasD)}`;
}

/**
 * Convierte un valor de fecha (Date, timestamp numérico o cadena ISO) a
 * milisegundos. Devuelve `null` cuando no es interpretable.
 * @param {Date|number|string|null|undefined} value
 * @returns {number|null}
 */
function toMillis(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Devuelve la forma singular o plural de una unidad de tiempo.
 * @param {number} n
 * @param {string} singular
 * @param {string} [pluralForm]
 * @returns {string}
 */
function unitLabel(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm || `${singular}s`;
}

/**
 * Produce un texto de tiempo relativo en español ("hace 5 minutos") respecto a
 * `now`. Es determinista: `now` se recibe como parámetro.
 *
 * La descripción es monotónica respecto a la diferencia temporal: a mayor
 * diferencia, el resultado nunca corresponde a un instante más reciente.
 * Diferencias negativas (fecha futura) se tratan como 0. Entradas no
 * interpretables devuelven el marcador de ausencia ("—").
 *
 * Requirements: 3.5
 * @param {Date|number|string|null|undefined} updatedAt
 * @param {Date|number|string|null|undefined} now
 * @returns {string} Texto relativo en español no vacío, o "—" si no es interpretable.
 */
export function relativeTime(updatedAt, now) {
  const updatedMs = toMillis(updatedAt);
  const nowMs = toMillis(now);
  if (updatedMs === null || nowMs === null) {
    return PLACEHOLDER;
  }

  const diffMs = Math.max(0, nowMs - updatedMs);

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `hace ${seconds} ${unitLabel(seconds, "segundo")}`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} ${unitLabel(minutes, "minuto")}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} ${unitLabel(hours, "hora")}`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `hace ${days} ${unitLabel(days, "día")}`;
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    return `hace ${months} ${unitLabel(months, "mes", "meses")}`;
  }

  const years = Math.floor(days / 365);
  return `hace ${years} ${unitLabel(years, "año")}`;
}
