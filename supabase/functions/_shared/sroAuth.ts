// Validación común de las Edge Functions que consume SRO (ops-3d-snapshot,
// ops-manpower). El token que llega es la sesión del usuario en SRO, no de AppOLO.
//
//   1. GET  {SRO}/auth/v1/user                        → sesión válida (401 si no).
//   2. GET  {SRO}/rest/v1/warehouses?id=eq.<almacén>  → org_id del almacén, leído
//      con el token del usuario: si SRO no le deja ver el almacén, 403.
//   3. POST {SRO}/rest/v1/rpc/has_org_permission      → el permiso de la Matriz de
//      Permisos de SRO (p. ej. proceso3d.view, manpower.view). 403 si no lo tiene.
//
// Todo con el JWT del usuario: AppOLO no usa credenciales de servidor de SRO.

export type SroAuthOk = { userId: string; orgId: string };
export type SroAuthError = { status: number; error: string };

export type SroAuthConfig = {
  sroUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function autorizarSro(
  cfg: SroAuthConfig,
  token: string,
  sroWarehouseId: string,
  permiso: string
): Promise<SroAuthOk | SroAuthError> {
  const base = String(cfg.sroUrl || "").replace(/\/+$/, "");
  const f = cfg.fetchImpl ?? fetch;
  if (!base || !cfg.anonKey) return { status: 500, error: "Función sin configurar (SRO_URL / SRO_ANON_KEY)." };
  if (!token) return { status: 401, error: "Falta Authorization: Bearer <token de SRO>." };
  if (!UUID.test(sroWarehouseId)) return { status: 400, error: "sro_warehouse_id inválido." };

  const h = { apikey: cfg.anonKey, Authorization: `Bearer ${token}` };

  const uRes = await f(`${base}/auth/v1/user`, { headers: h });
  if (!uRes.ok) return { status: 401, error: "Sesión de SRO inválida o vencida." };
  const user = await uRes.json().catch(() => null);
  const userId = user?.id;
  if (!userId) return { status: 401, error: "Sesión de SRO inválida." };

  const wRes = await f(`${base}/rest/v1/warehouses?select=org_id&id=eq.${encodeURIComponent(sroWarehouseId)}`, { headers: h });
  if (!wRes.ok) return { status: 403, error: "No se pudo leer el almacén en SRO." };
  const rows = (await wRes.json().catch(() => [])) as Array<{ org_id?: string }>;
  const orgId = rows[0]?.org_id;
  if (!orgId) return { status: 403, error: "El usuario no tiene acceso a ese almacén en SRO." };

  const pRes = await f(`${base}/rest/v1/rpc/has_org_permission`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ p_org_id: orgId, p_permission: permiso }),
  });
  if (!pRes.ok) return { status: 403, error: "No se pudo verificar el permiso en SRO." };
  const tiene = await pRes.json().catch(() => false);
  if (tiene !== true) return { status: 403, error: `Se requiere el permiso ${permiso} en SRO.` };

  return { userId, orgId };
}
