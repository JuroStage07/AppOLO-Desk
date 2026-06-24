// MRP Tarimas — identidad del usuario actual para sellar las mutaciones.
//
// El uid sale de Firebase Auth (usuario logeado) y los datos del usuario salen
// del documento profiles/{uid} (cargado por AuthProvider). Toda mutación del
// módulo guarda user_id (uid de Firebase) y user_email.

import { useContext } from "react";
import { AuthCtx } from "../../auth/AuthProvider";

export default function useMrpUser() {
  const ctx = useContext(AuthCtx) || {};
  const { user, profile } = ctx;

  const userId = user?.uid || null; // uid de Firebase del usuario logeado
  const userEmail = profile?.email || user?.email || null; // desde profiles/{uid}
  const userName =
    profile?.displayName || profile?.nombre || user?.displayName || null;

  return { userId, userEmail, userName, profile, user };
}
