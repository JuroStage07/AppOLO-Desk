import { describe, expect, it } from "vitest";

import { buildCatalogOperation, describeSupabaseError } from "./orgCatalogCore";

describe("buildCatalogOperation · país y compañía", () => {
  it("crea un país normalizando el código", () => {
    expect(buildCatalogOperation({ entity: "tenant", action: "create", data: { id: " pa ", name: " Panamá " } })).toEqual({
      table: "org_tenants",
      action: "create",
      id: "PA",
      row: { id: "PA", name: "Panamá", active: true },
    });
  });

  it("rechaza códigos inválidos y nombres vacíos", () => {
    expect(() => buildCatalogOperation({ entity: "tenant", action: "create", data: { id: "C", name: "X país" } })).toThrow(
      "Código inválido"
    );
    expect(() => buildCatalogOperation({ entity: "company", action: "create", data: { id: "OLO", name: " " } })).toThrow(
      "nombre"
    );
  });

  it("actualiza solo lo enviado y exige algún cambio", () => {
    expect(buildCatalogOperation({ entity: "company", action: "update", data: { id: "olo", active: false } })).toEqual({
      table: "org_companies",
      action: "update",
      id: "OLO",
      row: { active: false },
    });
    expect(() => buildCatalogOperation({ entity: "company", action: "update", data: { id: "OLO" } })).toThrow(
      "No hay cambios"
    );
  });

  it("valida entidad, acción y tipo de active", () => {
    expect(() => buildCatalogOperation({ entity: "x", action: "create" })).toThrow("Entidad");
    expect(() => buildCatalogOperation({ entity: "tenant", action: "delete" })).toThrow("Acción");
    expect(() => buildCatalogOperation({ entity: "tenant", action: "update", data: { id: "CR", active: "no" } })).toThrow(
      "active"
    );
  });
});

describe("buildCatalogOperation · almacén", () => {
  it("arma el ID <tenant>-<company>-<CODE>", () => {
    const op = buildCatalogOperation({
      entity: "bodega",
      action: "create",
      data: { tenantId: "cr", companyId: "olo", code: "san josé", name: "San José", sroWarehouseId: "" },
    });
    expect(op.id).toBe("CR-OLO-SANJOSE");
    expect(op.row).toEqual({
      id: "CR-OLO-SANJOSE",
      tenant_id: "CR",
      company_id: "OLO",
      code: "SANJOSE",
      name: "San José",
      sro_warehouse_id: null,
      active: true,
    });
  });

  it("valida el UUID del SRO", () => {
    expect(() =>
      buildCatalogOperation({
        entity: "bodega",
        action: "create",
        data: { tenantId: "CR", companyId: "OLO", code: "X1", name: "Equis", sroWarehouseId: "no-uuid" },
      })
    ).toThrow("UUID");
  });

  it("no permite cambiar país, compañía ni código al editar", () => {
    expect(() =>
      buildCatalogOperation({ entity: "bodega", action: "update", data: { id: "CR-OLO-CLIRO", tenantId: "VNZ" } })
    ).toThrow("no se pueden cambiar");
    expect(
      buildCatalogOperation({ entity: "bodega", action: "update", data: { id: "cr-olo-cliro", name: "CLIRO Norte", active: false } })
    ).toEqual({ table: "org_bodegas", action: "update", id: "CR-OLO-CLIRO", row: { name: "CLIRO Norte", active: false } });
  });
});

describe("describeSupabaseError", () => {
  it("traduce los errores de restricción", () => {
    expect(describeSupabaseError(409, {})).toMatch("Ya existe");
    expect(describeSupabaseError(400, { code: "23503" })).toMatch("no existen");
    expect(describeSupabaseError(500, { message: "boom" })).toBe("boom");
  });
});
