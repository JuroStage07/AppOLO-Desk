import { describe, expect, it } from "vitest";

import {
  catalogoPuertas,
  dayRangeUtc,
  estadoDesdeActividad,
  historialPorDespacho,
  layoutTipos,
  mapDispatch,
  seleccionarDespachos,
  todayIn,
} from "./lib";

const CODIGOS = new Set(["creado", "en proceso", "chofer_pendiente", "completo", "pendiente_validacion", "despachado", "rechazado", "eliminado", "finalizado"]);

describe("ops-3d-snapshot · lib", () => {
  it("día en Costa Rica (UTC-6) → rango UTC", () => {
    const { start, end } = dayRangeUtc("2026-11-03", "America/Costa_Rica");
    expect(start.toISOString()).toBe("2026-11-03T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-04T06:00:00.000Z");
    expect(todayIn("America/Costa_Rica", new Date("2026-11-04T05:59:00Z"))).toBe("2026-11-03");
    expect(() => dayRangeUtc("03/11/2026", "America/Costa_Rica")).toThrow();
  });

  it("estado desde la bitácora", () => {
    expect(estadoDesdeActividad("despacho_en_proceso", CODIGOS)).toBe("en proceso");
    expect(estadoDesdeActividad("despacho_chofer_pendiente", CODIGOS)).toBe("chofer_pendiente");
    expect(estadoDesdeActividad("despacho_editado", CODIGOS)).toBe(null);
    expect(estadoDesdeActividad("chofer_asignado", CODIGOS)).toBe(null);
  });

  it("historial ordenado y sin repetidos seguidos", () => {
    const h = historialPorDespacho(
      [
        { entidad_id: "a", tipo: "despacho_en_proceso", created_at: "2026-11-03T13:20:00Z" },
        { entidad_id: "a", tipo: "despacho_creado", created_at: "2026-11-03T12:40:00Z" },
        { entidad_id: "a", tipo: "despacho_editado", created_at: "2026-11-03T13:25:00Z" },
        { entidad_id: "a", tipo: "despacho_en_proceso", created_at: "2026-11-03T13:30:00Z" },
      ],
      CODIGOS
    );
    expect(h.get("a")).toEqual([
      { estado: "creado", at: "2026-11-03T12:40:00Z" },
      { estado: "en proceso", at: "2026-11-03T13:20:00Z" },
    ]);
  });

  it("selección: todos los del día; de antes solo los que no terminaron de cargar; nunca eliminados", () => {
    const { start, end } = dayRangeUtc("2026-11-03", "America/Costa_Rica");
    const rows = [
      { id: "hoy", estado: "despachado", fecha: "2026-11-03T15:00:00Z" },
      { id: "ayer-cargando", estado: "en proceso", fecha: "2026-11-02T15:00:00Z" },
      { id: "ayer-sin-chofer-fin-hoy", estado: "chofer_pendiente", fecha: "2026-11-02T15:00:00Z", finalized_at: "2026-11-03T08:00:00Z" },
      { id: "ayer-sin-chofer-fin-ayer", estado: "chofer_pendiente", fecha: "2026-11-02T15:00:00Z", finalized_at: "2026-11-02T20:00:00Z" },
      { id: "ayer-cerrado", estado: "despachado", fecha: "2026-11-02T15:00:00Z" },
      { id: "legacy", estado: "finalizado", fecha: "2026-11-01T15:00:00Z" },
      { id: "borrado", estado: "en proceso", fecha: "2026-11-03T15:00:00Z", deleted_at: "x" },
      { id: "manana", estado: "creado", fecha: "2026-11-04T15:00:00Z" },
    ];
    expect(seleccionarDespachos(rows, start, end).map((r) => r.id)).toEqual(["hoy", "ayer-cargando", "ayer-sin-chofer-fin-hoy"]);
  });

  it("puertas y acomodo", () => {
    expect(catalogoPuertas(["Puerta 15", "Puerta 11", "puerta 11", "", null, "Puerta 16"])).toEqual(["Puerta 11", "Puerta 15", "Puerta 16"]);
    expect(layoutTipos([{ type: "S" }, { type: "D" }, {}])).toEqual(["S", "D", "E"]);
    expect(layoutTipos([])).toBe(null);
  });

  it("despacho en la forma del contrato, sin datos personales extra", () => {
    const d = mapDispatch(
      { id: "x", estado: "en proceso", puerta: "Puerta 15", placa: "C-1", chofer_id: "c1", tarimas_s: "18", tarimas_d: 2, fecha: "f", notas: "secreto" },
      {
        estadoNombre: new Map([["en proceso", "En proceso"]]),
        choferNombre: new Map([["c1", "J. Mora"]]),
        layout: new Map([["x", [{ type: "S" }]]]),
        historial: new Map(),
      }
    );
    expect(d).toMatchObject({ estado_nombre: "En proceso", chofer: "J. Mora", tarimas_s: 18, tarimas_d: 2, layout: ["S"], history: [] });
    expect(d).not.toHaveProperty("notas");
    expect(d).not.toHaveProperty("cedula");
  });
});
