import { getOtAccess } from "./otAccess";

const none = { ver: false, crear: false, gestionar: false, finalizar: false, eliminar: false, programado: false };

describe("getOtAccess", () => {
  it("admin y dev tienen todo", () => {
    expect(getOtAccess({ role: "administrativo", permisos: {} })).toMatchObject({ full: true, eliminar: true, ver: true });
    expect(getOtAccess({ role: "dev" }).programado).toBe(true);
  });

  it("el permiso mantenimiento (acceso total) conserva todo", () => {
    expect(getOtAccess({ role: "operativo", permisos: { mantenimiento: true } })).toEqual({
      full: true, ver: true, crear: true, gestionar: true, finalizar: true, eliminar: true, programado: true,
    });
  });

  it("por acción: solo lo asignado, y cualquier acción implica ver", () => {
    expect(getOtAccess({ role: "operativo", permisos: { otsGestionar: true } })).toEqual({
      ...none, full: false, ver: true, gestionar: true,
    });
    expect(getOtAccess({ role: "operativo", permisos: { otsVer: true } })).toEqual({ ...none, full: false, ver: true });
  });

  it("sin permisos no puede nada", () => {
    expect(getOtAccess({ role: "operativo", permisos: { serviciosGenerales: true } })).toEqual({ ...none, full: false });
  });

  it("lee los permisos del perfil si no vienen sueltos", () => {
    expect(getOtAccess({ role: "operativo", profile: { permisos: { otsCrear: true } } }).crear).toBe(true);
  });
});
