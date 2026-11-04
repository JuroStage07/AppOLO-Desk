import { describe, expect, it } from "vitest";

import { autorizarSro } from "./sroAuth";

const W = "9d0ed657-f928-4d6d-a4c4-524483c14038";
const ORG = "946ddabf-3874-4c57-85c2-ea7d4b5937f8";

/** fetch falso: responde según la URL; registra las llamadas. */
function fakeFetch({ user = { id: "u1" }, warehouses = [{ org_id: ORG }], permiso = true, userOk = true } = {}) {
  const calls: Array<{ url: string; body?: string }> = [];
  const res = (ok: boolean, body: unknown) => ({ ok, status: ok ? 200 : 401, json: async () => body }) as Response;
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    if (url.includes("/auth/v1/user")) return res(userOk, user);
    if (url.includes("/rest/v1/warehouses")) return res(true, warehouses);
    if (url.includes("/rpc/has_org_permission")) return res(true, permiso);
    throw new Error("url inesperada " + url);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const cfg = (f: typeof fetch) => ({ sroUrl: "https://sro.example.co/", anonKey: "anon", fetchImpl: f });

describe("autorizarSro", () => {
  it("con permiso: devuelve usuario y org del almacén, y consulta el permiso pedido", async () => {
    const { f, calls } = fakeFetch();
    const r = await autorizarSro(cfg(f), "tok", W, "proceso3d.view");
    expect(r).toEqual({ userId: "u1", orgId: ORG });
    const rpc = calls.find((c) => c.url.includes("has_org_permission"));
    expect(JSON.parse(rpc!.body!)).toEqual({ p_org_id: ORG, p_permission: "proceso3d.view" });
  });

  it("sin el permiso: 403 con el nombre del permiso", async () => {
    const { f } = fakeFetch({ permiso: false });
    expect(await autorizarSro(cfg(f), "tok", W, "manpower.view")).toEqual({
      status: 403,
      error: "Se requiere el permiso manpower.view en SRO.",
    });
  });

  it("sesión inválida: 401; almacén no visible: 403; parámetros malos: 400", async () => {
    expect((await autorizarSro(cfg(fakeFetch({ userOk: false }).f), "tok", W, "x")).status).toBe(401);
    expect((await autorizarSro(cfg(fakeFetch({ warehouses: [] }).f), "tok", W, "x")).status).toBe(403);
    expect((await autorizarSro(cfg(fakeFetch().f), "tok", "no-uuid", "x")).status).toBe(400);
    expect((await autorizarSro(cfg(fakeFetch().f), "", W, "x")).status).toBe(401);
  });
});
