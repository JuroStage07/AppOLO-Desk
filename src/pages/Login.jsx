import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/AppOLO_logo.png";

import { auth, db } from "../firebase";
import {
  GoogleAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const ACCENT = "#089F8A";

/** Provider Google (único) */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/** Lee profiles/{uid} (tu caso: docId = uid) */
async function getProfileByUid(uid) {
  const ref = doc(db, "profiles", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Guarda perfil en localStorage (rápido). Podés cambiarlo luego por contexto/store */
function persistSession(profile) {
  localStorage.setItem("appolo_profile", JSON.stringify(profile));
  window.dispatchEvent(new Event("appolo_profile_updated"));
}

export default function Login() {
  const nav = useNavigate();

  // email/pass normal
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  // estado general
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // modal de link
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPass, setLinkPass] = useState("");

  const can = useMemo(() => {
    return !!String(email).trim() && !!String(pass).trim() && !busy;
  }, [email, pass, busy]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = "#F6F7FB";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  const onFocusInput = (e) => {
    e.currentTarget.style.borderColor = ACCENT;
    e.currentTarget.style.boxShadow = "0 0 0 4px rgba(8, 159, 138, 0.12)";
  };

  const onBlurInput = (e) => {
    e.currentTarget.style.borderColor = "#e7e9f2";
    e.currentTarget.style.boxShadow = "none";
  };

  /** Post-auth: valida dominio + carga profile + guarda + navega */
  const afterAuth = async (user) => {
    const mail = (user.email || "").toLowerCase();

    if (!mail.endsWith("@ologistics.com")) {
      await signOut(auth);
      throw new Error("DOMAIN_NOT_ALLOWED");
    }

    const profile = await getProfileByUid(user.uid);
    if (!profile) {
      await signOut(auth);
      throw new Error("NO_PROFILE");
    }

    persistSession(profile);

    if (!profile.tenantId) {
      nav("/config-region", { replace: true });
      return;
    }

    nav("/", { replace: true });
  };

  /** Login tradicional */
  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        String(email).trim(),
        String(pass)
      );
      await afterAuth(cred.user);
    } catch (e2) {
      console.log(e2);
      if (e2?.message === "DOMAIN_NOT_ALLOWED") setErr("Dominio no permitido.");
      else if (e2?.message === "NO_PROFILE") setErr("No existe perfil para este usuario.");
      else setErr("Login inválido. Revisa correo/contraseña.");
    } finally {
      setBusy(false);
    }
  };

  /** Login con Google */
  const onGoogleLogin = async () => {
    setErr("");
    setBusy(true);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await afterAuth(cred.user);
    } catch (e) {
      console.log(e);

      // ⭐ caso: existe con password -> abrir modal para linkear sin salir del flujo
      if (e?.code === "auth/account-exists-with-different-credential") {
        const email = (e?.customData?.email || "").toLowerCase();
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          if (methods.includes("password")) {
            setLinkEmail(email);
            setLinkPass("");
            setLinkModalOpen(true);
          } else {
            setErr("Este correo ya está registrado con otro método.");
          }
        } catch (e2) {
          console.log(e2);
          setErr("No se pudo verificar el método de inicio.");
        }
      } else if (e?.message === "DOMAIN_NOT_ALLOWED") {
        setErr("Dominio no permitido.");
      } else if (e?.message === "NO_PROFILE") {
        setErr("Tu usuario no tiene perfil en el sistema.");
      } else {
        setErr("No se pudo iniciar con Google.");
      }
    } finally {
      setBusy(false);
    }
  };

  /** Linkear Google -> pide password -> vincula -> afterAuth */
  const linkGoogleAccount = async () => {
    setErr("");
    setBusy(true);
    try {
      // 1) entrar con password
      const userCred = await signInWithEmailAndPassword(auth, linkEmail, linkPass);

      // 2) vincular Google
      await linkWithPopup(userCred.user, googleProvider);

      // 3) cerrar modal
      setLinkModalOpen(false);
      setLinkPass("");

      // 4) cargar perfil + navegar
      await afterAuth(userCred.user);
    } catch (e) {
      console.log(e);
      // errores típicos:
      // auth/wrong-password, auth/invalid-credential, auth/popup-closed-by-user, etc.
      setErr("Contraseña incorrecta o no se pudo vincular Google.");
    } finally {
      setBusy(false);
    }
  };

  const closeLinkModal = () => {
    setLinkModalOpen(false);
    setLinkPass("");
    setErr("");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.topAccent} />
        <div style={styles.header}>
          <img src={logo} alt="AppoloDesk" style={styles.logo} />
          <p style={styles.sub}>Inicia sesión para registrar entradas y salidas.</p>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Correo</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              style={styles.input}
              disabled={busy}
              autoComplete="email"
              onFocus={onFocusInput}
              onBlur={onBlurInput}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              type="password"
              style={styles.input}
              disabled={busy}
              autoComplete="current-password"
              onFocus={onFocusInput}
              onBlur={onBlurInput}
            />
          </div>

          {err && <div style={styles.errBox}>{err}</div>}

          <button
            type="submit"
            disabled={!can}
            style={{
              ...styles.btn,
              ...(can ? {} : styles.btnDis),
            }}
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          type="button"
          disabled={busy}
          style={styles.btnGoogle}
          onClick={onGoogleLogin}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = "translateY(-1px)"; }}

          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0px)"; }}
        >
          <span style={styles.gIconWrap} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.2-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.2C29.5 35.1 26.9 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.6 5.1C9.3 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.9 4.9l.1.1 6.4 5.2C36.1 40.8 44 36 44 24c0-1.1-.1-2.2-.4-3.5z" />
            </svg>
          </span>

          <span style={{ fontWeight: 950 }}>Continuar con Google</span>
        </button>

        <div style={styles.footerHint}>Usa tu usuario de AppOLO para ingresar.</div>
      </div>

      {/* ✅ Modal link */}
      {linkModalOpen && (
        <div style={modal.backdrop} onClick={closeLinkModal}>
          <div style={modal.card} onClick={(e) => e.stopPropagation()}>
            <div style={modal.title}>Vincular cuenta</div>
            <div style={modal.text}>
              El correo <b>{linkEmail}</b> ya existe con contraseña.
              <br />
              Ingresala para vincular Google.
            </div>

            <input
              type="password"
              placeholder="Contraseña"
              value={linkPass}
              onChange={(e) => setLinkPass(e.target.value)}
              style={modal.input}
              disabled={busy}
            />

            <div style={modal.actions}>
              <button style={modal.btnGhost} onClick={closeLinkModal} disabled={busy}>
                Cancelar
              </button>

              <button
                style={{
                  ...modal.btnPrimary,
                  ...(linkPass && !busy ? {} : { opacity: 0.6, cursor: "not-allowed" }),
                }}
                onClick={linkGoogleAccount}
                disabled={!linkPass || busy}
              >
                {busy ? "Vinculando..." : "Vincular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    height: "100dvh",
    width: "100vw",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(1200px 600px at 20% 0%, rgba(8,159,138,0.10), transparent 60%), #F6F7FB",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    overflow: "hidden",
  },

  card: {
    width: "min(440px, 100%)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 20,
    padding: 18,
    overflow: "hidden",
    boxShadow: "0 18px 44px rgba(15,23,42,0.10)",
    position: "relative",
  },

  header: {
    marginBottom: 14,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },

  sub: {
    marginTop: 6,
    marginBottom: 0,
    color: "#5a6072",
    fontWeight: 800,
  },

  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },

  form: { display: "grid", gap: 12 },
  field: { display: "grid", gap: 8 },

  label: { fontSize: 12, fontWeight: 950, color: "#0F172A" },

  input: {
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "12px 12px",
    fontWeight: 900,
    color: "#0F172A",
    outline: "none",
    transition: "box-shadow 120ms ease, border-color 120ms ease",
  },

  btn: {
    marginTop: 4,
    width: "100%",
    borderRadius: 14,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "12px 12px",
    fontWeight: 900,
    cursor: "pointer",
    transition: "filter 120ms ease, transform 120ms ease",
  },

  btnDis: { opacity: 0.6, cursor: "not-allowed" },

  // ✅ Google
  btnGoogle: {
    marginTop: 10,
    width: "100%",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    color: "#0F172A",
    padding: "12px 14px",
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },

  gIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#fff",
  },

  errBox: {
    borderRadius: 14,
    border: "1px solid #ffd1d1",
    background: "#fff6f6",
    padding: 10,
    fontWeight: 800,
    color: "#12131a",
  },

  footerHint: {
    marginTop: 12,
    borderRadius: 14,
    border: `1px solid ${ACCENT}`,
    background: "#f3fbf9",
    padding: 10,
    color: "#5a6072",
    fontWeight: 800,
    fontSize: 12,
  },

  logo: {
    height: 170,              // 👈 antes 260
    maxHeight: "22dvh",       // 👈 se adapta a pantallas pequeñas
    objectFit: "contain",
    marginBottom: 6,
  },
};

const modal = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    zIndex: 9999,
    padding: 16,
    overflow: "hidden",
  },
  card: {
    width: "min(360px, 100%)",
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    display: "grid",
    gap: 10,
    boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
    border: "1px solid rgba(15,23,42,0.10)",
  },
  title: {
    fontWeight: 900,
    fontSize: 18,
    color: "#0F172A",
  },
  text: {
    fontSize: 13,
    color: "#5a6072",
    fontWeight: 650,
    lineHeight: 1.35,
  },
  input: {
    borderRadius: 12,
    border: "1px solid #e7e9f2",
    background: "#fbfbfe",
    padding: 10,
    fontWeight: 800,
    outline: "none",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 6,
  },
  btnGhost: {
    borderRadius: 10,
    border: "1px solid #e7e9f2",
    background: "#fff",
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 800,
    color: "#0F172A",
  },
  btnPrimary: {
    borderRadius: 10,
    border: "none",
    background: ACCENT,
    color: "#fff",
    padding: "8px 14px",
    cursor: "pointer",
    fontWeight: 900,
  },
};