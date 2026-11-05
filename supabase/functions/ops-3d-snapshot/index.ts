// ops-3d-snapshot — foto del día para el Proceso 3D de SRO (contrato v1).
// Contrato: SRO/docs/integracion-appolo-proceso3d.md
//
// Etapa A: solo despachos (Supabase despacho_dev_*). `receptions: []` y
// `equipment: null` hasta migrar accion_descarga / accion_recepcion / equipos
// (etapa B). Sin bloque `realtime`: el proyecto firma con llaves ES256 y no se
// puede emitir el token del canal; SRO consulta cada 2 minutos.
//
// Seguridad:
//   - Se despliega con verify_jwt = false: el token que llega es de SRO, no de
//     AppOLO. Lo valida el módulo común ../_shared/sroAuth.ts: sesión de SRO,
//     org del almacén y el permiso `proceso3d.view` de la Matriz de Permisos de
//     SRO (RPC has_org_permission), todo con el JWT del usuario.
//   - Solo lectura. Lee con service role pero devuelve únicamente lo del contrato
//     (sin cédulas, firmas ni notas).
//
// Fotos: el snapshot trae solo `fotos_count`. Las fotos se piden aparte con
// `?sro_warehouse_id=…&fotos_despacho=<id>`: URLs firmadas (1 h) de las fotos de
// carga de ese despacho, verificando que sea de la bodega del almacén
// (../_shared/fotos.ts).
//
// Chofer y boleta: `?sro_warehouse_id=…&chofer_despacho=<id>` devuelve el chofer
// registrado (con foto de cédula y celular, nunca el pin) y la boleta de salida
// (checklist y firma) de ese despacho. Decisión del usuario: lo ve quien tiene
// proceso3d.view (../_shared/choferBoleta.ts).
//
// Secrets: SRO_URL, SRO_ANON_KEY (públicos de SRO); opcional OPS3D_ALLOWED_ORIGINS
// (orígenes separados por coma; vacío = cualquiera, la auth va por Bearer) y
// OPS3D_FOTOS_ANCHO (ancho de las fotos firmadas; 0 = original; por defecto 1280).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CONTRACT_VERSION,
  DIAS_ABIERTOS,
  ESTADO_ESPERA_CHOFER,
  catalogoPuertas,
  dayRangeUtc,
  historialPorDespacho,
  isValidTz,
  mapDispatch,
  seleccionarDespachos,
  todayIn,
} from "./lib.ts";
import { autorizarSro } from "../_shared/sroAuth.ts";
import { FOTOS_ANCHO, fotosDeDespacho, type StorageBucket } from "../_shared/fotos.ts";
import { choferYBoletaDeDespacho, type FilaBoleta, type FilaChofer } from "../_shared/choferBoleta.ts";

