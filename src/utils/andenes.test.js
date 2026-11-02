import { describe, expect, it } from "vitest";

import { andenNumero, compareAnden, formatAndenes, matchAnden, parseAndenes } from "./andenes";

const set = (...n) => new Set(n);

describe("andenes", () => {
  it("normaliza los formatos de Despacho y Recepción", () => {
    expect(andenNumero("Puerta 14")).toBe(14);
    expect(andenNumero("02")).toBe(2);
    expect(andenNumero("2")).toBe(2);
    expect(andenNumero(7)).toBe(7);
    expect(andenNumero("")).toBe(null);
    expect(andenNumero(null)).toBe(null);
    expect(andenNumero("sin dato")).toBe(null);
  });

  it("lee andenes sueltos y rangos", () => {
    expect(parseAndenes("1-3, 8, 12")).toEqual({ andenes: set(1, 2, 3, 8, 12), error: "" });
    expect(parseAndenes("11 a 13")).toEqual({ andenes: set(11, 12, 13), error: "" });
    expect(parseAndenes("5-3")).toEqual({ andenes: set(3, 4, 5), error: "" });
    expect(parseAndenes("  ")).toEqual({ andenes: set(), error: "" });
  });

  it("avisa cuando no entiende la selección", () => {
    expect(parseAndenes("1-3, x").error).toMatch(/No se entiende/);
    expect(parseAndenes("1-9999").error).toMatch(/demasiado amplio/);
  });

  it("filtra con la selección (vacía = todos)", () => {
    expect(matchAnden("Puerta 12", set(11, 12))).toBe(true);
    expect(matchAnden("01", set(1))).toBe(true);
    expect(matchAnden("Puerta 16", set(11, 12))).toBe(false);
    expect(matchAnden("", set(1))).toBe(false);
    expect(matchAnden("", set())).toBe(true);
  });

  it("formatea y ordena", () => {
    expect(formatAndenes(set(9, 1, 2, 3, 5, 8))).toBe("1-3, 5, 8-9");
    expect([3, null, 1].sort(compareAnden)).toEqual([1, 3, null]);
  });
});
