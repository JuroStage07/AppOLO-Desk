// Feature: despachos-dev — capa de dominio pura para el mapeo de estados.
//
// nombre y orden provienen del Catalogo_Estados (public.despacho_dev_estados)
// como fuente de verdad (Requirement 1.3). color e icono provienen de los
// tokens del tema (Requirement 1.4, 11.4/11.5); este módulo NUNCA embebe
// literales de hex/icono: los consume desde src/styles/theme.js.
//
// Módulo puro y reutilizable, validado por pruebas basadas en propiedades.

import {
  ESTADO_COLORS,
  ESTADO_ICONS,
  ESTADO_NEUTRO_COLOR,
  ESTADO_NEUTRO_ICON,
} from "../../../../styles/theme.js";

// Códigos de estado final deterministas (Requirement 1.7).
// isFinal(codigo) === true SÓLO para estos códigos.
export const ESTADO_FINAL = new Set(["despachado", "finalizado"]);

// Valores neutros para códigos desconocidos (Requirement 1.5).
export const ESTADO_NEUTRO = Object.freeze({
  color: ESTADO_NEUTRO_COLOR,
  icono: ESTADO_NEUTRO_ICON,
});

/**
 * Determina de forma determinista si un código corresponde a un estado final.
 * Devuelve `true` únicamente para `despachado` y `finalizado`; `false` para
 * cualquier otro código, incluidos los códigos no existentes en el mapa.
 * (Requirement 1.7 — Property 1)
 *
 * @param {string} codigo
 * @returns {boolean}
 */
export function isFinal(codigo) {
  return ESTADO_FINAL.has(codigo);
}

/**
 * Color del estado desde los tokens del tema. Devuelve el color neutro
 * (#9ca3af) para códigos desconocidos. (Requirement 1.4/1.5 — Property 3)
 *
 * @param {string} codigo
 * @returns {string} hex color
 */
export function colorFor(codigo) {
  return Object.prototype.hasOwnProperty.call(ESTADO_COLORS, codigo)
    ? ESTADO_COLORS[codigo]
    : ESTADO_NEUTRO_COLOR;
}

/**
 * Nombre de ícono (lucide) del estado desde los tokens del tema. Devuelve el
 * ícono neutro (`FileText`) para códigos desconocidos. (Requirement 1.4/1.5)
 *
 * @param {string} codigo
 * @returns {string} nombre de ícono
 */
export function iconFor(codigo) {
  return Object.prototype.hasOwnProperty.call(ESTADO_ICONS, codigo)
    ? ESTADO_ICONS[codigo]
    : ESTADO_NEUTRO_ICON;
}

/**
 * Etiqueta legible del estado. Usa el `nombre` del Catalogo_Estados como
 * fuente de verdad; si el código no existe en el catálogo, devuelve el propio
 * código como etiqueta. (Requirement 1.3/1.5 — Property 3)
 *
 * @param {string} codigo
 * @param {Array<{ codigo: string, nombre?: string, orden?: number, es_final?: boolean, es_activo?: boolean }>} [catalogo]
 * @returns {string}
 */
export function labelFor(codigo, catalogo) {
  const entry = Array.isArray(catalogo)
    ? catalogo.find((e) => e && e.codigo === codigo)
    : undefined;
  const nombre = entry && entry.nombre;
  return typeof nombre === "string" && nombre.length > 0 ? nombre : codigo;
}

/**
 * Construye el Mapa_Estados a partir del Catalogo_Estados. Toma `nombre` y
 * `orden` del catálogo (fuente de verdad, Requirement 1.3) y `color`/`icono`
 * de los tokens del tema (Requirement 1.4). Expone los helpers `get`, `label`,
 * `color` e `isFinal` desde un único módulo reutilizable (Requirement 1.6).
 *
 * Para códigos desconocidos: color/icono neutros y el propio código como
 * etiqueta (Requirement 1.5).
 *
 * @param {Array<{ codigo: string, nombre?: string, orden?: number, es_final?: boolean, es_activo?: boolean }>} catalogo
 * @returns {{
 *   get: (codigo: string) => { codigo: string, nombre: string, orden: number|null, color: string, icono: string, isFinal: boolean },
 *   label: (codigo: string) => string,
 *   color: (codigo: string) => string,
 *   icon: (codigo: string) => string,
 *   isFinal: (codigo: string) => boolean,
 * }}
 */
export function buildMapaEstados(catalogo) {
  // Índice por código para consultas O(1) de nombre/orden desde el catálogo.
  const byCodigo = new Map();
  if (Array.isArray(catalogo)) {
    for (const entry of catalogo) {
      if (entry && typeof entry.codigo === "string") {
        byCodigo.set(entry.codigo, entry);
      }
    }
  }

  const label = (codigo) => {
    const entry = byCodigo.get(codigo);
    const nombre = entry && entry.nombre;
    return typeof nombre === "string" && nombre.length > 0 ? nombre : codigo;
  };

  const get = (codigo) => {
    const entry = byCodigo.get(codigo);
    const orden =
      entry && typeof entry.orden === "number" ? entry.orden : null;
    return {
      codigo,
      nombre: label(codigo),
      orden,
      color: colorFor(codigo),
      icono: iconFor(codigo),
      isFinal: isFinal(codigo),
    };
  };

  return {
    get,
    label,
    color: colorFor,
    icon: iconFor,
    isFinal,
  };
}
