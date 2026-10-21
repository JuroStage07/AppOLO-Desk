import { describe, expect, it } from "vitest";

import { generateTempPassword, normalizeCreateUserInput, usernameFromEmail } from "./userCreateCore";

const CATALOG = [
  { id: "CR-OLO-CLIRO", tenant_id: "CR", company_id: "OLO", name: "CLIRO", active: true },
  { id: "VNZ-OLO-SANDIEGO", tenant_id: "VNZ", company_id: "OLO", name: "San Diego", active: true },
  { id: "CR-OLO-VIEJO", tenant_id: "CR", company_id: "OLO", name: "Viejo", active: false },
];
const BASE = {
  email: " Ana.Pérez@ologistics.com ",
  displayName: "  Ana   Pérez ",
  role: "operativo",
  bodegaIds: ["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"],
  activeBodegaId: "VNZ-OLO-SANDIEGO",
};

describe("normalizeCreateUserInput", () => {
  it("normaliza y deriva país/compañía del almacén activo", () => {
    expect(normalizeCreateUserInput({ ...BASE, permisos: { despacho: true } }, CATALOG)).toEqual({
      email: "ana.pérez@ologistics.com",
      displayName: "Ana Pérez",
      username: "anaperez",
      numeroFicha: null,
      role: "operativo",
      epaAdmin: false,
      permisos: { despacho: true },
      bodegaIds: ["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"],
      tenantId: "VNZ",
      company: "OLO",
      bodegaId: "VNZ-OLO-SANDIEGO",
      bodegaNombre: "San Diego",
      sendWelcomeEmail: false,
    });
  });

  it("sin activo usa el primer almacén", () => {
    expect(normalizeCreateUserInput({ ...BASE, activeBodegaId: "" }, CATALOG).bodegaId).toBe("CR-OLO-CLIRO");
  });

  it("valida correo, nombre, rol y usuario", () => {
    expect(() => normalizeCreateUserInput({ ...BASE, email: "malo" }, CATALOG)).toThrow("Correo");
    expect(() => normalizeCreateUserInput({ ...BASE, displayName: "A" }, CATALOG)).toThrow("nombre");
    expect(() => normalizeCreateUserInput({ ...BASE, role: "superadmin" }, CATALOG)).toThrow("Rol");
    expect(() => normalizeCreateUserInput({ ...BASE, username: "Con Espacio" }, CATALOG)).toThrow("Usuario");
  });

  it("exige almacenes existentes y activos, y el activo entre los asignados", () => {
    expect(() => normalizeCreateUserInput({ ...BASE, bodegaIds: [] }, CATALOG)).toThrow("al menos un almacén");
    expect(() => normalizeCreateUserInput({ ...BASE, bodegaIds: ["PA-OLO-X1"] }, CATALOG)).toThrow("no existe");
    expect(() => normalizeCreateUserInput({ ...BASE, bodegaIds: ["CR-OLO-VIEJO"], activeBodegaId: "" }, CATALOG)).toThrow("desactivado");
    expect(() => normalizeCreateUserInput({ ...BASE, bodegaIds: ["CR-OLO-CLIRO"] }, CATALOG)).toThrow("activo");
  });

  it("rechaza permisos con valores no booleanos", () => {
    expect(() => normalizeCreateUserInput({ ...BASE, permisos: { despacho: "si" } }, CATALOG)).toThrow("verdadero o falso");
  });
});

describe("helpers", () => {
  it("usernameFromEmail", () => {
    expect(usernameFromEmail("J.Bonilla@ologistics.com")).toBe("jbonilla");
  });
  it("generateTempPassword: 4 bloques sin caracteres ambiguos", () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{4}(-[a-km-np-zA-HJ-NP-Z2-9]{4}){3}$/);
    expect(generateTempPassword()).not.toBe(p);
  });
});
