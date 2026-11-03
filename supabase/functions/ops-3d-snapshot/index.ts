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
//     AppOLO. Se valida contra SRO (GET /auth/v1/user) y se exige rol "Full Access"
//     leyendo user_org_roles en SRO con el mismo token (RLS de SRO).
//   - Solo lectura. Lee con service role pero devuelve únicamente lo del contrato
//     (sin cédulas, fotos, firmas ni notas).
//
// Secrets: SRO_URL, SRO_ANON_KEY (públicos de SRO); opcional OPS3D_ALLOWED_ORIGINS
// (orígenes separados por coma; vacío = cualquiera, la auth va por Bearer).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CONTRACT_VERSION,
  DIAS_ABIERTOS,
  catalogoPuertas,
  dayRangeUtc,
  historialPorDespacho,
  isValidTz,
  mapDispatch,
  seleccionarDespachos,
  todayIn,
} from "./lib.ts";

const SRO_URL = (Deno.env.get("SRO_URL") ?? "").replace(/\/+$/, "");
const SRO_ANON_KEY = Deno.env.get("SRO_ANON_KEY") ?? "";
const ALLOWED = (Deno.env.get("OPS3D_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ROL_REQUERIDO = "full access";

const DESPACHO_COLS =
  "id,bodega_id,bodega_nombre,estado,puerta,placa,placa_contenedor,chofer_id,transportista,tienda,referencia,tipo,tarimas_s,tarimas_d,fecha,created_at,updated_at,finalized_at,deleted_at";

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

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Valida el token de SRO y exige rol Full Access. Devuelve el id de usuario o un error HTTP. */
async function autorizarSro(token: string): Promise<{ userId: string } | { status: number; error: string }> {
  if (!SRO_URL || !SRO_ANON_KEY) return { status: 500, error: "Función sin configurar (SRO_URL / SRO_ANON_KEY)." };
  const h = { apikey: SRO_ANON_KEY, Authorization: `Bearer ${token}` };

  const uRes = await fetch(`${SRO_URL}/auth/v1/user`, { headers: h });
  if (!uRes.ok) return { status: 401, error: "Sesión de SRO inválida o vencida." };
  const user = await uRes.json().catch(() => null);
  const userId = user?.id;
  if (!userId) return { status: 401, error: "Sesión de SRO inválida." };

  const rRes = await fetch(
    `${SRO_URL}/rest/v1/user_org_roles?select=roles(name)&user_id=eq.${encodeURIComponent(userId)}`,
    { headers: h }
  );
  if (!rRes.ok) return { status: 403, error: "No se pudo verificar el rol en SRO." };
  const roles = (await rRes.json().catch(() => [])) as Array<{ roles?: { name?: string } | null }>;
  const ok = roles.some((r) => String(r?.roles?.name ?? "").trim().toLowerCase().replace(/_/g, " ") === ROL_REQUERIDO);
  return ok ? { userId } : { status: 403, error: "Se requiere el rol Full Access en SRO." };
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

    const auth = await autorizarSro(token);
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

    // Despachos del día + abiertos de los últimos DIAS_ABIERTOS días.
    const desde = new Date(range.start.getTime() - DIAS_ABIERTOS * 86400000);
    const [desp, estados, puertas] = await Promise.all([
      db
        .from("despacho_dev_despachos")
        .select(DESPACHO_COLS)
        .eq("bodega_id", bodegaId)
        .is("deleted_at", null)
        .gte("fecha", desde.toISOString())
        .lt("fecha", range.end.toISOString())
        .order("fecha", { ascending: true })
        .limit(2000),
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
    if (estados.error) throw estados.error;
    if (puertas.error) throw puertas.error;

    const seleccion = seleccionarDespachos(desp.data ?? [], range.start, range.end);
    const ids = seleccion.map((d) => String(d.id));
    const choferIds = [...new Set(seleccion.map((d) => d.chofer_id).filter(Boolean).map(String))];

    const [layout, actividad, choferes] = await Promise.all([
      ids.length ? db.from("despacho_dev_layout").select("despacho_id,slots").in("despacho_id", ids) : { data: [], error: null },
      ids.length
        ? db
            .from("despacho_dev_actividad")
            .select("entidad_id,tipo,created_at")
            .eq("entidad", "despacho")
            .like("tipo", "despacho_%")
            .in("entidad_id", ids)
        : { data: [], error: null },
      // Solo el nombre: nunca cédula ni documentos.
      choferIds.length ? db.from("despacho_dev_choferes").select("id,nombre").in("id", choferIds) : { data: [], error: null },
    ]);
    if (layout.error) throw layout.error;
    if (actividad.error) throw actividad.error;
    if (choferes.error) throw choferes.error;

    const codigos = new Set((estados.data ?? []).map((e) => String(e.codigo)));
    const ctx = {
      estadoNombre: new Map((estados.data ?? []).map((e) => [String(e.codigo), String(e.nombre)])),
      choferNombre: new Map((choferes.data ?? []).map((c) => [String(c.id), String(c.nombre ?? "")])),
      layout: new Map((layout.data ?? []).map((l) => [String(l.despacho_id), l.slots])),
      historial: historialPorDespacho(actividad.data ?? [], codigos),
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
