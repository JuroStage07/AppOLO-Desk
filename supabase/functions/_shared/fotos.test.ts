import { describe, expect, it } from "vitest";

import { firmarFotos, fotosDeDespacho, rutaFotoSegura, seleccionarFotos, type StorageBucket } from "./fotos";

const DESP = "d13dbb71-92dc-43e9-900e-a1ec4fa95219";
const A = { tenant: "CR", company: "OLO", bodega: "CR-OLO-CLIRO", dueñoId: DESP };
const ruta = (n: number) => `CR/OLO/CR-OLO-CLIRO/${DESP}/lot_${n}.jpg`;
const fila = (n: number, extra = {}) => ({ storage_path: ruta(n), taken_at: `2026-11-05T02:${String(n).padStart(2, "0")}:00Z`, tarima: "S", ...extra });

/** Bucket falso: firma devolviendo https; se puede forzar a fallar. */
function bucketFalso({ falla = false } = {}) {
  const firmadas: string[] = [];
  const b: StorageBucket = {
    async createSignedUrl(path, _exp, opts) {
      firmadas.push(path);
      if (falla) return { data: null, error: new Error("storage caído") };
      return { data: { signedUrl: `https://sb.example/sign/${path}?w=${opts?.transform?.width ?? "orig"}&token=x` }, error: null };
    },
    async createSignedUrls(paths) {
      paths.forEach((p) => firmadas.push(p));
      if (falla) return { data: null, error: new Error("storage caído") };
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://sb.example/sign/${p}?token=x`, error: null })), error: null };
    },
  };
  return { b, firmadas };
}

describe("fotos firmadas", () => {
  it("nunca firma cédulas ni firmas, ni fotos de otro despacho o bodega", () => {
    expect(rutaFotoSegura(ruta(1), A)).toBe(true);
    expect(rutaFotoSegura("CR/OLO/CR-OLO-CLIRO/choferes/abc/123.jpg", A)).toBe(false);
    expect(rutaFotoSegura("CR/OLO/CR-OLO-CLIRO/boletas/abc/firma_1.png", A)).toBe(false);
    expect(rutaFotoSegura(`CR/OLO/CR-OLO-CLIRO/${DESP}/boletas/firma.png`, A)).toBe(false);
    expect(rutaFotoSegura(`CR/OLO/CR-OLO-ELCOCO/${DESP}/lot_1.jpg`, A)).toBe(false);
    expect(rutaFotoSegura(`CR/OLO/CR-OLO-CLIRO/otro-despacho/lot_1.jpg`, A)).toBe(false);
    expect(rutaFotoSegura(`CR/OLO/CR-OLO-CLIRO/${DESP}/../choferes/x.jpg`, A)).toBe(false);
  });

  it("selecciona las más recientes primero y descarta cédula/firma aunque vengan en la tabla", () => {
    const filas = [fila(1), fila(3), { storage_path: "CR/OLO/CR-OLO-CLIRO/choferes/c1/1.jpg", taken_at: "2026-11-05T09:00:00Z" }, fila(2)];
    expect(seleccionarFotos(filas, A).map((f) => f.storage_path)).toEqual([ruta(3), ruta(2), ruta(1)]);
    const muchas = Array.from({ length: 80 }, (_, i) => fila(i % 60, { taken_at: `2026-11-05T00:00:${String(i % 60).padStart(2, "0")}Z` }));
    expect(seleccionarFotos(muchas, A, 60)).toHaveLength(60);
    expect(seleccionarFotos(muchas, A, 12)).toHaveLength(12);
  });

  it("firma a 1280 px con URLs https y mantiene taken_at y tarima", async () => {
    const { b } = bucketFalso();
    const r = await firmarFotos(b, [fila(5, { tarima: "D" }), fila(4, { tarima: "x" })]);
    expect(r).toHaveLength(2);
    expect(r.every((f) => f.url.startsWith("https://") && f.url.includes("w=1280"))).toBe(true);
    expect(r[0]).toMatchObject({ taken_at: "2026-11-05T02:05:00Z", tarima: "D" });
    expect(r[1].tarima).toBe(null);
  });

  it("sin transformación firma el original en lote", async () => {
    const { b } = bucketFalso();
    const r = await firmarFotos(b, [fila(1)], { ancho: null });
    expect(r[0].url).toMatch(/^https:\/\/.*lot_1\.jpg\?token=x$/);
  });

  it("si la firma falla devuelve [] (no lanza)", async () => {
    expect(await firmarFotos(bucketFalso({ falla: true }).b, [fila(1), fila(2)])).toEqual([]);
    expect(await firmarFotos(bucketFalso({ falla: true }).b, [fila(1)], { ancho: null })).toEqual([]);
  });

  describe("fotosDeDespacho", () => {
    const fuente = (bucket: StorageBucket, bodegaReal = "CR-OLO-CLIRO", filas = [fila(1), fila(2)]) => ({
      despacho: async (_id: string, bodegaId: string) =>
        bodegaId === bodegaReal ? { tenant_id: "CR", company: "OLO", bodega_id: bodegaReal } : null,
      fotos: async () => filas,
      bucket,
    });

    it("despacho de la bodega → 200 con fotos firmadas", async () => {
      const r = await fotosDeDespacho(fuente(bucketFalso().b), DESP, "CR-OLO-CLIRO");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ despacho_id: DESP });
      expect((r.body as { fotos: unknown[] }).fotos).toHaveLength(2);
    });

    it("despacho de otra bodega → 404 sin firmar nada", async () => {
      const { b, firmadas } = bucketFalso();
      const r = await fotosDeDespacho(fuente(b, "CR-OLO-ELCOCO"), DESP, "CR-OLO-CLIRO");
      expect(r.status).toBe(404);
      expect(firmadas).toEqual([]);
    });

    it("ruta de cédula o firma en la tabla → descartada, nunca firmada", async () => {
      const { b, firmadas } = bucketFalso();
      const filas = [fila(1), { storage_path: "CR/OLO/CR-OLO-CLIRO/choferes/c1/ced.jpg" }, { storage_path: "CR/OLO/CR-OLO-CLIRO/boletas/b1/firma_1.png" }];
      const r = await fotosDeDespacho(fuente(b, "CR-OLO-CLIRO", filas), DESP, "CR-OLO-CLIRO");
      expect(firmadas).toEqual([ruta(1)]);
      expect(JSON.stringify(r.body)).not.toMatch(/choferes|boletas|cedula/);
    });

    it("falla la firma → 200 con fotos []", async () => {
      const r = await fotosDeDespacho(fuente(bucketFalso({ falla: true }).b), DESP, "CR-OLO-CLIRO");
      expect(r).toEqual({ status: 200, body: { despacho_id: DESP, fotos: [] } });
    });
  });
});
