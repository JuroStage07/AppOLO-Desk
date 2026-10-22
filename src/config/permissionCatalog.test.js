import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ACTION_INDEX, CATALOG_KEYS, PERMISSION_CATALOG, canDo } from "./permissionCatalog";
import { PERMISSION_KEYS } from "./permissions";

describe("permissionCatalog", () => {
  it("no repite claves", () => {
    const all = PERMISSION_CATALOG.flatMap((m) => [m.fullKey, ...m.actions.map((a) => a.key)]).filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it("todas las claves están en PERMISSION_KEYS (normalizePermissionMap no las pierde)", () => {
    for (const k of CATALOG_KEYS) expect(PERMISSION_KEYS).toContain(k);
  });

  it("todas las claves están en validPermisosMap de firestore.rules", () => {
    const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
    const start = rules.indexOf("function validPermisosMap");
    const block = rules.slice(start, rules.indexOf("])", start));
    for (const k of CATALOG_KEYS) expect(block, `falta '${k}' en validPermisosMap`).toContain(`'${k}'`);
  });

  it("compatibilidad: el permiso del módulo sigue dando sus botones", () => {
    expect(canDo({ role: "operativo", permisos: { despacho: true } }, "despachoReporte")).toBe(true);
    expect(canDo({ role: "operativo", permisos: { saludOcupacional: true } }, "segMarcas")).toBe(true);
    expect(canDo({ role: "operativo", permisos: { mantenimiento: true } }, "equiposEditar")).toBe(true);
    expect(canDo({ role: "operativo", permisos: { despachosEPA: true } }, "recepcionDescarga")).toBe(true);
  });

  it("sin el módulo, solo la acción explícita", () => {
    const ctx = { role: "operativo", permisos: { despachoReporte: true } };
    expect(canDo(ctx, "despachoReporte")).toBe(true);
    expect(canDo(ctx, "despachoExportar")).toBe(false);
  });

  it("lo que hoy es solo admin/dev se conserva", () => {
    expect(canDo({ role: "operativo", permisos: { recepcion: true } }, "recepcionDescargaDesk")).toBe(false);
    expect(canDo({ role: "administrativo", permisos: {} }, "recepcionDescargaDesk")).toBe(true);
    expect(canDo({ role: "administrativo", permisos: {} }, "recepcionEliminar")).toBe(false);
    expect(canDo({ role: "dev", permisos: {} }, "recepcionEliminar")).toBe(true);
  });

  it("cada acción declara dónde se aplica", () => {
    for (const { action } of Object.values(ACTION_INDEX)) expect(action.apps?.length).toBeGreaterThan(0);
  });
});
