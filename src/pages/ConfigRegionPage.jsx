import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { ACCENT } from "../styles/theme";

function persistSession(profile) {
  localStorage.setItem("appolo_profile", JSON.stringify(profile));
  window.dispatchEvent(new Event("appolo_profile_updated"));
}

export default function ConfigRegionPage() {
  const nav = useNavigate();
  const [tenantId, setTenantId] = useState("");
  const [company, setCompany] = useState("OLO");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("appolo_profile");
    const profile = raw ? JSON.parse(raw) : null;

    if (profile?.tenantId) {
      nav("/", { replace: true });
    }
  }, [nav]);

  const handleSave = async () => {
    setErr("");

    if (!auth.currentUser) {
      setErr("No hay sesión activa.");
      return;
    }

    if (!tenantId) {
      setErr("Debes seleccionar un país.");
      return;
    }

    try {
      setLoading(true);

      const uid = auth.currentUser.uid;
      const ref = doc(db, "profiles", uid);

      await updateDoc(ref, {
        tenantId,
        company,
      });

      const currentRaw = localStorage.getItem("appolo_profile");
      const currentProfile = currentRaw ? JSON.parse(currentRaw) : {};

      const updatedProfile = {
        ...currentProfile,
        tenantId,
        company,
      };

      persistSession(updatedProfile);
      nav("/", { replace: true });
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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>Configurar región</h2>
            <p style={styles.sub}>
              Antes de continuar, selecciona tu país y compañía.
            </p>
          </div>

          <button onClick={handleSignOut} disabled={loading} style={styles.logoutBtn}>
            Salir
          </button>
        </div>

        <div style={styles.block}>
          <div style={styles.label}>País</div>

          <button
            type="button"
            disabled={loading}
            onClick={() => setTenantId("CR")}
            style={{
              ...styles.option,
              ...(tenantId === "CR" ? styles.optionActive : {}),
              ...(loading ? styles.disabled : {}),
            }}
          >
            Costa Rica
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => setTenantId("VNZ")}
            style={{
              ...styles.option,
              ...(tenantId === "VNZ" ? styles.optionActive : {}),
              ...(loading ? styles.disabled : {}),
            }}
          >
            Venezuela
          </button>
        </div>

        <div style={styles.block}>
          <div style={styles.label}>Compañía</div>

          <button
            type="button"
            disabled={loading}
            onClick={() => setCompany("OLO")}
            style={{
              ...styles.option,
              ...(company === "OLO" ? styles.optionActive : {}),
              ...(loading ? styles.disabled : {}),
            }}
          >
            OLO
          </button>
        </div>

        {err ? <div style={styles.errBox}>{err}</div> : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={!tenantId || loading}
          style={{
            ...styles.saveBtn,
            ...((!tenantId || loading) ? styles.disabled : {}),
          }}
        >
          {loading ? "Guardando..." : "Guardar y continuar"}
        </button>
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
  option: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFBFE",
    padding: "14px 12px",
    textAlign: "left",
    fontWeight: 800,
    color: "#394055",
    cursor: "pointer",
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