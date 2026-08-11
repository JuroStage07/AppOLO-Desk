import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Database,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  Shell,
  Topbar,
  Brand,
  Main,
  Container,
  Hero,
  Badge,
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  StatusPill,
  Spinner,
  useToast,
  theme,
} from "../../../components/ui";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { getBodegaLabel } from "../../../config/bodegas";
import ScopeSelector from "./ScopeSelector";

export default function SupabaseAuthPage() {
  const nav = useNavigate();
  const toast = useToast();
  const {
    configurado,
    sessionReady,
    hasSession,
    scope,
    scopeComplete,
    supabaseUser,
    loading,
    signIn,
    signUpConScope,
    signOut,
  } = useSupabaseAuth();

  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [scopeSel, setScopeSel] = useState({ tenantId: "", company: "OLO", bodegaId: "" });

  async function handleLogin(e) {
    e?.preventDefault?.();
    const res = await signIn(email, password);
    if (res.ok) {
      toast.success("Sesión de Supabase iniciada.");
      setPassword("");
    } else {
      toast.error(res.error || "No se pudo iniciar sesión.");
    }
  }

  async function handleSignup(e) {
    e?.preventDefault?.();
    const res = await signUpConScope({
      email,
      password,
      tenantId: scopeSel.tenantId,
      company: scopeSel.company,
      bodegaId: scopeSel.bodegaId,
    });
    if (res.ok) {
      if (res.necesitaConfirmacion) {
        toast.info("Usuario creado. Revisá el correo para confirmar la cuenta.");
        setMode("login");
      } else {
        toast.success("Usuario creado y sesión iniciada.");
      }
      setPassword("");
    } else {
      toast.error(res.error || "No se pudo crear el usuario.");
    }
  }

  async function handleSignOut() {
    const res = await signOut();
    if (res.ok) toast.success("Sesión de Supabase cerrada.");
    else toast.error(res.error || "No se pudo cerrar sesión.");
  }

  let body;
  if (!configurado) {
    body = (
      <Card>
        <div style={styles.notice}>
          Supabase no está configurado. Definí <code>VITE_SUPABASE_URL</code> y{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> en el entorno para habilitar el área.
        </div>
      </Card>
    );
  } else if (!sessionReady) {
    body = (
      <div style={styles.center}>
        <Spinner />
      </div>
    );
  } else if (hasSession) {
    body = (
      <Card>
        <div style={styles.sessionHead}>
          <StatusPill tone="ok">Sesión activa</StatusPill>
          <StatusPill tone={scopeComplete ? "accent" : "warn"} icon={null}>
            {scopeComplete ? "Scope completo" : "Sin scope"}
          </StatusPill>
        </div>
        <div style={styles.grid}>
          <Dato label="Usuario" value={supabaseUser?.email} />
          <Dato label="Tenant" value={scope?.tenantId} />
          <Dato label="Compañía" value={scope?.company} />
          <Dato
            label="Bodega"
            value={scope?.bodegaId ? `${getBodegaLabel(scope.bodegaId)} (${scope.bodegaId})` : ""}
          />
        </div>
        {!scopeComplete ? (
          <div style={styles.warn}>
            La sesión no trae scope (tenant/company/bodega). Este usuario no fue
            registrado con scope o el hook de claims no está activo en el
            dashboard de Supabase.
          </div>
        ) : null}
        <div style={styles.actions}>
          <SecondaryButton icon={LogOut} onClick={handleSignOut} loading={loading}>
            Cerrar sesión
          </SecondaryButton>
        </div>
      </Card>
    );
  } else {
    body = (
      <Card>
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{ ...styles.tab, ...(mode === "login" ? styles.tabOn : {}) }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={{ ...styles.tab, ...(mode === "signup" ? styles.tabOn : {}) }}
          >
            Crear usuario
          </button>
        </div>

        <form
          style={styles.form}
          onSubmit={mode === "login" ? handleLogin : handleSignup}
        >
          <Field label="Correo" required>
            <Field.Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@empresa.com"
              autoComplete="username"
            />
          </Field>
          <Field label="Contraseña" required>
            <Field.Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>

          {mode === "signup" ? (
            <ScopeSelector value={scopeSel} onChange={setScopeSel} />
          ) : null}

          {mode === "login" ? (
            <PrimaryButton type="submit" icon={LogIn} loading={loading} block>
              Iniciar sesión
            </PrimaryButton>
          ) : (
            <PrimaryButton type="submit" icon={UserPlus} loading={loading} block>
              Crear usuario con scope
            </PrimaryButton>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Database}
          title="Supabase"
          subtitle="Sesión del área de Desarrollo"
          onClick={() => nav("/dev")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/dev")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Desarrollo"
            title="Login de Supabase"
            subtitle="Sesión de Supabase Auth propia e independiente de Firebase. El scope (tenant/company/bodega) se inyecta server-side en el JWT y habilita los módulos de Despacho Dev y Registro de salida."
            badge={<Badge icon={ShieldCheck}>Scope por JWT</Badge>}
          />
          <div style={styles.wrap}>{body}</div>
        </Container>
      </Main>
    </Shell>
  );
}

function Dato({ label, value }) {
  return (
    <div style={styles.dato}>
      <span style={styles.datoLabel}>{label}</span>
      <span style={styles.datoValue}>{value || "—"}</span>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 520, margin: "0 auto", width: "100%" },
  center: { display: "grid", placeItems: "center", padding: 40 },
  notice: { color: theme.TEXT, fontWeight: 700, fontSize: theme.FS_SM, lineHeight: 1.5 },
  tabs: { display: "flex", gap: 8, marginBottom: 14 },
  tab: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: theme.RADIUS_MD,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    color: theme.SLATE,
    fontWeight: 950,
    fontSize: theme.FS_SM,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabOn: { background: "#0F172A", borderColor: "#0F172A", color: "#fff" },
  form: { display: "grid", gap: 12 },
  sessionHead: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  dato: {
    display: "grid",
    gap: 2,
    padding: "8px 10px",
    borderRadius: theme.RADIUS_SM,
    background: theme.SURFACE_INSET,
  },
  datoLabel: { color: theme.SLATE, fontWeight: 800, fontSize: theme.FS_XS },
  datoValue: { color: theme.TEXT, fontWeight: 900, fontSize: theme.FS_SM },
  warn: {
    marginTop: 12,
    color: "#8C5A00",
    background: theme.WARN_BG,
    border: `1px solid ${theme.WARN_BORDER}`,
    borderRadius: theme.RADIUS_MD,
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: theme.FS_SM,
  },
  actions: { marginTop: 16, display: "flex", justifyContent: "flex-end" },
};
