// Contexto de la sesión de Supabase Auth del área de Desarrollo.
//
// Fuente única de verdad de la sesión de Supabase (independiente de Firebase) y
// del scope efectivo (tenant_id/company/bodega_id) que viaja en el JWT firmado
// por Supabase. El scope se recalcula con cada sesión nueva (login, refresh de
// token o cambio de usuario).
//
// El scope NO lo declara el cliente: lo inyecta el Custom Access Token Hook
// server-side. Acá solo se LEE el payload del JWT (sin validar la firma; la
// validación real la hace Postgres vía RLS).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  supabaseDespachoDev,
  isDespachoDevConfigured,
} from "../services/supabaseDespachoDev";

export const SupabaseAuthCtx = createContext(null);

/**
 * Decodifica el payload (2º segmento) de un JWT sin validar la firma.
 * Devuelve el objeto de claims o null ante cualquier problema. No loguea el token.
 */
function decodificarPayloadJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // padding a múltiplo de 4
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Extrae { tenantId, company, bodegaId } de los claims del JWT, o null. */
function extraerScopeDeSesion(session) {
  const token = session?.access_token;
  const claims = decodificarPayloadJwt(token);
  if (!claims) return null;
  const tenantId = String(claims.tenant_id || "").trim();
  const company = String(claims.company || "").trim();
  const bodegaId = String(claims.bodega_id || "").trim();
  if (!tenantId && !company && !bodegaId) return null;
  return { tenantId, company, bodegaId };
}

export default function SupabaseAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [scope, setScope] = useState(null);
  const [sessionReady, setSessionReady] = useState(!isDespachoDevConfigured);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");

  const applySession = useCallback((nextSession) => {
    setSession(nextSession || null);
    setScope(extraerScopeDeSesion(nextSession));
  }, []);

  useEffect(() => {
    if (!isDespachoDevConfigured || !supabaseDespachoDev) {
      setSessionReady(true);
      return undefined;
    }
    let alive = true;

    supabaseDespachoDev.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        applySession(data?.session || null);
      })
      .finally(() => {
        if (alive) setSessionReady(true);
      });

    const { data: sub } = supabaseDespachoDev.auth.onAuthStateChange(
      (_event, nextSession) => {
        applySession(nextSession || null);
      }
    );

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [applySession]);

  const signIn = useCallback(async (email, password) => {
    if (!supabaseDespachoDev) return { ok: false, error: "Supabase no está configurado." };
    setLoading(true);
    setLastError("");
    try {
      const { error } = await supabaseDespachoDev.auth.signInWithPassword({
        email: String(email || "").trim().toLowerCase(),
        password: String(password || ""),
      });
      if (error) {
        // Anti-enumeración: mensaje genérico para credenciales.
        const msg = "Credenciales incorrectas.";
        setLastError(msg);
        return { ok: false, error: msg };
      }
      return { ok: true };
    } finally {
      setLoading(false);
    }
  }, []);

  const signUpConScope = useCallback(
    async ({ email, password, tenantId, company, bodegaId }) => {
      if (!supabaseDespachoDev)
        return { ok: false, error: "Supabase no está configurado." };
      if (!tenantId || !company || !bodegaId)
        return { ok: false, error: "Seleccioná país, compañía y bodega." };
      setLoading(true);
      setLastError("");
      try {
        const { data, error } = await supabaseDespachoDev.auth.signUp({
          email: String(email || "").trim().toLowerCase(),
          password: String(password || ""),
          // Estas claves las lee el trigger dd_handle_new_user (camelCase).
          options: { data: { tenantId, company, bodegaId } },
        });
        if (error) {
          setLastError(error.message);
          return { ok: false, error: error.message };
        }
        // Si hay confirmación de email activa, signUp no devuelve sesión.
        const necesitaConfirmacion = !data?.session;
        return { ok: true, necesitaConfirmacion };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!supabaseDespachoDev) return { ok: true };
    setLoading(true);
    try {
      const { error } = await supabaseDespachoDev.auth.signOut();
      if (error) {
        setLastError(error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => {
    const hasSession = Boolean(session?.access_token && session?.user);
    const scopeComplete = Boolean(
      scope?.tenantId && scope?.company && scope?.bodegaId
    );
    return {
      session,
      supabaseUser: session?.user || null,
      scope,
      sessionReady,
      hasSession,
      scopeComplete,
      configurado: isDespachoDevConfigured,
      loading,
      lastError,
      signIn,
      signUpConScope,
      signOut,
    };
  }, [session, scope, sessionReady, loading, lastError, signIn, signUpConScope, signOut]);

  return <SupabaseAuthCtx.Provider value={value}>{children}</SupabaseAuthCtx.Provider>;
}

/** Hook de acceso al contexto de sesión Supabase del área de Desarrollo. */
export function useSupabaseAuth() {
  const ctx = useContext(SupabaseAuthCtx);
  if (!ctx) {
    return {
      session: null,
      supabaseUser: null,
      scope: null,
      sessionReady: true,
      hasSession: false,
      scopeComplete: false,
      configurado: false,
      loading: false,
      lastError: "",
      signIn: async () => ({ ok: false, error: "Provider ausente." }),
      signUpConScope: async () => ({ ok: false, error: "Provider ausente." }),
      signOut: async () => ({ ok: true }),
    };
  }
  return ctx;
}
