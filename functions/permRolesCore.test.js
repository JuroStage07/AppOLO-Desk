import { expect, test } from "vitest";

import { computeEffective, deriveOverrides, hashPermisos, planProfileSync } from "./permRolesCore";

const assert = {
  deepEqual: (a, b) => expect(a).toEqual(b),
  equal: (a, b) => expect(a).toBe(b),
};

const ROLE = { mantenimiento: false, otsVer: true, otsGestionar: true, despacho: true };

test("efectivo = rol pisado por excepciones", () => {
  assert.deepEqual(computeEffective(ROLE, { otsGestionar: false, otsFinalizar: true }), {
    mantenimiento: false,
    otsVer: true,
    otsGestionar: false,
    despacho: true,
    otsFinalizar: true,
  });
});

test("excepciones mínimas", () => {
  assert.deepEqual(deriveOverrides({ otsVer: true, despacho: false, otsFinalizar: true }, ROLE), {
    otsGestionar: false,
    despacho: false,
    otsFinalizar: true,
  });
});

test("hash ignora falsos y orden", () => {
  assert.equal(hashPermisos({ b: true, a: true, c: false }), "a,b");
});

test("perfil sin rol no se toca", () => {
  assert.equal(planProfileSync({ before: {}, after: { permisos: { x: true } }, rolePermisos: ROLE }), null);
});

test("asignar rol con excepciones calcula el efectivo", () => {
  const plan = planProfileSync({
    before: { permisos: { saludOcupacional: true } },
    after: { permRoleId: "r1", permisos: { saludOcupacional: true }, permisosOverrides: { saludOcupacional: true } },
    rolePermisos: ROLE,
  });
  assert.equal(plan.hash, "despacho,otsGestionar,otsVer,saludOcupacional");
  assert.deepEqual(plan.permisosOverrides, { saludOcupacional: true });
});

test("escritura propia no vuelve a escribir (sin bucle)", () => {
  const eff = computeEffective(ROLE, { saludOcupacional: true });
  const after = {
    permRoleId: "r1",
    permisos: eff,
    permisosOverrides: { saludOcupacional: true },
    permisosSync: { hash: hashPermisos(eff), roleId: "r1" },
  };
  assert.equal(planProfileSync({ before: after, after, rolePermisos: ROLE }), null);
});

test("edición manual de permisos (app móvil) se convierte en excepción", () => {
  const eff = computeEffective(ROLE, {});
  const before = { permRoleId: "r1", permisos: eff, permisosOverrides: {}, permisosSync: { hash: hashPermisos(eff), roleId: "r1" } };
  const after = { ...before, permisos: { ...eff, otsGestionar: false } };
  const plan = planProfileSync({ before, after, rolePermisos: ROLE });
  assert.deepEqual(plan.permisosOverrides, { otsGestionar: false });
  assert.equal(plan.permisos.otsGestionar, false);
});

test("cambio del rol se propaga conservando excepciones", () => {
  const nuevoRol = { ...ROLE, otsFinalizar: true };
  const prev = computeEffective(ROLE, { despacho: false });
  const after = { permRoleId: "r1", permisos: prev, permisosOverrides: { despacho: false }, permisosSync: { hash: hashPermisos(prev), roleId: "r1" } };
  const plan = planProfileSync({ before: after, after, rolePermisos: nuevoRol });
  assert.equal(plan.permisos.otsFinalizar, true);
  assert.equal(plan.permisos.despacho, false);
});

test("excepción redundante se limpia", () => {
  const plan = planProfileSync({
    before: null,
    after: { permRoleId: "r1", permisos: {}, permisosOverrides: { otsVer: true } },
    rolePermisos: ROLE,
  });
  assert.deepEqual(plan.permisosOverrides, {});
});
