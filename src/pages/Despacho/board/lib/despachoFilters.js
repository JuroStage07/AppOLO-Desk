/**
 * despachoFilters.js — Capa de dominio pura (Despachos Dev).
 *
 * Filtrado puro y determinista del listado de despachos por texto, estado y
 * rango de fechas, más helpers de validación de rango, estado inicial de
 * filtros y conteos por estado para el mini-resumen.
 *
 * Reglas (Requirement 4):
 *  - 4.1 Texto: coincidencia parcial, insensible a mayúsculas, sobre
 *    `referencia`, `tienda` y `placa`.
 *  - 4.2 Estados: selección vacía ⇒ todos; en otro caso `estado ∈ estados`.
 *  - 4.3 Fechas: `fecha` dentro de `[desde, hasta]` inclusive.
 *  - 4.4 Si el rango es inválido (`desde > hasta` con ambos presentes), no se
 *    aplica el filtro de fechas (los resultados no se alteran por fechas).
 *  - 4.5 Los tres filtros se combinan de forma acumulativa (conjunción / AND).
 *  - 4.6 `clearFilters()` restablece al estado inicial.
 *  - 4.7/4.8 El contador de visibles se deriva de `filterDespachos(...).length`.
 *  - 4.9 `countByEstado()` calcula los conteos por estado del mini-resumen.
 *
 * El módulo es puro: no muta sus entradas ni depende de estado externo.
 */

/**
 * Convierte un valor de fecha (Date, número epoch o string parseable) a un
 * timestamp numérico comparable. Devuelve `null` cuando el valor está ausente
 * o no puede interpretarse como fecha.
 */
function toTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : t;
}

function hasValue(value) {
  return value != null && value !== "";
}

/**
 * Coincidencia parcial insensible a mayúsculas sobre `referencia`, `tienda` y
 * `placa`. Texto vacío/ausente ⇒ no filtra (incluye todos). (Requirement 4.1)
 */
function matchesTexto(despacho, texto) {
  if (texto == null || texto === "") return true;
  const needle = String(texto).toLowerCase();
  const campos = [despacho?.referencia, despacho?.tienda, despacho?.placa];
  return campos.some(
    (campo) => campo != null && String(campo).toLowerCase().includes(needle),
  );
}

/**
 * Filtro de estado múltiple: selección vacía ⇒ todos; en otro caso el estado
 * del despacho debe pertenecer a la selección. (Requirement 4.2)
 */
function matchesEstados(despacho, estados) {
  if (!Array.isArray(estados) || estados.length === 0) return true;
  return estados.includes(despacho?.estado);
}

/**
 * Rango de fechas inclusivo. Si el rango es inválido (Requirement 4.4) o no hay
 * extremos definidos, no filtra. Un despacho sin `fecha` interpretable queda
 * excluido cuando hay un extremo activo. (Requirement 4.3)
 */
function matchesFecha(despacho, desde, hasta) {
  if (!isValidDateRange(desde, hasta)) return true;

  const hasDesde = hasValue(desde);
  const hasHasta = hasValue(hasta);
  if (!hasDesde && !hasHasta) return true;

  const t = toTime(despacho?.fecha);
  if (t == null) return false;

  if (hasDesde) {
    const d = toTime(desde);
    if (d != null && t < d) return false;
  }
  if (hasHasta) {
    const h = toTime(hasta);
    if (h != null && t > h) return false;
  }
  return true;
}

/**
 * Valida el rango de fechas. Devuelve `false` únicamente cuando ambas fechas
 * existen y `desde` es posterior a `hasta`. En cualquier otro caso (alguna
 * ausente o no interpretable) devuelve `true`. (Requirement 4.4)
 */
export function isValidDateRange(desde, hasta) {
  if (!hasValue(desde) || !hasValue(hasta)) return true;
  const d = toTime(desde);
  const h = toTime(hasta);
  if (d == null || h == null) return true;
  return d <= h;
}

/**
 * Aplica la conjunción (AND) de los filtros de texto, estado y fechas sobre la
 * lista de despachos. No muta la entrada: devuelve una nueva lista con los
 * despachos que satisfacen simultáneamente todos los filtros activos.
 * (Requirement 4.5)
 */
export function filterDespachos(despachos, filtros = {}) {
  if (!Array.isArray(despachos)) return [];
  const { texto = "", estados = [], desde = null, hasta = null } = filtros || {};
  return despachos.filter(
    (despacho) =>
      matchesTexto(despacho, texto) &&
      matchesEstados(despacho, estados) &&
      matchesFecha(despacho, desde, hasta),
  );
}

/**
 * Estado inicial de los filtros usado por la acción "limpiar filtros".
 * (Requirement 4.6)
 */
export function clearFilters() {
  return { texto: "", estados: [], desde: null, hasta: null };
}

/**
 * Conteos por estado sobre un conjunto de despachos (típicamente los visibles
 * tras aplicar los filtros), para el mini-resumen. La suma de los conteos es
 * igual al total de despachos recibidos. (Requirements 4.7, 4.8, 4.9)
 */
export function countByEstado(despachos) {
  const counts = {};
  if (!Array.isArray(despachos)) return counts;
  for (const despacho of despachos) {
    const estado = despacho?.estado;
    const key = estado == null ? "" : String(estado);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
