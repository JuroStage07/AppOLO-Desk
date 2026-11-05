import { describe, expect, it } from "vitest";

import {
  VALIDADA_POR_REGULARIZACION,
  checklistAItems,
  choferYBoletaDeDespacho,
  elegirBoleta,
  rutaCedulaSegura,
  rutaFirmaSegura,
  type FilaBoleta,
  type FilaChofer,
} from "./choferBoleta";
import type { StorageBucket } from "./fotos";

const DESP = "d13dbb71-92dc-43e9-900e-a1ec4fa95219";
const CHOF = "12e1c4fc-1b43-4575-afb2-d148c03af2b6";
const BOL = "0e6b4552-d790-45d0-8682-ef2f13612ff7";
const BASE = "CR/OLO/CR-OLO-CLIRO";
const A = { tenant: "CR", company: "OLO", bodega: "CR-OLO-CLIRO" };

function bucketFalso({ falla = false } = {}) {
  const firmadas: Array<{ path: string; width: number | string; resize?: string }> = [];
  const b: StorageBucket = {
    async createSignedUrl(path, _exp, opts) {
      firmadas.push({ path, width: opts?.transform?.width ?? "orig", ...(opts?.transform ? { resize: opts.transform.resize } : {}) });
      if (falla) return { data: null, error: new Error("storage caído") };
      return { data: { signedUrl: `https://sb.example/sign/${path}?token=x` }, error: null };
    },
    async createSignedUrls() {
      throw new Error("no se usa");
    },
  };
  return { b, firmadas };
}

const chofer = (extra: Partial<FilaChofer> = {}): FilaChofer => ({
  id: CHOF,
  bodega_id: "CR-OLO-CLIRO",
  nombre: "Chofer Ejemplo",
  cedula: "1-0845-0321",
  compania: "MURBE",
  placa_camion: "C175055",
  tipo_vehiculo: null,
  celular: "88887777",
  cedula_foto_path: `${BASE}/choferes/${CHOF}/1786992793979.jpg`,
  ...extra,
});

const boleta = (extra: Partial<FilaBoleta> = {}): FilaBoleta => ({
  id: BOL,
  estado: "despachado",
  checklist: { placaContenedor: "si", identidad: "si", placaCamion: "si" },
  firma_path: `${BASE}/boletas/${BOL}/firma_1793817482964.png`,
  validated_by: "u-yustin",
  validated_at: "2026-11-04T15:07:07Z",
  created_at: "2026-09-09T20:23:00Z",
  placa_contenedor: "23162",
  ...extra,
});

function fuente(
  bucket: StorageBucket,
  { bodegaReal = "CR-OLO-CLIRO", choferId = CHOF as string | null, c = chofer() as FilaChofer | null, boletas = [boleta()] as FilaBoleta[] } = {}
) {
  return {
    despacho: async (_id: string, bodegaId: string) =>
      bodegaId === bodegaReal ? { tenant_id: "CR", company: "OLO", bodega_id: bodegaReal, chofer_id: choferId } : null,
    chofer: async () => c,
    boletas: async () => boletas,
    nombreUsuario: async (uid: string) => (uid === "u-yustin" ? "Yustin Jesus Campos Rodriguez" : null),
    bucket,
  };
}

describe("rutas de cédula y firma", () => {
  it("cédula: solo la del chofer del despacho dentro de la bodega", () => {
    expect(rutaCedulaSegura(`${BASE}/choferes/${CHOF}/1.jpg`, { ...A, choferId: CHOF })).toBe(true);
    expect(rutaCedulaSegura(`${BASE}/choferes/otro-chofer/1.jpg`, { ...A, choferId: CHOF })).toBe(false);
    expect(rutaCedulaSegura(`CR/OLO/CR-OLO-ELCOCO/choferes/${CHOF}/1.jpg`, { ...A, choferId: CHOF })).toBe(false);
    expect(rutaCedulaSegura(`${BASE}/choferes/${CHOF}/../otro/1.jpg`, { ...A, choferId: CHOF })).toBe(false);
  });

  it("firma: patrón actual y viejo con el id de esa boleta", () => {
    expect(rutaFirmaSegura(`${BASE}/boletas/${BOL}/firma_1.png`, { ...A, boletaId: BOL })).toBe(true);
    expect(rutaFirmaSegura(`${BASE}/firmas/${BOL}-1786643810924.png`, { ...A, boletaId: BOL })).toBe(true);
    expect(rutaFirmaSegura(`${BASE}/boletas/otra-boleta/firma_1.png`, { ...A, boletaId: BOL })).toBe(false);
    expect(rutaFirmaSegura(`${BASE}/choferes/${CHOF}/1.jpg`, { ...A, boletaId: BOL })).toBe(false);
    expect(rutaFirmaSegura(`CR/OLO/CR-OLO-ELCOCO/boletas/${BOL}/firma_1.png`, { ...A, boletaId: BOL })).toBe(false);
  });
});

