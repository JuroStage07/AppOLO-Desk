import { describe, expect, it, vi } from "vitest";

vi.mock("../../../firebase", () => ({ db: {} }));

import { duracionMs, estadoDescarga, filtrarDescargas, resumenGeneral, resumenPorAnden } from "./descargasAndenReporte";

const rows = [
  { idAnden: "02", tipo: "Recepcion EPA", cantidadBultos: 100, startedAt: 1, completedAt: 2, totalTimeMs: 3600000, proveedorNombre: "A" },
  { idAnden: "2", tipo: "Cofersa", cantidadBultos: 50, startedAt: 1, completedAt: 2, totalTimeMs: 1800000, proveedorNombre: "B" },
  { idAnden: "30", tipo: "Recepcion EPA", cantidadBultos: 10, startedAt: 1, proveedorNombre: "A" },
  { idAnden: "2", tipo: "Recepcion EPA", cantidadBultos: 999, proveedorNombre: "A" },
  { idAnden: "", tipo: "Traslado", cantidadBultos: 5 },
];

describe("reporte de descargas por andén", () => {
  it("'02' y '2' son el mismo andén; sin andén al final", () => {
    const r = resumenPorAnden(rows);
    expect(r.map((x) => x.anden)).toEqual([2, 30, null]);
    expect(r[0]).toMatchObject({ descargas: 3, finalizadas: 2, pendientes: 1, bultos: 1149, bultosFinalizadas: 150, tiempoMs: 5400000, proveedores: 2, promedioMs: 2700000 });
    expect(r[0].bultosHora).toBeCloseTo(100);
    expect(r[1]).toMatchObject({ descargas: 1, enProceso: 1, finalizadas: 0, promedioMs: 0 });
    expect(r[2]).toMatchObject({ descargas: 1, pendientes: 1 });
  });

  it("filtra por andenes, tipo y estado", () => {
    expect(filtrarDescargas(rows, { andenes: new Set([2]) })).toHaveLength(3);
    expect(filtrarDescargas(rows, { andenes: new Set([2, 30]), tipos: ["Recepcion EPA"] })).toHaveLength(3);
    expect(filtrarDescargas(rows, { estados: ["Pendiente"] })).toHaveLength(2);
    expect(filtrarDescargas(rows, { texto: "b" })).toHaveLength(1);
  });

  it("estado y duración", () => {
    expect(estadoDescarga(rows[0])).toBe("Finalizada");
    expect(estadoDescarga(rows[2])).toBe("En proceso");
    expect(duracionMs(rows[2])).toBe(0);
    expect(duracionMs({ startedAt: new Date(0), completedAt: new Date(600000), pausedTotalMs: 60000 })).toBe(540000);
  });

  it("totales generales", () => {
    expect(resumenGeneral(rows)).toMatchObject({ descargas: 5, finalizadas: 2, bultos: 1164, andenes: 3 });
  });
});
