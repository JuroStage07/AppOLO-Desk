import { describe, expect, it, vi } from "vitest";

vi.mock("../../../firebase", () => ({ db: {} }));
vi.mock("../../../supabase", () => ({ supabase: {} }));

import { mapDespachoHistorial, resumenGeneral, resumenPorAnden, tarimasDesdeLayout } from "./despachoReporte";

const ts = (iso) => ({ toDate: () => new Date(iso) });

describe("historial de despachos (Firestore → forma del reporte)", () => {
  const row = mapDespachoHistorial("abc", {
    tenantId: "CR",
    company: "OLO",
    bodegaId: "CR-OLO-CLIRO",
    referencia: "EPA-20260115-0900-T4",
    tienda: "T4",
    puerta: "Puerta 12",
    estado: "finalizado",
    tarimasS: 10,
    tarimasD: 3,
    conDua: "No",
    fecha: ts("2026-01-15T15:00:00Z"),
    finalizedAt: ts("2026-01-15T16:00:00Z"),
    mrpTraslado: { estado: "ok" },
  });

  it("mapea campos camelCase a la forma de Supabase", () => {
    expect(row).toMatchObject({
      id: "historial-abc",
      origen: "historial",
      bodega_id: "CR-OLO-CLIRO",
      tarimas_s: 10,
      tarimas_d: 3,
      con_dua: "No",
      estado: "finalizado",
      fecha: "2026-01-15T15:00:00.000Z",
      finalized_at: "2026-01-15T16:00:00.000Z",
      mrp_traslado: "ok",
      chofer_id: null,
    });
  });

  it("acepta `fecha` guardada como texto ISO (registros viejos)", () => {
    const r = mapDespachoHistorial("x", { fecha: "2026-02-25T23:22:30.825Z", createdAt: ts("2026-02-25T23:22:31Z") });
    expect(r.fecha).toBe("2026-02-25T23:22:30.825Z");
    expect(mapDespachoHistorial("y", { createdAt: ts("2026-03-01T10:00:00Z") }).fecha).toBe("2026-03-01T10:00:00.000Z");
  });

  it("entra en los agregados igual que un despacho nuevo", () => {
    expect(resumenGeneral([row])).toMatchObject({ despachos: 1, sencillas: 10, dobles: 3, total: 13 });
    expect(resumenPorAnden([row])[0]).toMatchObject({ anden: 12, total: 13 });
  });

  it("estima tarimas desde el acomodo: una por lotId; D y T cuentan como dobles", () => {
    const slots = [
      { type: "S", lotId: "a" },
      { type: "S", lotId: "b" },
      { type: "D", lotId: "c", part: "L" },
      { type: "D", lotId: "c", part: "R" },
      { type: "T", lotId: "e", part: 1 },
      { type: "T", lotId: "e", part: 2 },
      { type: "T", lotId: "e", part: 3 },
      { type: "S" },
    ];
    expect(tarimasDesdeLayout(slots)).toEqual({ s: 2, d: 2 });
    expect(tarimasDesdeLayout(undefined)).toEqual({ s: 0, d: 0 });
  });
});
