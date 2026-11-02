// Andenes: normalización y selección por rangos.
//
// El andén llega con formatos distintos según el módulo: Despacho guarda la
// puerta como "Puerta 14"; Recepción guarda `idAnden` como "02" o "2". Todo se
// reduce al número de andén, así "01" y "1" son el mismo.

/** Número de andén de un valor ("Puerta 14" → 14, "02" → 2), o null si no tiene. */
export function andenNumero(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  const m = String(value).match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/** Etiqueta legible de un andén ("Andén 14" / "Sin andén"). */
export function andenLabel(n) {
  return n === null || n === undefined ? "Sin andén" : `Andén ${n}`;
}

/** Clave de agrupación: el número, o null para "Sin andén". */
export const andenKey = andenNumero;

/**
 * Interpreta una selección escrita: "1-5, 8, 12" o "11 a 16".
 * @returns {{ andenes: Set<number>, error: string }}
 */
export function parseAndenes(texto) {
  const andenes = new Set();
  const raw = String(texto || "").trim();
  if (!raw) return { andenes, error: "" };

  // "11 a 13" / "11 al 13" / "11 - 13" → "11-13", luego se corta por comas o espacios.
  const normalizado = raw.replace(/(\d)\s*(?:-|al|a)\s*(\d)/gi, "$1-$2");
  for (const part of normalizado.split(/[,;\s]+/).filter(Boolean)) {
    const rango = part.match(/^(\d+)-(\d+)$/);
    if (rango) {
      let ini = Number(rango[1]);
      let fin = Number(rango[2]);
      if (ini > fin) [ini, fin] = [fin, ini];
      if (fin - ini > 500) return { andenes: new Set(), error: `El rango ${part} es demasiado amplio.` };
      for (let n = ini; n <= fin; n++) andenes.add(n);
      continue;
    }
    if (/^\d+$/.test(part)) {
      andenes.add(Number(part));
      continue;
    }
    return { andenes: new Set(), error: `No se entiende «${part}». Usá números y rangos, ej. 1-5, 8, 12.` };
  }
  return { andenes, error: "" };
}

/** Texto compacto de una selección: {1,2,3,5,8,9} → "1-3, 5, 8-9". */
export function formatAndenes(andenes) {
  const nums = [...(andenes || [])].filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}-${nums[j]}` : String(nums[i]));
    i = j;
  }
  return out.join(", ");
}

/** ¿El valor pertenece a la selección? Selección vacía = todos. */
export function matchAnden(value, andenes) {
  if (!andenes || andenes.size === 0) return true;
  const n = andenNumero(value);
  return n !== null && andenes.has(n);
}

/** Ordena claves de andén: números ascendentes y "Sin andén" al final. */
export function compareAnden(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a - b;
}
