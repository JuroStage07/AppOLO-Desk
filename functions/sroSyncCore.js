/**
 * Sincronización del estado de reservas SRO desde accion_descarga (AppOLO).
 *
 * La app móvil ya llama a SRO al iniciar / finalizar una descarga, pero si esa
 * llamada falla (red, sesión, app cerrada) no reintenta y nadie se entera. Esto
 * lo repite desde el servidor y solo hace avanzar la reserva: nunca la regresa.
 *
 *   descarga iniciada   → UNLOADING  ("Descargando...")
 *   descarga finalizada → DISCHARGED ("Descargado")
 *
 * Usa la misma Edge Function y el mismo usuario que la app, así SRO aplica sus
 * validaciones (secuencia por cliente) y el historial queda igual que hoy.
 */

/** Estado SRO que corresponde a una accion_descarga, o null si aún no inició. */
function targetCodeFor(accion) {
  if (!accion || !accion.reservaId) return null;
  if (accion.completedAt) return "DISCHARGED";
  if (accion.startedAt) return "UNLOADING";
  return null;
}

/**
 * ¿Hay que mover la reserva de `currentCode` a `targetCode`?
 * - Cancelada: nunca.
 * - No arribó: sí (la descarga en AppOLO prueba que el camión llegó).
 * - Resto: solo si el estado actual va antes en el orden de SRO.
 */
function shouldAdvance(currentCode, targetCode, orderByCode) {
  if (!currentCode || !targetCode || currentCode === targetCode) return false;
  if (currentCode === "CANCELLED") return false;
  if (currentCode === "NO_SHOW") return true;
  const cur = orderByCode[currentCode];
  const tgt = orderByCode[targetCode];
  if (cur == null || tgt == null) return false;
  return cur < tgt;
}

/** Cliente mínimo de SRO con login del usuario de integración (token en memoria). */
function createSroClient({ url, anonKey, email, password, fetchImpl = fetch }) {
  const base = String(url || "").replace(/\/+$/, "");
  let session = null;
  let statuses = null;

  async function login() {
    const res = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(`SRO login ${res.status}: ${body.error_description || body.msg || body.error || "sin token"}`);
    }
    session = { token: body.access_token, expiresAt: Number(body.expires_at || 0) * 1000 };
    return session.token;
  }

  async function token(force = false) {
    if (!force && session && Date.now() < session.expiresAt - 5 * 60 * 1000) return session.token;
    return login();
  }

  async function request(path, init = {}) {
    const run = async (t) =>
      fetchImpl(`${base}${path}`, {
        ...init,
        headers: { apikey: anonKey, Authorization: `Bearer ${t}`, ...(init.headers || {}) },
      });
    let res = await run(await token());
    if (res.status === 401) res = await run(await token(true));
    return res;
  }

  async function getStatuses() {
    if (statuses) return statuses;
    const res = await request("/rest/v1/reservation_statuses?select=id,code,order_index");
    if (!res.ok) throw new Error(`SRO estados ${res.status}`);
    const rows = await res.json();
    const byCode = {};
    const codeById = {};
    const orderByCode = {};
    for (const s of rows) {
      // Puede haber varios con el mismo code (inactivos de otra org): gana el que tenga orden.
      if (!byCode[s.code] || s.order_index != null) byCode[s.code] = s.id;
      codeById[s.id] = s.code;
      if (s.order_index != null) orderByCode[s.code] = s.order_index;
    }
    statuses = { byCode, codeById, orderByCode };
    return statuses;
  }

  /** @returns {Promise<Record<string, {id, status_id, is_cancelled}>>} */
  async function getReservations(ids) {
    const out = {};
    const list = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50).map(encodeURIComponent).join(",");
      const res = await request(`/rest/v1/reservations?select=id,status_id,is_cancelled&id=in.(${chunk})`);
      if (!res.ok) throw new Error(`SRO reservas ${res.status}`);
      for (const r of await res.json()) out[r.id] = r;
    }
    return out;
  }

  async function patchStatus(reservationId, statusId) {
    const res = await request(
      `/functions/v1/api-v1-reservations-patch-status/${encodeURIComponent(reservationId)}/status`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_id: statusId }) }
    );
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  return { getStatuses, getReservations, patchStatus };
}

/**
 * Sincroniza un lote de acciones de descarga contra SRO.
 * @param {ReturnType<typeof createSroClient>} client
 * @param {Array<{id: string, reservaId?: string, startedAt?: any, completedAt?: any}>} acciones
 * @returns {Promise<Array<{accionId, reservaId, from, to, result}>>}
 */
async function syncAcciones(client, acciones) {
  // Por reserva gana el destino más avanzado (una reserva puede tener varias descargas).
  const wanted = {};
  const accionByReserva = {};
  const rank = { UNLOADING: 1, DISCHARGED: 2 };
  for (const a of acciones) {
    const target = targetCodeFor(a);
    if (!target) continue;
    if (!wanted[a.reservaId] || rank[target] > rank[wanted[a.reservaId]]) {
      wanted[a.reservaId] = target;
      accionByReserva[a.reservaId] = a.id;
    }
  }
  const reservaIds = Object.keys(wanted);
  if (!reservaIds.length) return [];

  const { byCode, codeById, orderByCode } = await client.getStatuses();
  const reservations = await client.getReservations(reservaIds);
  const results = [];

  for (const reservaId of reservaIds) {
    const to = wanted[reservaId];
    const r = reservations[reservaId];
    const base = { accionId: accionByReserva[reservaId], reservaId, to };
    if (!r) {
      results.push({ ...base, from: null, result: "no_existe" });
      continue;
    }
    const from = codeById[r.status_id] || r.status_id;
    if (r.is_cancelled || !shouldAdvance(from, to, orderByCode)) {
      results.push({ ...base, from, result: "al_dia" });
      continue;
    }
    const res = await client.patchStatus(reservaId, byCode[to]);
    results.push({
      ...base,
      from,
      result: res.ok ? "actualizada" : "error",
      ...(res.ok ? {} : { http: res.status, error: res.body?.error || res.body?.message || "" }),
    });
  }
  return results;
}

module.exports = { targetCodeFor, shouldAdvance, createSroClient, syncAcciones };
