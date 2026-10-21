/**
 * Lógica pura del catálogo organizacional (países, compañías, almacenes).
 * Valida y normaliza lo que manda el cliente y lo traduce a una operación sobre
 * las tablas org_* de Supabase. Sin I/O: lo usa `orgCatalogAdmin` en index.js.
 */

const ENTITIES = {
  tenant: { table: "org_tenants", idPattern: /^[A-Z]{2,5}$/, idHint: "2 a 5 letras mayúsculas (ej: CR)" },
  company: { table: "org_companies", idPattern: /^[A-Z0-9]{2,10}$/, idHint: "2 a 10 letras o números en mayúscula (ej: OLO)" },
  bodega: { table: "org_bodegas", codePattern: /^[A-Z0-9]{2,20}$/, codeHint: "2 a 20 letras o números en mayúscula, sin espacios (ej: CLIRO)" },
};

const ACTIONS = ["create", "update"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CatalogInputError extends Error {}

function text(v) {
  return String(v ?? "").trim();
}

function upperId(v) {
  return text(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function requireName(v) {
  const name = text(v).replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new CatalogInputError("El nombre debe tener entre 2 y 80 caracteres.");
  }
  return name;
}

function optionalBool(v, field) {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new CatalogInputError(`${field} debe ser verdadero o falso.`);
  return v;
}

/**
 * Convierte la petición del cliente en { table, action, id, row }.
 * - create: row completo (incluye id). Falla si ya existe (lo detecta Supabase).
 * - update: row parcial; el id y el scope de una bodega no se pueden cambiar.
 * @throws {CatalogInputError}
 */
function buildCatalogOperation({ entity, action, data } = {}) {
  const def = ENTITIES[entity];
  if (!def) throw new CatalogInputError("Entidad inválida (tenant, company o bodega).");
  if (!ACTIONS.includes(action)) throw new CatalogInputError("Acción inválida (create o update).");
  const input = data && typeof data === "object" ? data : {};

  if (entity === "tenant" || entity === "company") {
    const id = upperId(input.id);
    if (!def.idPattern.test(id)) throw new CatalogInputError(`Código inválido: ${def.idHint}.`);
    const row = {};
    if (action === "create" || input.name !== undefined) row.name = requireName(input.name);
    const active = optionalBool(input.active, "active");
    if (active !== undefined) row.active = active;
    if (action === "create") {
      row.id = id;
      if (row.active === undefined) row.active = true;
    }
    if (action === "update" && Object.keys(row).length === 0) {
      throw new CatalogInputError("No hay cambios para guardar.");
    }
    return { table: def.table, action, id, row };
  }

  // bodega
  if (action === "create") {
    const tenantId = upperId(input.tenantId);
    const companyId = upperId(input.companyId);
    const code = upperId(input.code);
    if (!ENTITIES.tenant.idPattern.test(tenantId)) throw new CatalogInputError("Elegí un país válido.");
    if (!ENTITIES.company.idPattern.test(companyId)) throw new CatalogInputError("Elegí una compañía válida.");
    if (!def.codePattern.test(code)) throw new CatalogInputError(`Código de almacén inválido: ${def.codeHint}.`);
    const id = `${tenantId}-${companyId}-${code}`;
    return {
      table: def.table,
      action,
      id,
      row: {
        id,
        tenant_id: tenantId,
        company_id: companyId,
        code,
        name: requireName(input.name),
        sro_warehouse_id: normalizeUuid(input.sroWarehouseId),
        active: optionalBool(input.active, "active") ?? true,
      },
    };
  }

  const id = text(input.id).toUpperCase();
  if (!/^[A-Z]{2,5}-[A-Z0-9]{2,10}-[A-Z0-9]{2,20}$/.test(id)) {
    throw new CatalogInputError("ID de almacén inválido.");
  }
  if (input.tenantId !== undefined || input.companyId !== undefined || input.code !== undefined) {
    throw new CatalogInputError(
      "El país, la compañía y el código de un almacén no se pueden cambiar: los datos existentes dependen de ese ID. Creá un almacén nuevo y desactivá este."
    );
  }
  const row = {};
  if (input.name !== undefined) row.name = requireName(input.name);
  if (input.sroWarehouseId !== undefined) row.sro_warehouse_id = normalizeUuid(input.sroWarehouseId);
  const active = optionalBool(input.active, "active");
  if (active !== undefined) row.active = active;
  if (Object.keys(row).length === 0) throw new CatalogInputError("No hay cambios para guardar.");
  return { table: def.table, action, id, row };
}

function normalizeUuid(v) {
  const s = text(v);
  if (!s) return null;
  if (!UUID.test(s)) throw new CatalogInputError("El warehouse SRO debe ser un UUID válido o quedar vacío.");
  return s.toLowerCase();
}

/** Traduce errores de PostgREST a mensajes en español para el usuario. */
function describeSupabaseError(status, body) {
  const code = body?.code || "";
  if (status === 409 || code === "23505") return "Ya existe un registro con ese código.";
  if (code === "23503") return "El país o la compañía no existen en el catálogo.";
  if (code === "23514") return "Algún valor no cumple el formato requerido.";
  return body?.message || `Supabase respondió HTTP ${status}.`;
}

module.exports = {
  ENTITIES,
  CatalogInputError,
  buildCatalogOperation,
  describeSupabaseError,
};
