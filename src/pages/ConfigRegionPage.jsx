import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import useOrgCatalog from "../hooks/useOrgCatalog";
import { assignedBodegaIds, groupBodegasByScope, resolveBodegas, scopePatchFor } from "../utils/userScope";

function persistSession(profile) {
  localStorage.setItem("appolo_profile", JSON.stringify(profile));
  window.dispatchEvent(new Event("appolo_profile_updated"));
}

/**
 * Elegir el almacén activo entre los ASIGNADOS al usuario (profiles/{uid}.bodegaIds).
 * País y compañía se derivan del almacén. Los almacenes los asigna un usuario dev
 * en Administración → Usuarios; acá el usuario no puede elegir un país libremente.
 */
export default function ConfigRegionPage() {
  const nav = useNavigate();
  const { profile: liveProfile, loading: authLoading } = useContext(AuthCtx) || {};
  const { catalog, loading: catalogLoading } = useOrgCatalog();
  const [bodegaId, setBodegaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Perfil vivo de Firestore; si aún no cargó, la copia de localStorage del login.
  const profile = useMemo(() => {
    if (liveProfile) return liveProfile;
    try {
      const raw = localStorage.getItem("appolo_profile");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [liveProfile]);

  useEffect(() => {
    // Ya configurado por completo (país + almacén) → al home.
    if (profile?.tenantId && profile?.bodegaId) {
      nav("/", { replace: true });
      return;
    }
    if (profile?.bodegaId) setBodegaId(profile.bodegaId);
  }, [nav, profile]);

  const options = useMemo(
    () => resolveBodegas(assignedBodegaIds(profile), catalog).filter((b) => b.active),
    [profile, catalog]
  );
  const groups = useMemo(() => groupBodegasByScope(options, catalog), [options, catalog]);

  // Con un solo almacén asignado, queda preseleccionado.
  useEffect(() => {
    if (!bodegaId && options.length === 1) setBodegaId(options[0].id);
  }, [options, bodegaId]);

  const handleSave = async () => {
    setErr("");

    if (!auth.currentUser) {
      setErr("No hay sesión activa.");
      return;
    }

    const bodega = options.find((b) => b.id === bodegaId);
    if (!bodega) {
      setErr("Elegí uno de tus almacenes asignados.");
      return;
    }

    try {
      setLoading(true);
      const patch = scopePatchFor(bodega);
      await updateDoc(doc(db, "profiles", auth.currentUser.uid), patch);

      const currentRaw = localStorage.getItem("appolo_profile");
      const currentProfile = currentRaw ? JSON.parse(currentRaw) : {};
      persistSession({ ...currentProfile, ...patch });

      // Recarga completa para que AuthProvider vuelva a leer el perfil (con almacén)
      // desde Firestore; el scope se usa tanto en escrituras como en filtros en memoria.
      window.location.assign("/");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No se pudo guardar la configuración.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      localStorage.removeItem("appolo_profile");
      await signOut(auth);
      nav("/login", { replace: true });
    } catch (e) {
      console.error(e);
      setErr("No se pudo cerrar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const waiting = (authLoading && !profile) || catalogLoading;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>Elegí tu almacén</h2>
            <p style={styles.sub}>
              Vas a ver y registrar solo los datos del almacén que elijas. Lo podés cambiar después
              desde la barra superior.
            </p>
          </div>

          <button onClick={handleSignOut} disabled={loading} style={styles.logoutBtn}>
            Salir
          </button>
        </div>

        {waiting ? (
          <div style={styles.hint}>Cargando tus almacenes…</div>
        ) : options.length === 0 ? (
          <div style={styles.noAccess}>
            <strong>No tenés almacenes asignados.</strong>
            <span>
              Pedile a un administrador que te asigne al menos un almacén en Administración →
              Usuarios. Después volvé a entrar.
            </span>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} style={styles.block}>
              <div style={styles.label}>
                {g.tenantName} · {g.companyName}
              </div>
              {g.bodegas.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={loading}
                  onClick={() => setBodegaId(b.id)}
                  aria-pressed={bodegaId === b.id}
                  style={{
                    ...styles.option,
                    ...(bodegaId === b.id ? styles.optionActive : {}),
                    ...(loading ? styles.disabled : {}),
                  }}
                >
                  {b.name}
                  <span style={styles.optionId}>{b.id}</span>
                </button>
              ))}
            </div>
          ))
        )}

        {err ? <div style={styles.errBox}>{err}</div> : null}

        {options.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!bodegaId || loading}
            style={{
              ...styles.saveBtn,
              ...((!bodegaId || loading) ? styles.disabled : {}),
            }}
          >
            {loading ? "Guardando..." : "Guardar y continuar"}
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#F6F7FB",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  card: {
    width: "min(460px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    padding: 18,
    boxShadow: "0 18px 44px rgba(15,23,42,0.08)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    color: "#12131a",
  },
  sub: {
    marginTop: 6,
    marginBottom: 0,
    fontSize: 13,
    fontWeight: 700,
    color: "#5a6072",
  },
  logoutBtn: {
    borderRadius: 12,
    border: "1px solid #FFD7DB",
    background: "#FFF5F6",
    color: "#E15B64",
    fontWeight: 900,
    padding: "10px 14px",
    cursor: "pointer",
  },
  block: {
    marginTop: 14,
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 900,
    color: "#394055",
  },
  hint: {
    fontSize: 12,
    fontWeight: 700,
    color: "#8a90a2",
    padding: "4px 2px",
  },
  noAccess: {
    display: "grid",
    gap: 6,
    borderRadius: 14,
    border: "1px solid #FFE1A8",
    background: "#FFF8EB",
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
    color: "#7A4E00",
    lineHeight: 1.4,
  },
  option: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFBFE",
    padding: "14px 12px",
    textAlign: "left",
    fontWeight: 800,
    color: "#394055",
    cursor: "pointer",
  },
  optionId: {
    fontSize: 11,
    fontWeight: 700,
    color: "#8a90a2",
  },
  optionActive: {
    background: "#E9FFFB",
    border: "1px solid #00CAAE",
    color: "#00A892",
  },
  saveBtn: {
    marginTop: 18,
    width: "100%",
    borderRadius: 14,
    border: "1px solid #00CAAE",
    background: "#00CAAE",
    color: "#fff",
    padding: "14px 12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  disabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  errBox: {
    marginTop: 14,
    borderRadius: 14,
    border: "1px solid #ffd1d1",
    background: "#fff6f6",
    padding: 10,
    fontWeight: 800,
    color: "#12131a",
  },
};
