import {
  assignedBodegaIds,
  buildAssignmentPatch,
  groupBodegasByScope,
  parseBodegaId,
  resolveBodegas,
  scopeLabel,
  scopePatchFor,
} from "./userScope";

const CATALOG = {
  tenants: [
    { id: "CR", name: "Costa Rica", active: true },
    { id: "VNZ", name: "Venezuela", active: true },
  ],
  companies: [{ id: "OLO", name: "OLO", active: true }],
  bodegas: [
    { id: "CR-OLO-CLIRO", tenantId: "CR", companyId: "OLO", code: "CLIRO", name: "CLIRO", active: true },
    { id: "CR-OLO-ELCOCO", tenantId: "CR", companyId: "OLO", code: "ELCOCO", name: "El Coco", active: true },
    { id: "VNZ-OLO-SANDIEGO", tenantId: "VNZ", companyId: "OLO", code: "SANDIEGO", name: "San Diego", active: true },
  ],
};

describe("parseBodegaId", () => {
  it("separa país, compañía y código", () => {
    expect(parseBodegaId("VNZ-OLO-SANDIEGO")).toEqual({ tenantId: "VNZ", company: "OLO", code: "SANDIEGO" });
    expect(parseBodegaId("cualquier-cosa")).toBeNull();
    expect(parseBodegaId("")).toBeNull();
  });
});

describe("assignedBodegaIds", () => {
  it("une bodegaIds con el almacén activo sin duplicar", () => {
    expect(assignedBodegaIds({ bodegaIds: ["CR-OLO-ELCOCO"], bodegaId: "CR-OLO-CLIRO" })).toEqual([
      "CR-OLO-ELCOCO",
      "CR-OLO-CLIRO",
    ]);
    expect(assignedBodegaIds({ bodegaIds: ["CR-OLO-CLIRO"], bodegaId: "CR-OLO-CLIRO" })).toEqual(["CR-OLO-CLIRO"]);
    expect(assignedBodegaIds({})).toEqual([]);
  });
});

describe("resolveBodegas / groupBodegasByScope", () => {
  it("resuelve con el catálogo y conserva IDs desconocidos", () => {
    const list = resolveBodegas(["CR-OLO-CLIRO", "PA-OLO-COLON", "basura"], CATALOG);
    expect(list.map((b) => b.id)).toEqual(["CR-OLO-CLIRO", "PA-OLO-COLON"]);
    expect(list[1]).toMatchObject({ tenantId: "PA", companyId: "OLO", unknown: true });
  });

  it("agrupa por país y compañía", () => {
    const groups = groupBodegasByScope(resolveBodegas(["VNZ-OLO-SANDIEGO", "CR-OLO-ELCOCO", "CR-OLO-CLIRO"], CATALOG), CATALOG);
    expect(groups.map((g) => g.key)).toEqual(["CR·OLO", "VNZ·OLO"]);
    expect(groups[0].tenantName).toBe("Costa Rica");
    expect(groups[0].bodegas.map((b) => b.name)).toEqual(["CLIRO", "El Coco"]);
  });
});

describe("scopePatchFor / buildAssignmentPatch", () => {
  it("deriva país y compañía del almacén activo", () => {
    expect(buildAssignmentPatch(["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"], "VNZ-OLO-SANDIEGO", CATALOG)).toEqual({
      bodegaIds: ["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"],
      tenantId: "VNZ",
      company: "OLO",
      bodegaId: "VNZ-OLO-SANDIEGO",
      bodegaNombre: "San Diego",
    });
  });

  it("sin activo usa el primero asignado; sin asignaciones queda sin scope", () => {
    expect(buildAssignmentPatch(["CR-OLO-ELCOCO"], "", CATALOG).bodegaId).toBe("CR-OLO-ELCOCO");
    expect(buildAssignmentPatch([], "", CATALOG)).toEqual({
      bodegaIds: [],
      tenantId: null,
      company: null,
      bodegaId: null,
      bodegaNombre: null,
    });
  });

  it("rechaza un activo que no está asignado", () => {
    expect(() => buildAssignmentPatch(["CR-OLO-CLIRO"], "VNZ-OLO-SANDIEGO", CATALOG)).toThrow("asignados");
  });

  it("etiqueta legible", () => {
    expect(scopeLabel(CATALOG.bodegas[2], CATALOG)).toBe("Venezuela · OLO · San Diego");
    expect(scopeLabel(null, CATALOG)).toBe("Sin almacén");
    expect(scopePatchFor(null).tenantId).toBeNull();
  });
});