const SRO = { sroUrl: Deno.env.get("SRO_URL") ?? "", anonKey: Deno.env.get("SRO_ANON_KEY") ?? "" };
const PERMISO = "proceso3d.view";
const BUCKET_FOTOS = "despacho-dev-fotos";
const anchoEnv = Number(Deno.env.get("OPS3D_FOTOS_ANCHO") ?? FOTOS_ANCHO);
const FOTOS_ANCHO_EFECTIVO = Number.isFinite(anchoEnv) && anchoEnv > 0 ? anchoEnv : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = (Deno.env.get("OPS3D_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DESPACHO_COLS =
  "id,bodega_id,bodega_nombre,estado,puerta,placa,placa_contenedor,chofer_id,transportista,tienda,referencia,tipo,tarimas_s,tarimas_d,fotos_count,fecha,created_at,updated_at,finalized_at,deleted_at";

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = !ALLOWED.length ? "*" : origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": cache },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "GET") return json({ error: "Método no permitido." }, 405, origin);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Falta Authorization: Bearer <token de SRO>." }, 401, origin);

    const url = new URL(req.url);
    const v = url.searchParams.get("v");
    if (v && v !== String(CONTRACT_VERSION)) {
      return json({ error: `Versión de contrato no soportada: ${v}.`, version: CONTRACT_VERSION }, 400, origin);
    }
    const sroWarehouseId = url.searchParams.get("sro_warehouse_id") ?? "";
    const tz = url.searchParams.get("tz") || "America/Costa_Rica";
    if (!isValidTz(tz)) return json({ error: "tz inválida." }, 400, origin);
    const date = url.searchParams.get("date") || todayIn(tz);
    let range: { start: Date; end: Date };
    try {
      range = dayRangeUtc(date, tz);
    } catch {
      return json({ error: "date inválida (YYYY-MM-DD)." }, 400, origin);
    }
    if (!/^[0-9a-f-]{36}$/i.test(sroWarehouseId)) return json({ error: "sro_warehouse_id inválido." }, 400, origin);

    const auth = await autorizarSro(SRO, token, sroWarehouseId, PERMISO);
    if ("status" in auth) return json({ error: auth.error }, auth.status, origin);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: mapa, error: mapaErr } = await db
      .from("ops3d_bodega_sro")
      .select("bodega_id,nombre")
      .eq("sro_warehouse_id", sroWarehouseId)
      .eq("activo", true)
      .maybeSingle();
    if (mapaErr) throw mapaErr;
    if (!mapa) return json({ error: "El almacén de SRO no tiene bodega de AppOLO asociada." }, 404, origin);
    const bodegaId = mapa.bodega_id as string;

    // ── Fotos a pedido de un despacho ──────────────────────────────────────
    const fotosDespacho = url.searchParams.get("fotos_despacho");
    if (fotosDespacho !== null) {
      if (!UUID.test(fotosDespacho)) return json({ error: "fotos_despacho inválido." }, 400, origin);
      const r = await fotosDeDespacho(
        {
          despacho: async (id, bodega) => {
            const { data, error } = await db
              .from("despacho_dev_despachos")
              .select("tenant_id,company,bodega_id,estado")
              .eq("id", id)
              .eq("bodega_id", bodega)
              .is("deleted_at", null)
              .maybeSingle();
            if (error) throw error;
            return data && data.estado !== "eliminado" ? data : null;
          },
          fotos: async (id, limite) => {
            const { data, error } = await db
              .from("despacho_dev_fotos")
              .select("storage_path,taken_at,created_at,tarima")
              .eq("despacho_id", id)
              .order("taken_at", { ascending: false, nullsFirst: false })
              .limit(limite);
            if (error) throw error;
            return data ?? [];
          },
          bucket: db.storage.from(BUCKET_FOTOS) as unknown as StorageBucket,
        },
        fotosDespacho,
        bodegaId,
        { ancho: FOTOS_ANCHO_EFECTIVO }
      );
      return json(r.body, r.status, origin, r.status === 200 ? "private, max-age=300" : "no-store");
    }

    // ── Chofer y boleta a pedido de un despacho ────────────────────────────
    const choferDespacho = url.searchParams.get("chofer_despacho");
    if (choferDespacho !== null) {
      if (!UUID.test(choferDespacho)) return json({ error: "chofer_despacho inválido." }, 400, origin);
      const r = await choferYBoletaDeDespacho(
        {
          despacho: async (id, bodega) => {
            const { data, error } = await db
              .from("despacho_dev_despachos")
              .select("tenant_id,company,bodega_id,chofer_id,estado")
              .eq("id", id)
              .eq("bodega_id", bodega)
              .is("deleted_at", null)
              .maybeSingle();
            if (error) throw error;
            return data && data.estado !== "eliminado" ? data : null;
          },
          chofer: async (id) => {
            // Columnas explícitas: nunca el pin.
            const { data, error } = await db
              .from("despacho_dev_choferes")
              .select("id,bodega_id,nombre,cedula,compania,placa_camion,tipo_vehiculo,celular,cedula_foto_path")
              .eq("id", id)
              .maybeSingle();
            if (error) throw error;
            return (data as FilaChofer | null) ?? null;
          },
          boletas: async (id) => {
            const { data, error } = await db
              .from("despacho_dev_boletas")
              .select("id,estado,checklist,firma_path,validated_by,validated_at,created_at,placa_contenedor,deleted_at")
              .eq("despacho_id", id)
              .is("deleted_at", null);
            if (error) throw error;
            return (data as FilaBoleta[] | null) ?? [];
          },
          nombreUsuario: async (uid) => {
            const { data } = await db.from("app_perfiles").select("display_name").eq("id", uid).maybeSingle();
            return (data?.display_name as string | undefined) || null;
          },
          bucket: db.storage.from(BUCKET_FOTOS) as unknown as StorageBucket,
        },
        choferDespacho,
        bodegaId,
        { anchoCedula: FOTOS_ANCHO_EFECTIVO }
      );
      return json(r.body, r.status, origin, r.status === 200 ? "private, max-age=300" : "no-store");
    }

    // Despachos del día + abiertos de los últimos DIAS_ABIERTOS días + todos los
    // "chofer pendiente" (patio de espera de salida en SRO, cualquier día).
    const desde = new Date(range.start.getTime() - DIAS_ABIERTOS * 86400000);
    const [desp, espera, estados, puertas] = await Promise.all([
      db
        .from("despacho_dev_despachos")
        .select(DESPACHO_COLS)
        .eq("bodega_id", bodegaId)
        .is("deleted_at", null)
        .gte("fecha", desde.toISOString())
        .lt("fecha", range.end.toISOString())
        .order("fecha", { ascending: true })
        .limit(2000),
      db
        .from("despacho_dev_despachos")
        .select(DESPACHO_COLS)
        .eq("bodega_id", bodegaId)
        .is("deleted_at", null)
        .eq("estado", ESTADO_ESPERA_CHOFER)
        .lt("fecha", range.end.toISOString())
        .order("fecha", { ascending: true })
        .limit(5000),
      db.from("despacho_dev_estados").select("codigo,nombre"),
      db
        .from("despacho_dev_despachos")
        .select("puerta")
        .eq("bodega_id", bodegaId)
        .is("deleted_at", null)
        .gte("fecha", new Date(range.end.getTime() - 90 * 86400000).toISOString())
        .not("puerta", "is", null)
        .limit(5000),
    ]);
    if (desp.error) throw desp.error;
    if (espera.error) throw espera.error;
    if (estados.error) throw estados.error;
    if (puertas.error) throw puertas.error;

    const seleccion = seleccionarDespachos([...(desp.data ?? []), ...(espera.data ?? [])], range.start, range.end);
    const ids = seleccion.map((d) => String(d.id));
    const choferIds = [...new Set(seleccion.map((d) => d.chofer_id).filter(Boolean).map(String))];

    // `.in(...)` en lotes: con cientos de ids la URL de PostgREST se pasa de largo.
    const enLotes = async <T,>(lista: string[], q: (lote: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const out: T[] = [];
      for (let i = 0; i < lista.length; i += 100) {
        const { data, error } = await q(lista.slice(i, i + 100));
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    };
    const [layout, actividad, choferes] = await Promise.all([
      enLotes(ids, (l) => db.from("despacho_dev_layout").select("despacho_id,slots").in("despacho_id", l)),
      enLotes(ids, (l) =>
        db
          .from("despacho_dev_actividad")
          .select("entidad_id,tipo,created_at")
          .eq("entidad", "despacho")
          .like("tipo", "despacho_%")
          .in("entidad_id", l)
      ),
      // Solo el nombre: nunca cédula ni documentos.
      enLotes(choferIds, (l) => db.from("despacho_dev_choferes").select("id,nombre").in("id", l)),
    ]);

    const codigos = new Set((estados.data ?? []).map((e) => String(e.codigo)));
    const ctx = {
      estadoNombre: new Map((estados.data ?? []).map((e) => [String(e.codigo), String(e.nombre)])),
      choferNombre: new Map(choferes.map((c: any) => [String(c.id), String(c.nombre ?? "")])),
      layout: new Map(layout.map((l: any) => [String(l.despacho_id), l.slots])),
      historial: historialPorDespacho(actividad as any[], codigos),
    };

    return json(
      {
        version: CONTRACT_VERSION,
        generated_at: new Date().toISOString(),
        bodega: { id: bodegaId, nombre: mapa.nombre ?? bodegaId },
        doors: catalogoPuertas((puertas.data ?? []).map((p) => p.puerta)),
        dispatches: seleccion.map((d) => mapDispatch(d, ctx)),
        receptions: [],
        equipment: null,
      },
      200,
      origin
    );
  } catch (e) {
    console.error("ops-3d-snapshot:", e);
    return json({ error: "Error interno." }, 500, origin);
  }
});
