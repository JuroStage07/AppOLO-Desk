import React, { createContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setError("");
      setUser(u ?? null);
      setProfile(null);
      setLoadingAuth(false);

      if (!u) return;

      // ✅ cargar profile por docId = uid
      setLoadingProfile(true);
      try {
        const ref = doc(db, "profiles", u.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // si no hay perfil, lo sacamos y mandamos a login
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setError("NO_PROFILE");
          return;
        }

        setProfile({ id: snap.id, ...snap.data() });
      } catch (e) {
        console.log("AuthProvider profile error:", e);
        // si falla Firestore, mejor cerrar sesión para no quedar en limbo
        try { await signOut(auth); } catch {}
        setUser(null);
        setProfile(null);
        setError("PROFILE_READ_ERROR");
      } finally {
        setLoadingProfile(false);
      }
    });

    return () => unsub();
  }, []);

  const loading = loadingAuth || loadingProfile;

  const value = useMemo(
    () => ({
      user,
      profile,                 // ✅ tu doc profiles/{uid}
      permisos: profile?.permisos || {},  // ✅ map permisos
      role: profile?.role || null,
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