describe("checklist y boleta elegida", () => {
  it("convierte el checklist actual en el orden y texto de la app", () => {
    expect(checklistAItems({ placaContenedor: "no", identidad: "si", placaCamion: "si" })).toEqual([
      { item: "¿La identidad del chofer es correcta?", ok: true },
      { item: "¿La placa del camión es correcta?", ok: true },
      { item: "¿La placa del contenedor es correcta?", ok: false },
    ]);
  });

  it("regularización como un ítem con ok null; vacío → []", () => {
    expect(checklistAItems({ regularizacion: "Regularización masiva 04/11/2026: …" })).toEqual([
      { item: "Regularización: Regularización masiva 04/11/2026: …", ok: null },
    ]);
    expect(checklistAItems(null)).toEqual([]);
    expect(checklistAItems({ carga: "si", vehiculo: "x" })).toEqual([
      { item: "Carga", ok: true },
      { item: "Vehículo", ok: null },
    ]);
  });

  it("elige la última validada; si no hay, la última creada; nunca borradas", () => {
    const v1 = boleta({ id: "a", validated_at: "2026-11-01T00:00:00Z" });
    const v2 = boleta({ id: "b", validated_at: "2026-11-03T00:00:00Z" });
    const p = boleta({ id: "c", validated_at: null, created_at: "2026-11-04T00:00:00Z" });
    expect(elegirBoleta([v1, p, v2])?.id).toBe("b");
    expect(elegirBoleta([boleta({ id: "x", validated_at: null, created_at: "2026-11-01" }), p])?.id).toBe("c");
    expect(elegirBoleta([boleta({ id: "z", deleted_at: "2026-11-05" })])).toBe(null);
  });
});

describe("choferYBoletaDeDespacho", () => {
  it("despacho completo: chofer con cédula a 1280 px y boleta con firma sin transformar", async () => {
    const { b, firmadas } = bucketFalso();
    const r = await choferYBoletaDeDespacho(fuente(b), DESP, "CR-OLO-CLIRO");
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.chofer).toMatchObject({ nombre: "Chofer Ejemplo", cedula: "1-0845-0321", celular: "88887777" });
    expect(body.chofer.cedula_foto).toMatch(/^https:\/\//);
    expect(body.boleta).toMatchObject({ id: BOL, estado: "despachado", validada_por: "Yustin Jesus Campos Rodriguez", placa_contenedor: "23162" });
    expect(body.boleta.firma).toMatch(/^https:\/\//);
    expect(firmadas).toEqual([
      { path: `${BASE}/choferes/${CHOF}/1786992793979.jpg`, width: 1280, resize: "contain" },
      { path: `${BASE}/boletas/${BOL}/firma_1793817482964.png`, width: "orig" },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/"pin"/);
  });

  it("despacho sin chofer ni boleta → nulls (no es error)", async () => {
    const r = await choferYBoletaDeDespacho(fuente(bucketFalso().b, { choferId: null, c: null, boletas: [] }), DESP, "CR-OLO-CLIRO");
    expect(r).toEqual({ status: 200, body: { despacho_id: DESP, chofer: null, boleta: null } });
  });

  it("despacho de otra bodega → 404 sin firmar nada", async () => {
    const { b, firmadas } = bucketFalso();
    const r = await choferYBoletaDeDespacho(fuente(b, { bodegaReal: "CR-OLO-ELCOCO" }), DESP, "CR-OLO-CLIRO");
    expect(r.status).toBe(404);
    expect(firmadas).toEqual([]);
  });

  it("rutas fuera de la bodega o de otro chofer/boleta → esa imagen en null, sin firmarla", async () => {
    const { b, firmadas } = bucketFalso();
    const r = await choferYBoletaDeDespacho(
      fuente(b, {
        c: chofer({ cedula_foto_path: `CR/OLO/CR-OLO-ELCOCO/choferes/${CHOF}/1.jpg` }),
        boletas: [boleta({ firma_path: `${BASE}/boletas/otra-boleta/firma_1.png` })],
      }),
      DESP,
      "CR-OLO-CLIRO"
    );
    const body = r.body as any;
    expect(body.chofer.cedula_foto).toBe(null);
    expect(body.boleta.firma).toBe(null);
    expect(body.chofer.nombre).toBe("Chofer Ejemplo");
    expect(firmadas).toEqual([]);
  });

  it("acepta la firma con el patrón viejo firmas/{boleta_id}-…", async () => {
    const r = await choferYBoletaDeDespacho(
      fuente(bucketFalso().b, { boletas: [boleta({ firma_path: `${BASE}/firmas/${BOL}-1786643810924.png` })] }),
      DESP,
      "CR-OLO-CLIRO"
    );
    expect((r.body as any).boleta.firma).toMatch(/^https:\/\//);
  });

  it("falla la firma de URLs → 200 con imágenes en null y el resto de datos", async () => {
    const r = await choferYBoletaDeDespacho(fuente(bucketFalso({ falla: true }).b), DESP, "CR-OLO-CLIRO");
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.chofer.cedula_foto).toBe(null);
    expect(body.boleta.firma).toBe(null);
    expect(body.chofer.cedula).toBe("1-0845-0321");
    expect(body.boleta.checklist).toHaveLength(3);
  });

  it("boleta regularizada → validada_por 'Aplicaciones OLO (regularización)'", async () => {
    const r = await choferYBoletaDeDespacho(
      fuente(bucketFalso().b, {
        boletas: [boleta({ checklist: { regularizacion: "Regularización masiva 04/11/2026: …" }, firma_path: null, validated_by: "u-apps" })],
      }),
      DESP,
      "CR-OLO-CLIRO"
    );
    const body = r.body as any;
    expect(body.boleta.validada_por).toBe(VALIDADA_POR_REGULARIZACION);
    expect(body.boleta.checklist).toEqual([{ item: "Regularización: Regularización masiva 04/11/2026: …", ok: null }]);
    expect(body.boleta.firma).toBe(null);
  });

  it("chofer de otra bodega (dato inconsistente) → chofer null", async () => {
    const r = await choferYBoletaDeDespacho(fuente(bucketFalso().b, { c: chofer({ bodega_id: "CR-OLO-ELCOCO" }) }), DESP, "CR-OLO-CLIRO");
    expect((r.body as any).chofer).toBe(null);
  });
});
