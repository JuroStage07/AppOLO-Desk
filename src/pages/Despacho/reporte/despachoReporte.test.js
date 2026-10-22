import { describe, expect, it, vi } from "vitest";

vi.mock("../../../supabase", () => ({ supabase: {} }));

import {
  filtrarReporte,
  rangoRapido,
  resumenGeneral,
  resumenPorDia,
  resumenPorTienda,
  tiendaKey,
  totalTarimas,
} from "./despachoReporte";

const rows = [
  { id: "1", tienda: "T8", estado: "despachado", tarimas_s: 18, tarimas_d: 2, fecha: new Date(2026, 7, 18, 16, 47).toISOString(), referencia: "EPA-20260818-1647-T8" },
  { id: "2", tienda: "T8", estado: "chofer_pendiente", tarimas_s: 10, tarimas_d: 0, fecha: new Date(2026, 7, 18, 9, 0).toISOString(), placa: "C123" },
  { id: "3", tienda: "T2", estado: "chofer_pendiente", tarimas_s: 5, tarimas_d: 4, fecha: new Date(2026, 7, 19, 8, 0).toISOString() },
  { id: "4", tienda: "", estado: "en proceso", tarimas_s: null, tarimas_d: "3", fecha: new Date(2026, 7, 19, 10, 0).toISOString() },
];

describe("despachoReporte", () => {
  it("total de tarimas = sencillas + dobles, tolerando nulos y strings", () => {
    expect(totalTarimas(rows[0])).toBe(20);
    expect(totalTarimas(rows[3])).toBe(3);
  });

  it("tienda vacía se agrupa como —", () => {
    expect(tiendaKey(rows[3])).toBe("—");
  });

  it("resumen general", () => {
    expect(resumenGeneral(rows)).toEqual({ despachos: 4, sencillas: 33, dobles: 9, total: 42, tiendas: 3, promedio: 10.5 });
  });

  it("por tienda ordena por total desc", () => {
    const t = resumenPorTienda(rows);
    expect(t.map((x) => x.tienda)).toEqual(["T8", "T2", "—"]);
    expect(t[0]).toMatchObject({ despachos: 2, sencillas: 28, dobles: 2, total: 30, promedio: 15 });
  });

  it("por día agrupa por día local", () => {
    const d = resumenPorDia(rows);
    expect(d.map((x) => [x.dia, x.despachos, x.total])).toEqual([
      ["2026-08-19", 2, 12],
      ["2026-08-18", 2, 30],
    ]);
  });

  it("filtra por estado, tienda y texto", () => {
    expect(filtrarReporte(rows, { estados: ["chofer_pendiente"] }).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filtrarReporte(rows, { tiendas: ["T8"] }).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filtrarReporte(rows, { texto: "c123" }).map((r) => r.id)).toEqual(["2"]);
    expect(filtrarReporte(rows, { tiendas: ["—"] }).map((r) => r.id)).toEqual(["4"]);
  });

  it("rangos rápidos", () => {
    const now = new Date(2026, 9, 22, 12);
    expect(rangoRapido("hoy", now)).toEqual({ desde: "2026-10-22", hasta: "2026-10-22" });
    expect(rangoRapido("7d", now)).toEqual({ desde: "2026-10-16", hasta: "2026-10-22" });
    expect(rangoRapido("mes", now)).toEqual({ desde: "2026-10-01", hasta: "2026-10-22" });
    expect(rangoRapido("mesAnterior", now)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
});
