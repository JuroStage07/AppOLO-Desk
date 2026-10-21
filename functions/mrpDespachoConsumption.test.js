import { describe, expect, it } from "vitest";

import { buildDespachoConsumptions, parseDespachoEventId, validateDespachoConsumption } from "./mrpDespachoConsumption";

const ID = "971234eb-212f-4fa6-983c-687f81558137";
const DESPACHO = {
  id: ID,
  tenant_id: "CR",
  company: "OLO",
  bodega_id: "CR-OLO-CLIRO",
  tienda: "T8",
  tarimas_s: 17,
  tarimas_d: 2,
  finalized_at: "2026-10-20T00:51:00Z",
  deleted_at: null,
};
const CONFIG = { articulo_s: "30000390", articulo_d: "30000391" };
const PROFILE = { tenantId: "CR", company: "OLO", bodegaId: "CR-OLO-CLIRO" };
const ev = (art) => `DESPACHO-${ID}-ARTICULO-${art}`;

describe("parseDespachoEventId", () => {
  it("separa despacho y artículo", () => {
    expect(parseDespachoEventId(ev("30000390"))).toEqual({ despachoId: ID, articuloCodigo: "30000390" });
    expect(parseDespachoEventId("MANUAL-123")).toBeNull();
    expect(parseDespachoEventId("")).toBeNull();
  });
});

describe("buildDespachoConsumptions", () => {
  it("sencillas → articulo_s, dobles → articulo_d, con la tienda del despacho", () => {
    expect(buildDespachoConsumptions(DESPACHO, CONFIG)).toEqual([
      { articuloCodigo: "30000390", cantidad: 17, externalEventId: ev("30000390"), bodegaId: "CR-OLO-CLIRO", tiendaExterna: "T8" },
      { articuloCodigo: "30000391", cantidad: 2, externalEventId: ev("30000391"), bodegaId: "CR-OLO-CLIRO", tiendaExterna: "T8" },
    ]);
  });
  it("omite cantidades en cero", () => {
    expect(buildDespachoConsumptions({ ...DESPACHO, tarimas_d: 0 }, CONFIG).map((i) => i.articuloCodigo)).toEqual(["30000390"]);
  });
});

describe("validateDespachoConsumption", () => {
  const base = { profile: PROFILE, despacho: DESPACHO, config: CONFIG };

  it("acepta el consumo exacto de un despacho finalizado de su bodega", () => {
    const r = validateDespachoConsumption({ ...base, request: { externalEventId: ev("30000391"), cantidad: 2 } });
    expect(r).toEqual({ ok: true, item: expect.objectContaining({ articuloCodigo: "30000391", cantidad: 2, tiendaExterna: "T8" }) });
  });

  it("rechaza eventos que no son de despacho (no da acceso libre al MRP)", () => {
    expect(validateDespachoConsumption({ ...base, request: { externalEventId: "AJUSTE-1", cantidad: 5 } })).toMatchObject({
      ok: false,
      code: "permission-denied",
    });
  });

  it("rechaza cantidades distintas a las del despacho", () => {
    expect(validateDespachoConsumption({ ...base, request: { externalEventId: ev("30000390"), cantidad: 999 } })).toMatchObject({
      ok: false,
      code: "invalid-argument",
    });
  });

  it("rechaza despachos no finalizados, borrados, de otra bodega o de otro país", () => {
    const req = { externalEventId: ev("30000390"), cantidad: 17 };
    expect(validateDespachoConsumption({ ...base, request: req, despacho: { ...DESPACHO, finalized_at: null } }).code).toBe("failed-precondition");
    expect(validateDespachoConsumption({ ...base, request: req, despacho: { ...DESPACHO, deleted_at: "x" } }).code).toBe("not-found");
    expect(validateDespachoConsumption({ ...base, request: req, profile: { ...PROFILE, bodegaId: "CR-OLO-ELCOCO" } }).code).toBe("permission-denied");
    expect(validateDespachoConsumption({ ...base, request: req, profile: { ...PROFILE, tenantId: "VNZ" } }).code).toBe("permission-denied");
  });

  it("rechaza un artículo que no es de las tarimas del despacho", () => {
    expect(validateDespachoConsumption({ ...base, request: { externalEventId: ev("99999999"), cantidad: 1 } }).code).toBe("invalid-argument");
  });
});
