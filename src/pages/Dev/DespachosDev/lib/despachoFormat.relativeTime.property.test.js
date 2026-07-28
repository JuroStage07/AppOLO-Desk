// Feature: despachos-dev, Property 7: Tiempo relativo consistente
//
// Property 7: Tiempo relativo consistente — Validates: Requirements 3.5
// "Para todo par (updated_at, now) con updated_at ≤ now, relativeTime produce un
// texto relativo en español no vacío, y a mayor diferencia temporal el resultado
// nunca corresponde a un instante más reciente (monotonicidad del sentido
// 'hace …')."

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { relativeTime, PLACEHOLDER } from "./despachoFormat.js";

// Umbrales de bucketing reflejados desde el módulo (relativeTime):
//   seconds < 60           -> "segundo(s)"  (tier 0)
//   minutes < 60           -> "minuto(s)"   (tier 1)
//   hours   < 24           -> "hora(s)"     (tier 2)
//   days    < 30           -> "día(s)"      (tier 3)
//   days    < 365          -> "mes/meses"   (tier 4)
//   resto                  -> "año(s)"      (tier 5)
//
// La unidad determina el "tier" (magnitud gruesa) y el número acompañante la
// magnitud fina dentro del tier. La tupla [tier, valor] es monótona no
// decreciente respecto a la diferencia temporal.
const UNIT_TIER = {
  segundo: 0,
  segundos: 0,
  minuto: 1,
  minutos: 1,
  hora: 2,
  horas: 2,
  día: 3,
  días: 3,
  mes: 4,
  meses: 4,
  año: 5,
  años: 5,
};

// Convierte la salida de relativeTime ("hace N unidad") a una magnitud ordenable
// [tier, valor]. Lanza si el formato no coincide (lo que haría fallar el test,
// evidenciando una salida inesperada).
function magnitude(texto) {
  const match = /^hace (\d+) (.+)$/.exec(texto);
  if (!match) {
    throw new Error(`Formato de tiempo relativo inesperado: "${texto}"`);
  }
  const valor = Number(match[1]);
  const unidad = match[2];
  const tier = UNIT_TIER[unidad];
  if (tier === undefined) {
    throw new Error(`Unidad en español inesperada: "${unidad}"`);
  }
  return [tier, valor];
}

// Compara dos magnitudes [tier, valor] lexicográficamente.
// Devuelve negativo si a < b, 0 si iguales, positivo si a > b.
function compareMagnitud(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

// Generador de un instante base `now` en milisegundos epoch, en un rango realista
// (aprox. 1970..2100) para ejercitar valores plausibles de la app.
const nowMs = fc.integer({ min: 0, max: 4_102_444_800_000 });

// Generador de una diferencia temporal no negativa, hasta ~30 años en ms, de modo
// que se cubran todos los buckets (segundos..años), incluyendo el 0.
const MAX_DIFF_MS = 30 * 365 * 24 * 60 * 60 * 1000;
const diffMs = fc.integer({ min: 0, max: MAX_DIFF_MS });

describe("despachoFormat.relativeTime — Property 7: Tiempo relativo consistente", () => {
  it("para todo (updated_at ≤ now) produce un texto relativo en español no vacío (100+ iteraciones)", () => {
    fc.assert(
      fc.property(nowMs, diffMs, (now, diff) => {
        const updatedAt = now - diff; // updated_at ≤ now por construcción
        const resultado = relativeTime(updatedAt, now);

        // Texto visible no vacío y distinto del marcador de ausencia.
        expect(typeof resultado).toBe("string");
        expect(resultado.length).toBeGreaterThan(0);
        expect(resultado.trim().length).toBeGreaterThan(0);
        expect(resultado).not.toBe(PLACEHOLDER);

        // Español: "hace N <unidad>", con unidad conocida.
        expect(resultado.startsWith("hace ")).toBe(true);
        expect(() => magnitude(resultado)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("a mayor diferencia temporal la magnitud nunca disminuye (monotonicidad, 100+ iteraciones)", () => {
    fc.assert(
      fc.property(nowMs, diffMs, diffMs, (now, a, b) => {
        const diff1 = Math.min(a, b);
        const diff2 = Math.max(a, b); // diff1 ≤ diff2

        const resultado1 = relativeTime(now - diff1, now);
        const resultado2 = relativeTime(now - diff2, now);

        // A mayor diferencia (más antiguo), la magnitud del "hace …" no decrece.
        expect(compareMagnitud(magnitude(resultado2), magnitude(resultado1))).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});
