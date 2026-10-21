/**
 * Lógica pura del alta de usuarios desde Desk (callable adminCreateUser).
 * Valida y normaliza lo que manda el cliente; no hace I/O.
 */
const crypto = require("crypto");

const ROLES = ["operativo", "administrativo", "dev"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BODEGA_ID = /^[A-Z]{2,5}-[A-Z0-9]{2,10}-[A-Z0-9]{2,20}$/;

class UserInputError extends Error {}

const text = (v) => String(v ?? "").trim();

/** Usuario de la app móvil a partir del correo: "J.Bonilla@ologistics.com" → "jbonilla". */
function usernameFromEmail(email) {
  return text(email)
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Contraseña temporal legible: 4 bloques, sin caracteres ambiguos (0/O, 1/l/I). */
function generateTempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/**
 * @param {object} data   lo que manda el cliente
 * @param {Array<{id,tenant_id,company_id,name,active}>} catalogBodegas  filas de org_bodegas
 * @returns {{ email, displayName, username, numeroFicha, role, epaAdmin, permisos, bodegaIds,
 *             tenantId, company, bodegaId, bodegaNombre, sendWelcomeEmail }}
 * @throws {UserInputError}
 */
function normalizeCreateUserInput(data = {}, catalogBodegas = []) {
  const email = text(data.email).toLowerCase();
  if (!EMAIL.test(email)) throw new UserInputError("Correo inválido.");

  const displayName = text(data.displayName).replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    throw new UserInputError("El nombre debe tener entre 2 y 80 caracteres.");
  }

  const username = text(data.username).toLowerCase() || usernameFromEmail(email);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new UserInputError("Usuario inválido: 3 a 40 letras minúsculas, números, punto, guion o guion bajo.");
  }

  const role = text(data.role);
  if (!ROLES.includes(role)) throw new UserInputError("Rol inválido.");

  const permisos = {};
  if (data.permisos && typeof data.permisos === "object") {
    for (const [k, v] of Object.entries(data.permisos)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{1,40}$/.test(k)) throw new UserInputError(`Permiso inválido: ${k}`);
      if (typeof v !== "boolean") throw new UserInputError(`El permiso ${k} debe ser verdadero o falso.`);
      permisos[k] = v;
    }
  }

  const ids = [...new Set((Array.isArray(data.bodegaIds) ? data.bodegaIds : []).map((x) => text(x).toUpperCase()).filter(Boolean))];
  if (ids.length === 0) throw new UserInputError("Asigná al menos un almacén.");
  const byId = new Map(catalogBodegas.map((b) => [b.id, b]));
  for (const id of ids) {
    if (!BODEGA_ID.test(id) || !byId.has(id)) throw new UserInputError(`El almacén ${id} no existe en el catálogo.`);
    if (!byId.get(id).active) throw new UserInputError(`El almacén ${id} está desactivado.`);
  }
  const activeId = text(data.activeBodegaId).toUpperCase() || ids[0];
  if (!ids.includes(activeId)) throw new UserInputError("El almacén activo tiene que estar entre los asignados.");
  const active = byId.get(activeId);

  return {
    email,
    displayName,
    username,
    numeroFicha: text(data.numeroFicha) || null,
    role,
    epaAdmin: data.epaAdmin === true,
    permisos,
    bodegaIds: ids,
    tenantId: active.tenant_id,
    company: active.company_id,
    bodegaId: active.id,
    bodegaNombre: active.name,
    sendWelcomeEmail: data.sendWelcomeEmail === true,
  };
}

module.exports = { ROLES, UserInputError, usernameFromEmail, generateTempPassword, normalizeCreateUserInput };
