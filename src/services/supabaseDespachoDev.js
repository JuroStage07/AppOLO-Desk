// Cliente Supabase DEDICADO al área de Desarrollo (Despacho Dev / Registro de
// salida / Boletas). Mantiene una sesión de Supabase Auth PROPIA e independiente
// de la sesión de Firebase de la app y del cliente anónimo genérico
// (`src/supabase.js`, sin sesión persistente).
//
// Por qué un cliente aparte:
//   Las tablas `despacho_dev_*` aplican RLS por scope leído de los CLAIMS del
//   JWT (tenant_id/company/bodega_id), inyectados server-side por el Custom
//   Access Token Hook. Para que RLS deje ver/escribir datos, las consultas
//   deben ir con una sesión de Supabase Auth autenticada (rol `authenticated`),
//   NO con la anon key sin sesión. Este cliente persiste esa sesión.
//
// Seguridad: usa SOLO la anon key (jamás la service role key). El scope no lo
// declara el cliente; viaja firmado en el JWT.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true cuando las env vars existen y el cliente pudo crearse. */
export const isDespachoDevConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Cliente con sesión persistente propia. `storageKey` distinto del cliente
 * genérico para que ambas sesiones convivan sin pisarse en localStorage.
 * `null` si faltan env vars (los consumidores deben validar isDespachoDevConfigured).
 */
export const supabaseDespachoDev = isDespachoDevConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Clave de almacenamiento exclusiva del área de Desarrollo.
        storageKey: "appolo-despacho-dev-auth",
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export default supabaseDespachoDev;
