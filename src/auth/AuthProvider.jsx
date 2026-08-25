import React, { createContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";

export const AuthCtx = createContext(null);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // loadingAuth: esperando Firebase Auth
  // loadingProfile: esperando Firestore profile
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    // Suscripción al documento de perfil del usuario activo. Se rehace en cada
    // cambio de sesión y se limpia al cerrar sesión o desmontar.
    let unsubProfile = null;

    const clearProfileSub = () => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setError("");
      setUser(u ?? null);
      setProfile(null);
      setLoadingAuth(false);

      clearProfileSub();

      if (!u) return;

      // ✅ escuchar profiles/{uid} EN TIEMPO REAL: así los cambios de permisos,
      // rol, tenant o bodega se reflejan sin necesidad de re-login.
      setLoadingProfile(true);
      const ref = doc(db, "profiles", u.uid);
      unsubProfile = onSnapshot(
        ref,
        async (snap) => {
          if (!snap.exists()) {
            // si no hay perfil, lo sacamos y mandamos a login
            clearProfileSub();
            try { await signOut(auth); } catch { /* ignore */ }
            setUser(null);
            setProfile(null);
            setError("NO_PROFILE");
            setLoadingProfile(false);
            return;
          }
          setProfile({ id: snap.id, ...snap.data() });
          setLoadingProfile(false);
        },
        async (e) => {
          console.log("AuthProvider profile error:", e);
          // si falla Firestore, mejor cerrar sesión para no quedar en limbo
          clearProfileSub();
          try { await signOut(auth); } catch { /* ignore */ }
          setUser(null);
          setProfile(null);
          setError("PROFILE_READ_ERROR");
          setLoadingProfile(false);
        }
      );
    });

    return () => {
      clearProfileSub();
      unsubAuth();
    };
  }, []);

  const loading = loadingAuth || loadingProfile;

  const value = useMemo(
    () => ({
      user,
      profile,                 // ✅ tu doc profiles/{uid}
      permisos: profile?.permisos || {},  // ✅ map permisos
      role: profile?.role || null,
      // Tercera identidad (bodega activa), igual que en AppOLO. Viene de profiles/{uid}.
      tenantId: profile?.tenantId || null,
      company: profile?.company || null,
      bodegaId: profile?.bodegaId || null,
      bodegaNombre: profile?.bodegaNombre || null,
      epaAdmin:
        profile?.epaAdmin === true ||
        String(profile?.epaAdmin || "").toLowerCase() === "true",
      loading,
      error,
    }),
    [user, profile, loading, error]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}