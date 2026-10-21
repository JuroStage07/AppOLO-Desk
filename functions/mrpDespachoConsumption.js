/**
 * Consumo de tarimas MRP originado en un DESPACHO finalizado (app móvil).
 *
 * Quien finaliza despachos (rol operativo con permiso `despacho`) no tiene el permiso
 * MRP Tarimas, así que la Cloud Function lo rechazaba y el consumo quedaba en error
 * hasta que un dev lo "sincronizaba" a mano. Esta lógica permite ese caso SIN dar
 * acceso libre al MRP: el consumo solo se acepta si corresponde exactamente a un
 * despacho finalizado de su scope, y la cantidad, el artículo y la tienda salen del
 * despacho guardado en Supabase (no de lo que mande el cliente).
 *
 * Formato del evento (el que ya usa la app): DESPACHO-<uuid del despacho>-ARTICULO-<código>
 */

const EVENT_RE = /^DESPACHO-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-ARTICULO-([A-Z0-9]+)$/i;

/** "DESPACHO-<uuid>-ARTICULO-30000390" → { despachoId, articuloCodigo } | null */
function parseDespachoEventId(id) {
  const m = String(id || "").trim().match(EVENT_RE);
  return m ? { despachoId: m[1].toLowerCase(), articuloCodigo: m[2].toUpperCase() } : null;
}

/**
 * Consumos que genera un despacho: tarimas sencillas → articulo_s, dobles → articulo_d.
 * @param {object} despacho fila de despacho_dev_despachos
 * @param {object} config   fila de despacho_dev_mrp_tarimas_config ({ articulo_s, articulo_d })
 */
function buildDespachoConsumptions(despacho, config) {
  const items = [
    { articuloCodigo: String(config?.articulo_s || "").toUpperCase(), cantidad: Number(despacho?.tarimas_s) || 0 },
    { articuloCodigo: String(config?.articulo_d || "").toUpperCase(), cantidad: Number(despacho?.tarimas_d) || 0 },
  ];
  return items
    .filter((i) => i.articuloCodigo && Number.isInteger(i.cantidad) && i.cantidad > 0)
    .map((i) => ({
      ...i,
      externalEventId: `DESPACHO-${despacho.id}-ARTICULO-${i.articuloCodigo}`,
      bodegaId: despacho.bodega_id || null,
      tiendaExterna: despacho.tienda || null,
    }));
}

/**
 * Valida un pedido de consumo de un usuario sin permiso MRP contra el despacho real.
 * Devuelve los datos con los que se debe consumir (los del despacho).
 * @returns {{ ok: true, item } | { ok: false, code, message }}
 */
function validateDespachoConsumption({ request, profile, despacho, config }) {
  const fail = (code, message) => ({ ok: false, code, message });
  const parsed = parseDespachoEventId(request?.externalEventId);
  if (!parsed) return fail("permission-denied", "No tienes permisos de MRP Tarimas.");
  if (!despacho || despacho.deleted_at) return fail("not-found", "El despacho del consumo no existe.");
  if (String(despacho.id).toLowerCase() !== parsed.despachoId) return fail("not-found", "El despacho del consumo no existe.");
  if (!despacho.finalized_at) return fail("failed-precondition", "El despacho todavía no está finalizado.");

  const same = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
  if (!same(despacho.tenant_id, profile?.tenantId) || !same(despacho.company, profile?.company)) {
    return fail("permission-denied", "El despacho es de otro país o compañía.");
  }
  if (!same(despacho.bodega_id, profile?.bodegaId)) {
    return fail("permission-denied", "No puedes consumir tarimas fuera de tu bodega activa.");
  }
  if (!config) return fail("failed-precondition", "No hay configuración de artículos MRP para despachos.");

  const item = buildDespachoConsumptions(despacho, config).find((i) => i.articuloCodigo === parsed.articuloCodigo);
  if (!item) return fail("invalid-argument", "Ese artículo no corresponde a las tarimas del despacho.");
  const requested = Number(request?.cantidad ?? request?.quantity);
  if (Number.isFinite(requested) && requested !== item.cantidad) {
    return fail("invalid-argument", `La cantidad no coincide con el despacho (${item.cantidad}).`);
  }
  return { ok: true, item };
}

module.exports = { parseDespachoEventId, buildDespachoConsumptions, validateDespachoConsumption };
