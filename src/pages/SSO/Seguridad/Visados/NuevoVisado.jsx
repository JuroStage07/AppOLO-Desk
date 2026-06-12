import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../../../firebase";
import {
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../firebase";
import { AuthCtx } from "../../../../auth/AuthProvider";
import { isInUserScope } from "../../../../utils/dataScope";
import { ArrowLeft, PenLine } from "lucide-react";
import {
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  Topbar,
  useToast,
} from "../../../../components/ui";

const ACCENT = "#089F8A";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const yesNo = [
  { v: "SI", label: "Sí" },
  { v: "NO", label: "No" },
];

export default function NuevoVisado() {
  const nav = useNavigate();
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    fecha: todayISO(),
    nombres: "",
    identificacion: "",

    numeroPatronal: "",
    empresaProveedora: "",
    telefonoEmpresa: "",
    supervisor: "",
    telefonoSupervisor: "",

    labores: "",
    tipoTramite: "ANUAL", // ANUAL | TEMP_3M | MENOR_3M
    tipoTramiteDetalle: "",

    familiares: "NO",
    familiarNombre: "",
    familiarParentesco: "",
    familiarPuesto: "",
    familiarUnidadVenta: "",

    capAltura: "NO",
    capConfinados: "NO",
    capElectricos: "NO",
    capSoldadura: "NO",

    empresaAportaCert: "NO",

    aceptaNormas: false,
  });

  const back = () => nav("/seguridad/visado");

  const set = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e = {};
    const req = "Este campo es obligatorio.";

    if (!String(form.fecha).trim()) e.fecha = req;
    if (!String(form.identificacion).trim()) e.identificacion = req;
    if (!String(form.nombres).trim()) e.nombres = req;
    if (!String(form.empresaProveedora).trim()) e.empresaProveedora = req;
    if (!String(form.labores).trim()) e.labores = req;

    if (form.tipoTramite === "MENOR_3M" && !String(form.tipoTramiteDetalle).trim()) {
      e.tipoTramiteDetalle = "Especificá la duración del trámite.";
    }

    if (form.familiares === "SI") {
      if (!String(form.familiarNombre).trim()) e.familiarNombre = req;
      if (!String(form.familiarParentesco).trim()) e.familiarParentesco = req;
    }

    if (!form.aceptaNormas) {
      e.aceptaNormas = "Debés aceptar las normas para continuar.";
    }

    return e;
  };

  const showFamiliares = form.familiares === "SI";
  const showTramiteDetalle = form.tipoTramite === "MENOR_3M";

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    if (authLoading) return;
    if (saving) return;

    const it = validate();
    if (Object.keys(it).length) {
      setErrors(it);
      toast.warning("Revisá los campos marcados.");
      // Focus + scroll the first invalid control into view.
      setTimeout(() => {
        const el = document.querySelector('[aria-invalid="true"]');
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus?.({ preventScroll: true });
        }
      }, 0);
      return;
    }
    setErrors({});

    setSaving(true);
    let step = "init";
    try {
      const cedula = String(form.identificacion || "").trim();
      const nombre = String(form.nombres || "").trim();
      const empresa = String(form.empresaProveedora || "").trim();
      const motivo = String(form.labores || "").trim();

      if (!cedula) throw new Error("Falta cédula");

      const tenantId = String(profile?.tenantId || "").trim();
      const company = String(profile?.company || "").trim();
      if (!tenantId || !company) throw new Error("Falta tenantId/company en el profile.");

      const q = query(collection(db, "usuariosTerceros"), where("cedula", "==", cedula));
      const snap = await getDocs(q);
      const existingScoped = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), __ref: d.ref }))
        .find((row) => isInUserScope(row, tenantId, company));

      if (!existingScoped) {
        step = "usuariosTerceros:create";
        await addDoc(collection(db, "usuariosTerceros"), {
          cedula,
          nombre,
          empresa,
          motivo,
          tenantId,
          company,
          entrada: false,
          usuarioBloqueado: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        step = "usuariosTerceros:update";
        await updateDoc(existingScoped.__ref, {
          nombre,
          empresa,
          motivo,
          tenantId,
          company,
          updatedAt: serverTimestamp(),
        });
      }

      step = "visados:create";
      const visadoRef = await addDoc(collection(db, "visados"), {
        tenantId,
        company,
        cedula,
        nombre,
        nombreLower: nombre.toLowerCase(),
        empresa,
        empresaLower: empresa.toLowerCase(),
        motivo,
        fechaISO: form.fecha,

        numeroPatronal: form.numeroPatronal ?? "",
        telefonoEmpresa: form.telefonoEmpresa,
        supervisor: form.supervisor,
        telefonoSupervisor: form.telefonoSupervisor,

        tipoTramite: form.tipoTramite,
        tipoTramiteDetalle: form.tipoTramiteDetalle,

        familiares: form.familiares,
        familiarNombre: form.familiarNombre,
        familiarParentesco: form.familiarParentesco,
        familiarPuesto: form.familiarPuesto,
        familiarUnidadVenta: form.familiarUnidadVenta,

        capAltura: form.capAltura,
        capConfinados: form.capConfinados,
        capElectricos: form.capElectricos,
        capSoldadura: form.capSoldadura,

        empresaAportaCert: form.empresaAportaCert,
        aceptaNormas: form.aceptaNormas,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        creadoPor: auth.currentUser?.uid ?? null,
      });

      //  Generar consecutivo usando timestamp
      const now = Date.now();
      const solicitudNum = `VIS-${now}`;

      //  Crear registro para firma
      step = "visadosPorFirmar:create";
      await addDoc(collection(db, "visadosPorFirmar"), {
        tenantId,
        company,
        visadoUID: visadoRef.id,
        solicitudNum,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        createdBy: auth.currentUser?.displayName || auth.currentUser?.email || "Usuario",

        terceroNombre: nombre,
        terceroCedula: cedula,
        terceroEmpresa: empresa,

        status: "PENDIENTE", // PENDIENTE | PARCIAL | FIRMADO

        firmaColaborador: {
          url: null,
          path: null,
          signedAt: null,
          signedBy: null,
        },

        firmaRepresentante: {
          url: null,
          path: null,
          signedAt: null,
          signedBy: null,
        },
      });

      toast.success("Visado guardado correctamente.");
      nav("/seguridad/visado", { replace: true });
    } catch (err) {
      console.error("NuevoVisado error:", step, err?.code, err?.message, err);
      toast.error(
        `Error guardando visado (paso: ${step}, código: ${err?.code || "error"}): ${
          err?.message || "falló"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={PenLine}
          title="Nuevo visado"
          subtitle="Salud Ocupacional"
          onClick={back}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={back} disabled={saving}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main padding="16px">
        <Container max={1100} style={{ gap: 12 }}>
          <div style={styles.card}>
          <form onSubmit={onSubmit} style={styles.form}>
            {/* INFO GENERAL */}
            <Section
              title="Información general"
              desc="Completá los datos básicos del colaborador externo."
            >
              <div style={styles.grid2}>
                <Field label="Fecha" required error={errors.fecha}>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => set("fecha", e.target.value)}
                    style={styles.input}
                    disabled={saving}
                    readOnly
                  />
                </Field>

                <Field label="No. identificación" required hint="Ej: cédula / DIMEX / pasaporte" error={errors.identificacion}>
                  <input
                    value={form.identificacion}
                    onChange={(e) => set("identificacion", e.target.value)}
                    placeholder="Identificación"
                    style={styles.input}
                    disabled={saving}
                    autoComplete="off"
                  />
                </Field>
              </div>

              <div style={styles.grid2}>
                <Field label="Nombres y apellidos" required error={errors.nombres}>
                  <input
                    value={form.nombres}
                    onChange={(e) => set("nombres", e.target.value)}
                    placeholder="Nombre completo"
                    style={styles.input}
                    disabled={saving}
                  />
                </Field>

                <Field label="Empresa proveedora" required error={errors.empresaProveedora}>
                  <input
                    value={form.empresaProveedora}
                    onChange={(e) => set("empresaProveedora", e.target.value)}
                    placeholder="Empresa"
                    style={styles.input}
                    disabled={saving}
                  />
                </Field>
              </div>

              <div style={styles.grid3}>
                <Field label="Número patronal" hint="Opcional">
                  <input
                    value={form.numeroPatronal}
                    onChange={(e) => set("numeroPatronal", e.target.value)}
                    placeholder="Número patronal"
                    style={styles.input}
                    disabled={saving}
                  />
                </Field>

                <Field label="Teléfono empresa" hint="Opcional">
                  <input
                    value={form.telefonoEmpresa}
                    onChange={(e) => set("telefonoEmpresa", e.target.value)}
                    placeholder="####-####"
                    style={styles.input}
                    disabled={saving}
                    inputMode="tel"
                  />
                </Field>

                <Field label="Supervisor inmediato" hint="Opcional">
                  <input
                    value={form.supervisor}
                    onChange={(e) => set("supervisor", e.target.value)}
                    placeholder="Nombre del supervisor"
                    style={styles.input}
                    disabled={saving}
                  />
                </Field>
              </div>

              <div style={styles.grid2}>
                <Field label="Teléfono supervisor" hint="Opcional">
                  <input
                    value={form.telefonoSupervisor}
                    onChange={(e) => set("telefonoSupervisor", e.target.value)}
                    placeholder="####-####"
                    style={styles.input}
                    disabled={saving}
                    inputMode="tel"
                  />
                </Field>
              </div>

              <Field label="Labores a realizar" required hint="Sé específico (área, equipo, actividad)." error={errors.labores}>
                <textarea
                  value={form.labores}
                  onChange={(e) => set("labores", e.target.value)}
                  placeholder="Describe las labores…"
                  style={styles.textarea}
                  disabled={saving}
                />
              </Field>

              <Field label="Tipo de trámite" required>
                <Segmented
                  value={form.tipoTramite}
                  onChange={(v) => set("tipoTramite", v)}
                  disabled={saving}
                  options={[
                    { v: "ANUAL", label: "Anual" },
                    { v: "TEMP_3M", label: "Temporal (3 meses)" },
                    { v: "MENOR_3M", label: "Menor a 3 meses" },
                  ]}
                />
                {showTramiteDetalle && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <input
                      value={form.tipoTramiteDetalle}
                      onChange={(e) => set("tipoTramiteDetalle", e.target.value)}
                      placeholder="Especifique (ej: 2 semanas, 1 mes)"
                      style={{
                        ...styles.input,
                        ...(errors.tipoTramiteDetalle ? styles.inputInvalid : {}),
                      }}
                      aria-invalid={errors.tipoTramiteDetalle ? true : undefined}
                      disabled={saving}
                    />
                    {errors.tipoTramiteDetalle ? (
                      <div style={styles.errorMsg} role="alert">
                        {errors.tipoTramiteDetalle}
                      </div>
                    ) : null}
                  </div>
                )}
              </Field>
            </Section>

            {/* FAMILIARES */}
            <Section title="Relación de familiares" desc="Solo si aplica, registrá los datos del familiar.">
              <Field label="¿Tiene familiares trabajando para otra empresa proveedora o en OLO?">
                <Segmented
                  value={form.familiares}
                  onChange={(v) => set("familiares", v)}
                  disabled={saving}
                  options={yesNo}
                />
              </Field>

              {showFamiliares && (
                <div style={styles.grid2}>
                  <Field label="Nombre" required error={errors.familiarNombre}>
                    <input
                      value={form.familiarNombre}
                      onChange={(e) => set("familiarNombre", e.target.value)}
                      placeholder="Nombre"
                      style={styles.input}
                      disabled={saving}
                    />
                  </Field>

                  <Field label="Parentesco" required error={errors.familiarParentesco}>
                    <input
                      value={form.familiarParentesco}
                      onChange={(e) => set("familiarParentesco", e.target.value)}
                      placeholder="Parentesco"
                      style={styles.input}
                      disabled={saving}
                    />
                  </Field>

                  <Field label="Puesto">
                    <input
                      value={form.familiarPuesto}
                      onChange={(e) => set("familiarPuesto", e.target.value)}
                      placeholder="Puesto"
                      style={styles.input}
                      disabled={saving}
                    />
                  </Field>

                  <Field label="Unidad de venta">
                    <input
                      value={form.familiarUnidadVenta}
                      onChange={(e) => set("familiarUnidadVenta", e.target.value)}
                      placeholder="Unidad de venta"
                      style={styles.input}
                      disabled={saving}
                    />
                  </Field>
                </div>
              )}
            </Section>

            {/* CAPACITACIONES */}
            <Section title="Capacitaciones" desc="Marcá según aplique a las labores indicadas.">
              <div style={styles.grid2}>
                <YesNoField label="Trabajos en altura" value={form.capAltura} onChange={(v) => set("capAltura", v)} disabled={saving} />
                <YesNoField label="Espacios confinados" value={form.capConfinados} onChange={(v) => set("capConfinados", v)} disabled={saving} />
                <YesNoField label="Trabajos eléctricos" value={form.capElectricos} onChange={(v) => set("capElectricos", v)} disabled={saving} />
                <YesNoField label="Corte y soldadura" value={form.capSoldadura} onChange={(v) => set("capSoldadura", v)} disabled={saving} />
              </div>

              <Field
                label="¿La empresa proveedora aporta certificaciones/títulos y EPP/herramientas?"
              >
                <Segmented
                  value={form.empresaAportaCert}
                  onChange={(v) => set("empresaAportaCert", v)}
                  disabled={saving}
                  options={yesNo}
                />
              </Field>
            </Section>

            {/* ACEPTACIÓN */}
            <Section title="Aceptación" desc="Requerido para registrar el visado.">
              <div
                style={{
                  ...styles.acceptBox,
                  ...(errors.aceptaNormas ? styles.acceptBoxInvalid : {}),
                }}
              >
                <label style={styles.acceptRow}>
                  <input
                    type="checkbox"
                    checked={form.aceptaNormas}
                    onChange={(e) => set("aceptaNormas", e.target.checked)}
                    disabled={saving}
                    style={styles.checkbox}
                    aria-invalid={errors.aceptaNormas ? true : undefined}
                  />
                  <span style={styles.acceptText}>
                    He recibido, leído y acepto cumplir con las Normas de Seguridad para Personal Externo
                    durante el tiempo en que me encuentre laborando en las instalaciones. En caso de
                    atención médica y elevación por riesgos del trabajo, se usará la póliza de la empresa
                    que nos representa.
                  </span>
                </label>
                {errors.aceptaNormas ? (
                  <div style={{ ...styles.errorMsg, marginTop: 8 }} role="alert">
                    {errors.aceptaNormas}
                  </div>
                ) : null}
              </div>
            </Section>

            {/* Footer actions */}
            <div style={styles.footerSticky}>
              <div style={styles.footerLeft}>
                <div style={styles.helper}>
                  Campos requeridos: <b>Fecha</b>, <b>Identificación</b>, <b>Nombre</b>, <b>Empresa</b>, <b>Labores</b> y <b>Aceptación</b>.
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{ ...styles.btnPrimary, ...(saving ? styles.btnDisabled : {}) }}
              >
                {saving ? "Guardando…" : "Guardar visado"}
              </button>
            </div>
          </form>
          </div>
        </Container>
      </Main>
    </Shell>
  );
}

/* ===================== UI COMPONENTS ===================== */

function Section({ title, desc, children }) {
  return (
    <div style={styles.sectionCard}>
      <div style={styles.sectionHead}>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          {desc ? <div style={styles.sectionDesc}>{desc}</div> : null}
        </div>
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Field({ label, hint, required, error, children }) {
  const invalid = !!error;
  // When invalid, inject a red border + aria-invalid into the field's control(s)
  // so focusing/scrolling the first error works via [aria-invalid="true"].
  const decorated = invalid
    ? React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        const type = child.type;
        if (type === "input" || type === "textarea") {
          return React.cloneElement(child, {
            "aria-invalid": true,
            style: { ...(child.props.style || {}), ...styles.inputInvalid },
          });
        }
        return child;
      })
    : children;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={styles.labelRow}>
        <div style={styles.label}>
          {label} {required ? <span style={styles.req}>*</span> : null}
        </div>
        {invalid ? null : hint ? <div style={styles.hint}>{hint}</div> : null}
      </div>
      {decorated}
      {invalid ? (
        <div style={styles.errorMsg} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Segmented({ value, onChange, disabled, options }) {
  return (
    <div style={{ ...styles.segmented, ...(disabled ? styles.segmentedDisabled : {}) }}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            disabled={disabled}
            style={{ ...styles.segmentBtn, ...(active ? styles.segmentBtnActive : {}) }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function YesNoField({ label, value, onChange, disabled }) {
  return (
    <div style={styles.yesNoCard}>
      <div style={styles.yesNoLabel}>{label}</div>
      <Segmented value={value} onChange={onChange} disabled={disabled} options={yesNo} />
    </div>
  );
}

/* ===================== STYLES ===================== */

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },

  form: { padding: 14, display: "grid", gap: 14 },

  sectionCard: {
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    overflow: "hidden",
  },
  sectionHead: {
    padding: "12px 12px",
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: { fontWeight: 950, fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", color: "#0F172A" },
  sectionDesc: { marginTop: 4, color: "#64748B", fontWeight: 700, fontSize: 13 },
  sectionBody: { padding: 12, display: "grid", gap: 12 },

  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },

  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  label: { fontSize: 13, fontWeight: 900, color: "#0F172A" },
  req: { color: "#EF4444", marginLeft: 4 },
  hint: { fontSize: 12, fontWeight: 800, color: "#94A3B8" },

  input: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: "12px 12px",
    fontWeight: 800,
    color: "#0F172A",
    outline: "none",
    transition: "box-shadow 120ms ease, border-color 120ms ease",
  },
  textarea: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: "12px 12px",
    fontWeight: 800,
    color: "#0F172A",
    outline: "none",
    minHeight: 96,
    resize: "vertical",
  },

  inputInvalid: {
    borderColor: "#FCA5A5",
    background: "#FEF6F6",
    boxShadow: "0 0 0 3px rgba(185,28,28,0.10)",
  },
  errorMsg: { color: "#DC2626", fontWeight: 800, fontSize: 12 },

  segmented: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    background: "#F6F7FB",
    border: "1px solid #E7E9F2",
    padding: 8,
    borderRadius: 14,
  },
  segmentedDisabled: { opacity: 0.8 },
  segmentBtn: {
    border: "1px solid transparent",
    borderRadius: 12,
    padding: "10px 10px",
    fontWeight: 900,
    cursor: "pointer",
    background: "transparent",
    color: "#334155",
  },
  segmentBtnActive: {
    background: "#FFFFFF",
    border: `1px solid rgba(8,159,138,0.35)`,
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
    color: "#0F172A",
  },

  yesNoCard: {
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: 12,
    display: "grid",
    gap: 10,
  },
  yesNoLabel: { fontWeight: 950, color: "#0F172A" },

  acceptBox: {
    borderRadius: 16,
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    padding: 12,
  },
  acceptBoxInvalid: {
    borderColor: "#FCA5A5",
    background: "#FEF6F6",
    boxShadow: "0 0 0 3px rgba(185,28,28,0.10)",
  },
  acceptRow: { display: "flex", gap: 10, alignItems: "flex-start" },
  checkbox: { marginTop: 2, width: 18, height: 18, accentColor: ACCENT },
  acceptText: { color: "#0F172A", fontWeight: 750, lineHeight: 1.4, fontSize: 13 },

  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#FFFFFF",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    color: "#0F172A",
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
  },

  btnPrimary: {
    borderRadius: 14,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "12px 14px",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(8,159,138,0.22)",
  },

  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },

  footerSticky: {
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 35%, rgba(255,255,255,1) 100%)",
    paddingTop: 12,
    paddingBottom: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLeft: { display: "grid", gap: 6 },
  helper: { color: "#64748B", fontWeight: 700, fontSize: 12 },

  /* responsive quick fix */
  "@media": {},
};