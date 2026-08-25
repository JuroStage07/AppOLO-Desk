// Capa de dominio pura para "Despachos Dev": agrupación y orden.
//
// Este módulo es puro y determinista: no muta sus entradas ni depende de
// estado externo. Se valida mediante pruebas de propiedad (Properties 8, 9,
// 10, 11) descritas en el diseño de la feature `despachos-dev`.
//
// _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.2_

/** Código de estado que nunca produce grupo ni despacho visible. */
export const ESTADO_ELIMINADO = "eliminado";

/**
 * Compara dos valores para un orden DESCENDENTE.
 * Los valores nulos/indefinidos se ordenan al final de forma determinista.
 * @param {*} a
 * @param {*} b
 * @returns {number} negativo si `a` debe ir antes que `b`.
 */
function compareDesc(a, b) {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1; // ausentes al final
  if (bMissing) return -1;
  if (a > b) return -1; // mayor primero (descendente)
  if (a < b) return 1;
  return 0;
}

/**
 * Ordena una colección por `created_at` descendente; ante empates, por `id`
 * descendente. Devuelve un arreglo nuevo (no muta la entrada).
 * @template {{ created_at?: * , id?: * }} T
 * @param {readonly T[]} items
 * @returns {T[]}
 */
function sortByCreatedThenIdDesc(items) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((x, y) => {
    const byCreated = compareDesc(x?.created_at, y?.created_at);
    if (byCreated !== 0) return byCreated;
    return compareDesc(x?.id, y?.id);
  });
}

/**
 * Orden de despachos dentro de un grupo: `created_at` descendente, desempate
 * por `id` descendente. Puro y determinista; no muta la entrada.
 * @template {{ created_at?: *, id?: * }} T
 * @param {readonly T[]} despachos
 * @returns {T[]}
 * _Requirements: 2.4_
 */
export function sortDespachos(despachos) {
  return sortByCreatedThenIdDesc(despachos);
}

/**
 * Orden estable y determinista de entradas de historial: `created_at`
 * descendente, desempate por `id` descendente. Puro; no muta la entrada.
 * @template {{ created_at?: *, id?: * }} T
 * @param {readonly T[]} entries
 * @returns {T[]}
 * _Requirements: 6.2_
 */
export function sortHistorial(entries) {
  return sortByCreatedThenIdDesc(entries);
}

/**
 * Determina si un despacho está activo: `deleted_at` nulo y `estado`
 * distinto de `eliminado`.
 * @param {{ deleted_at?: *, estado?: * }} despacho
 * @returns {boolean}
 * _Requirements: 2.1, 2.5_
 */
function isDespachoActivo(despacho) {
  if (!despacho || typeof despacho !== "object") return false;
  const noBorrado = despacho.deleted_at === null || despacho.deleted_at === undefined;
  return noBorrado && despacho.estado !== ESTADO_ELIMINADO;
}

/**
 * Compara dos entradas de catálogo para el orden de grupos: ascendente por
 * `orden`; ante empates, alfabético ascendente por `nombre`.
 * @param {{ orden?: *, nombre?: * }} a
 * @param {{ orden?: *, nombre?: * }} b
 * @returns {number}
 * _Requirements: 2.3_
 */
function compareGrupos(a, b) {
  const ordA = Number(a?.orden);
  const ordB = Number(b?.orden);
  const aNaN = Number.isNaN(ordA);
  const bNaN = Number.isNaN(ordB);
  if (aNaN && !bNaN) return 1; // orden inválido al final
  if (!aNaN && bNaN) return -1;
  if (!aNaN && !bNaN && ordA !== ordB) return ordA - ordB; // ascendente
  // Desempate alfabético ascendente por nombre.
  return String(a?.nombre ?? "").localeCompare(String(b?.nombre ?? ""));
}

/**
 * Agrupa los despachos por estado usando el catálogo como fuente de verdad.
 *
 * - Considera únicamente despachos con `deleted_at` nulo y `estado <> 'eliminado'`.
 * - Produce exactamente un grupo por cada `codigo` del catálogo que tenga
 *   al menos un despacho asociado (sin grupos vacíos).
 * - Excluye siempre el grupo del estado `eliminado`.
 * - Orden de grupos: ascendente por `orden`; desempate alfabético ascendente
 *   por `nombre`.
 * - Orden de despachos dentro de cada grupo: `created_at` descendente,
 *   desempate por `id` descendente.
 *
 * Es puro y determinista; no muta `despachos` ni `catalogo`.
 *
 * @param {readonly { id?: *, estado?: *, created_at?: *, deleted_at?: * }[]} despachos
 * @param {readonly { codigo: string, nombre?: string, orden?: number }[]} catalogo
 * @returns {{ codigo: string, nombre: string, orden: number, despachos: object[] }[]}
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
 */
export function groupByEstado(despachos, catalogo) {
  const activos = Array.isArray(despachos) ? despachos.filter(isDespachoActivo) : [];
  const cat = Array.isArray(catalogo) ? catalogo : [];

  const grupos = [];
  for (const estado of cat) {
    if (!estado || typeof estado !== "object") continue;
    const codigo = estado.codigo;
    if (codigo === ESTADO_ELIMINADO) continue; // nunca se muestra el grupo eliminado

    const delEstado = activos.filter((d) => d?.estado === codigo);
    if (delEstado.length === 0) continue; // sin grupos vacíos

    grupos.push({
      codigo,
      nombre: estado.nombre ?? codigo,
      orden: estado.orden,
      despachos: sortDespachos(delEstado),
    });
  }

  return grupos.sort(compareGrupos);
}
