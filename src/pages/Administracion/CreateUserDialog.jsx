import React, { useMemo, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button, Field, Sheet } from "../../components/ui";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, TEXT, WARN_BG } from "../../styles/theme";
import { PERMISSION_GROUPS, PERMISSION_OPTIONS, ROLE_OPTIONS } from "../../config/permissions";
import UserBodegasEditor from "./UserBodegasEditor";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const usernameFromEmail = (email) =>
  String(email || "")
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const EMPTY = {
  displayName: "",
  email: "",
  username: "",
  numeroFicha: "",
  role: "operativo",
  permisos: {},
  scope: { bodegaIds: [], activeBodegaId: "" },
  sendWelcomeEmail: true,
};

/**
 * Alta de usuario (solo dev). Al crear muestra la contraseña temporal UNA vez.
 * props: open, catalog, onClose, onCreate(input) → Promise<result>, onCreated(result)
 */
export default function CreateUserDialog({ open, catalog, onClose, onCreate, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const suggestedUsername = usernameFromEmail(form.email);
  const valid = useMemo(
    () =>
      form.displayName.trim().length >= 2 &&
      EMAIL.test(form.email.trim()) &&
      form.scope.bodegaIds.length > 0,
    [form]
  );

  const close = () => {
    if (saving) return;
    setForm(EMPTY);
    setError("");
    setResult(null);
    setCopied(false);
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await onCreate({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        username: form.username.trim() || suggestedUsername,
        numeroFicha: form.numeroFicha.trim(),
        role: form.role,
        permisos: form.permisos,
        bodegaIds: form.scope.bodegaIds,
        activeBodegaId: form.scope.activeBodegaId,
        sendWelcomeEmail: form.sendWelcomeEmail,
      });
      setResult(res);
      onCreated?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${result.email}\n${result.tempPassword}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={result ? "Usuario creado" : "Crear usuario"} placement="center" maxWidth={680}>
      {result ? (
        <>
          <Sheet.Body>
            <div style={styles.ok}>
              Se creó <strong>{result.email}</strong> (usuario <strong>{result.username}</strong>) con su almacén
              asignado.
            </div>
            <div style={styles.passBox}>
              <div style={styles.passLabel}>Contraseña temporal (se muestra una sola vez)</div>
              <div style={styles.pass}>{result.tempPassword}</div>
              <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
                {copied ? "Copiado" : "Copiar correo y contraseña"}
              </Button>
            </div>
            <div style={styles.hint}>
              {result.emailSent
                ? "También se le envió un correo de bienvenida con un enlace para crear su propia contraseña."
                : result.emailError
                  ? `No se pudo enviar el correo de bienvenida (${result.emailError}). Compartile la contraseña temporal.`
                  : "Compartile la contraseña temporal por un canal privado y pedile que la cambie con «¿Olvidaste tu contraseña?»."}
            </div>
          </Sheet.Body>
          <Sheet.Actions>
            <Button variant="primary" onClick={close}>
              Listo
            </Button>
          </Sheet.Actions>
        </>
      ) : (
        <>
          <Sheet.Body>
            <div style={styles.grid}>
              <Field label="Nombre completo" required>
                <Field.Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Ana Pérez" />
              </Field>
              <Field label="Correo" required>
                <Field.Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="aperez@ologistics.com"
                  autoComplete="off"
                />
              </Field>
              <Field label="Usuario (app móvil)">
                <Field.Input
                  value={form.username}
                  onChange={(e) => set("username", e.target.value.toLowerCase())}
                  placeholder={suggestedUsername || "aperez"}
                />
              </Field>
              <Field label="Número de ficha">
                <Field.Input value={form.numeroFicha} onChange={(e) => set("numeroFicha", e.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="Rol" required>
                <Field.Select value={form.role} onChange={(e) => set("role", e.target.value)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </Field.Select>
              </Field>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Almacenes asignados *</div>
              <UserBodegasEditor catalog={catalog} value={form.scope} onChange={(scope) => set("scope", scope)} />
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Permisos</div>
              {PERMISSION_GROUPS.map((group) => {
                const opts = PERMISSION_OPTIONS.filter((p) => p.group === group);
                if (!opts.length) return null;
                return (
                  <div key={group} style={styles.permGroup}>
                    <div style={styles.permGroupTitle}>{group}</div>
                    <div style={styles.permGrid}>
                      {opts.map((p) => {
                        const on = !!form.permisos[p.key];
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => set("permisos", { ...form.permisos, [p.key]: !on })}
                            style={{ ...styles.perm, ...(on ? styles.permOn : null) }}
                            aria-pressed={on}
                          >
                            <span style={{ ...styles.box, ...(on ? styles.boxOn : null) }}>
                              {on && <Check size={10} strokeWidth={3} color="#fff" />}
                            </span>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={form.sendWelcomeEmail}
                onChange={(e) => set("sendWelcomeEmail", e.target.checked)}
              />
              Enviarle un correo de bienvenida con un enlace para crear su contraseña
            </label>

            {!!error && <div style={styles.error}>{error}</div>}
          </Sheet.Body>
          <Sheet.Actions>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={submit} disabled={!valid || saving} loading={saving}>
              Crear usuario
            </Button>
          </Sheet.Actions>
        </>
      )}
    </Sheet>
  );
}

const styles = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 },
  section: { display: "grid", gap: 8, marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 900, color: TEXT },
  permGroup: { display: "grid", gap: 6 },
  permGroupTitle: { fontSize: 11, fontWeight: 900, color: SLATE, textTransform: "uppercase", letterSpacing: 0.4 },
  permGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 6 },
  perm: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 12.5,
    fontWeight: 800,
    color: TEXT,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  permOn: { borderColor: ACCENT, background: ACCENT_SOFT },
  box: {
    width: 15,
    height: 15,
    borderRadius: 4,
    border: `1.5px solid ${BORDER}`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  boxOn: { background: ACCENT, borderColor: ACCENT },
  toggle: { display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, fontWeight: 800, color: TEXT },
  error: {
    marginTop: 12,
    borderRadius: 12,
    border: "1px solid #ffd1d1",
    background: "#fff6f6",
    padding: 10,
    fontSize: 13,
    fontWeight: 800,
    color: "#b42318",
  },
  ok: { fontSize: 14, fontWeight: 700, color: SLATE, lineHeight: 1.45 },
  passBox: {
    display: "grid",
    gap: 8,
    justifyItems: "start",
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    background: WARN_BG,
    border: "1px solid #FFE1A8",
  },
  passLabel: { fontSize: 12, fontWeight: 900, color: "#7A4E00" },
  pass: { fontSize: 22, fontWeight: 950, color: TEXT, letterSpacing: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  hint: { marginTop: 10, fontSize: 12.5, fontWeight: 700, color: SLATE, lineHeight: 1.45 },
};
