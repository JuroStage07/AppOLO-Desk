import React, { useCallback, useContext, useEffect, useState } from "react";
import { CalendarClock, Check, Plus, Search, X } from "lucide-react";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import {
  OT_DEPARTAMENTOS,
  OT_LUGARES_PROBLEMA,
  OT_TIPOS_PROBLEMA,
} from "../../../config/otOptions";
import {
  fetchActiveSubtaskCatalog,
  fetchMantenimientoResponsables,
  subtaskCatalogItemLabel,
} from "../../../services/otCatalogs";
import { buildScopeFields } from "../../../utils/dataScope";
import {
  SCHEDULED_ALERT_WINDOWS,
  businessToday,
  deadlineLabel,
  missedAlertWindows,
  validateScheduledOtDraft,
} from "../../../utils/scheduledMaintenance";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  Spinner,
  useToast,
} from "../../../components/ui";
import {
  ACCENT,
  BORDER,
  MUTED,
  RADIUS,
  RADIUS_PILL,
  SLATE,
  SURFACE,
  SURFACE_SOFT,
  TEXT,
  withAlpha,
} from "../../../styles/theme";

const OT_STATE_SOLICITADA = "Solicitada";
const SUBTASK_STATUS_PENDIENTE = "Pendiente";
const PRIORITIES = ["Alta", "Media", "Baja"];

function emptyForm() {
  return {
    nombreOT: "",
    activoReferencia: "",
    departamento: "",
    lugarProblema: "",
    tipoProblema: "",
    descripcionOT: "",
    notas: "",
    scheduledDate: "",
    prioridadOT: "Media",
  };
}

function normalizeSubtaskTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Alta de una OT de mantenimiento programado.
 *
 * Reutiliza la colección y el ciclo de vida de las OTs normales: se crea en
 * `solicitudesOT` con `OTState: "Solicitada"`, así que aparece en la columna
 * «Tareas Pendientes» del tablero. Lo que la distingue es `scheduledMaintenance:
 * true` + `scheduledDate` (deadline). El job diario la pasa a «En proceso» al
 * llegar la fecha y desde ahí sigue el flujo normal.
 *
 * Reglas de negocio del formulario: responsable, deadline y subtareas son
 * obligatorios (también validado en firestore.rules para el flag + deadline +
 * responsables). La OT y sus subtareas se escriben en un `writeBatch`, así que
 * no puede quedar una OT programada sin subtareas por un error a mitad de camino.
 */
export default function NewScheduledOTModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || null;

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [responsables, setResponsables] = useState([]);
  const [responsablesOptions, setResponsablesOptions] = useState([]);
  const [responsablesSearch, setResponsablesSearch] = useState("");

  const [subtareas, setSubtareas] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [subtaskSearch, setSubtaskSearch] = useState("");

  const [loadingRefs, setLoadingRefs] = useState(false);
  const [refsError, setRefsError] = useState("");

  const today = businessToday();

  // Carga de catálogos al abrir. El reset del formulario también ocurre acá,
  // dentro del async, para no llamar setState de forma sincrónica en el efecto.
  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    (async () => {
      setLoadingRefs(true);
      setRefsError("");
      setForm(emptyForm());
      setErrors({});
      setResponsables([]);
      setResponsablesSearch("");
      setSubtareas([]);
      setSubtaskSearch("");

      try {
        const [people, catalogRows] = await Promise.all([
          fetchMantenimientoResponsables(profile?.tenantId, profile?.company),
          fetchActiveSubtaskCatalog(),
        ]);
        if (cancelled) return;
        setResponsablesOptions(people);
        setCatalog(catalogRows);
      } catch (err) {
        console.error("NewScheduledOTModal refs:", err);
        if (cancelled) return;
        setResponsablesOptions([]);
        setCatalog([]);
        setRefsError(
          "No se pudieron cargar responsables o el catálogo de subtareas. Revisá permisos e intentá de nuevo."
        );
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, profile?.tenantId, profile?.company]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const toggleResponsable = useCallback((person) => {
    setErrors((prev) => ({ ...prev, responsables: undefined }));
    setResponsables((prev) => {
      const exists = prev.some((r) => r.uid === person.uid);
      if (exists) return prev.filter((r) => r.uid !== person.uid);
      return [...prev, { uid: person.uid, displayName: person.displayName }];
    });
  }, []);

  const addSubtarea = useCallback((rawTitle) => {
    const title = normalizeSubtaskTitle(rawTitle);
    if (!title) return false;
    setErrors((prev) => ({ ...prev, subtareas: undefined }));
    let added = false;
    setSubtareas((prev) => {
      const dup = prev.some((s) => s.title.toLowerCase() === title.toLowerCase());
      if (dup) return prev;
      added = true;
      return [...prev, { title }];
    });
    return added;
  }, []);

  const removeSubtarea = useCallback((title) => {
    setSubtareas((prev) => prev.filter((s) => s.title !== title));
  }, []);

  const handleAddTypedSubtarea = () => {
    const title = normalizeSubtaskTitle(subtaskSearch);
    if (!title) {
      toast.warning("Escribí el nombre de la subtarea.");
      return;
    }
    if (!addSubtarea(title)) {
      toast.warning("Esa subtarea ya está en la lista.");
      return;
    }
    setSubtaskSearch("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const draft = { ...form, responsables, subtareas };
    const nextErrors = validateScheduledOtDraft(draft);

    // Campos que exigen las reglas de Firestore para cualquier OT.
    if (!String(form.activoReferencia).trim()) {
      nextErrors.activoReferencia = "Ingresá el activo de referencia.";
    }
    if (!String(form.departamento).trim()) {
      nextErrors.departamento = "Seleccioná un departamento.";
    }
    if (!String(form.lugarProblema).trim()) {
      nextErrors.lugarProblema = "Seleccioná el lugar.";
    }
    if (!String(form.tipoProblema).trim()) {
      nextErrors.tipoProblema = "Seleccioná el tipo.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.warning("Revisá los campos marcados.");
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error("No hay usuario autenticado.");
      return;
    }

    const createdByName =
      String(profile?.displayName || "").trim() ||
      auth.currentUser?.displayName ||
      auth.currentUser?.email ||
      "Usuario";

    const uids = responsables.map((r) => r.uid);
    const nombres = responsables.map((r) => r.displayName);

    const payload = {
      solicitanteNombre: createdByName,
      solicitanteFicha: String(profile?.numeroFicha || "").trim(),
      // `fecha` = fecha de solicitud (compatibilidad con el resto del módulo).
      // El deadline del mantenimiento va en `scheduledDate`.
      fecha: today,
      nombreOT: form.nombreOT.trim(),
      activoReferencia: form.activoReferencia.trim(),

      departamento: form.departamento,
      departamentoBase: form.departamento,
      lugarProblema: form.lugarProblema,
      lugarProblemaBase: form.lugarProblema,
      tipoProblema: form.tipoProblema,
      tipoProblemaBase: form.tipoProblema,

      descripcionOT: form.descripcionOT.trim(),
      notas: form.notas.trim(),

      OTState: OT_STATE_SOLICITADA,
      NroSolicitud: `SOL-OT-${Date.now()}`,

      // Marca de mantenimiento programado + deadline.
      scheduledMaintenance: true,
      scheduledDate: form.scheduledDate,
      prioridadOT: form.prioridadOT,

      // Responsables definidos desde el inicio (no se asignan al mover la tarjeta).
      responsableUid: uids[0],
      responsableNombre: nombres.join(", "),
      responsablesUids: uids,
      responsablesNombres: nombres,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      createdByName,
      createdArea: String(profile?.areaTrabajo || "").trim(),

      ...buildScopeFields(profile),
    };

    try {
      setSaving(true);

      // OT + subtareas en un solo batch: atómico, así nunca queda una OT
      // programada sin su lista de subtareas.
      const otRef = doc(collection(db, "solicitudesOT"));
      const batch = writeBatch(db);
      batch.set(otRef, payload);

      for (const subtarea of subtareas) {
        const subRef = doc(collection(db, "solicitudesOT", otRef.id, "subtareas"));
        batch.set(subRef, {
          title: subtarea.title,
          description: "",
          status: SUBTASK_STATUS_PENDIENTE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          createdByName,
        });
      }

      await batch.commit();

      toast.success(
        `Mantenimiento programado creado para el ${form.scheduledDate}.`
      );
      onCreated?.({ id: otRef.id, ...payload, subtareas });
      onClose?.();
    } catch (err) {
      console.error("crear OT programada:", err);
      toast.error(
        "No se pudo crear el mantenimiento programado. Revisá los permisos y las reglas de Firestore."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const responsablesQuery = responsablesSearch.trim().toLowerCase();
  const filteredPeople = responsablesQuery
    ? responsablesOptions.filter(
        (p) =>
          p.displayName.toLowerCase().includes(responsablesQuery) ||
          (p.numeroFicha && p.numeroFicha.toLowerCase().includes(responsablesQuery))
      )
    : responsablesOptions;

  const subtaskQuery = normalizeSubtaskTitle(subtaskSearch).toLowerCase();
  const filteredCatalog = (
    subtaskQuery
      ? catalog.filter((item) =>
          subtaskCatalogItemLabel(item).toLowerCase().includes(subtaskQuery)
        )
      : catalog
  ).filter(
    (item) =>
      !subtareas.some(
        (s) => s.title.toLowerCase() === subtaskCatalogItemLabel(item).toLowerCase()
      )
  );

  const missed = form.scheduledDate ? missedAlertWindows(form.scheduledDate) : [];

  return (
    <Sheet
      open={open}
      onClose={saving ? undefined : onClose}
      title="Nuevo mantenimiento programado"
      placement="center"
      maxWidth={780}
    >
      <Sheet.Body>
        <div style={styles.intro}>
          <span style={styles.introIcon}>
            <CalendarClock size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div style={styles.introTitle}>
              Queda en «Tareas Pendientes» hasta su fecha
            </div>
            <div style={styles.introDesc}>
              Al llegar la fecha programada el sistema la pasa automáticamente a
              «OTs en Proceso» y sigue el flujo normal de órdenes de trabajo.
            </div>
          </div>
        </div>

        {refsError ? <div style={styles.inlineError}>{refsError}</div> : null}

        <form id="new-scheduled-ot-form" onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.grid2}>
            <Field label="Nombre de la OT" required error={errors.nombreOT}>
              <Field.Input
                value={form.nombreOT}
                onChange={(e) => setField("nombreOT", e.target.value)}
                placeholder="Ej. Cambio de filtros HVAC"
                disabled={saving}
              />
            </Field>

            <Field label="Activo de referencia" required error={errors.activoReferencia}>
              <Field.Input
                value={form.activoReferencia}
                onChange={(e) => setField("activoReferencia", e.target.value)}
                placeholder="Ej. Chiller techo piso 2"
                disabled={saving}
              />
            </Field>
          </div>

          <div style={styles.grid2}>
            <Field
              label="Fecha programada (deadline)"
              required
              error={errors.scheduledDate}
              hint={
                form.scheduledDate
                  ? deadlineLabel(form.scheduledDate)
                  : "Desde esta fecha la OT pasa a «En proceso»."
              }
            >
              <Field.Input
                type="date"
                value={form.scheduledDate}
                min={today}
                onChange={(e) => setField("scheduledDate", e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field label="Prioridad">
              <div style={styles.priorityRow}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setField("prioridadOT", p)}
                    disabled={saving}
                    style={{
                      ...styles.priorityBtn,
                      ...(form.prioridadOT === p ? styles.priorityBtnActive : {}),
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {missed.length > 0 ? (
            <div style={styles.warnBox}>
              Con esta fecha no se van a emitir los avisos de{" "}
              {missed.join(" y ")} día(s): esa ventana ya pasó. Se enviarán los
              restantes ({SCHEDULED_ALERT_WINDOWS.filter((w) => !missed.includes(w)).join(", ") || "ninguno"}).
            </div>
          ) : null}

          <div style={styles.grid3}>
            <Field label="Departamento" required error={errors.departamento}>
              <Field.Select
                value={form.departamento}
                onChange={(e) => setField("departamento", e.target.value)}
                disabled={saving}
              >
                <option value="">Seleccioná…</option>
                {OT_DEPARTAMENTOS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Field.Select>
            </Field>

            <Field label="Lugar" required error={errors.lugarProblema}>
              <Field.Select
                value={form.lugarProblema}
                onChange={(e) => setField("lugarProblema", e.target.value)}
                disabled={saving}
              >
                <option value="">Seleccioná…</option>
                {OT_LUGARES_PROBLEMA.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Field.Select>
            </Field>

            <Field label="Tipo" required error={errors.tipoProblema}>
              <Field.Select
                value={form.tipoProblema}
                onChange={(e) => setField("tipoProblema", e.target.value)}
                disabled={saving}
              >
                <option value="">Seleccioná…</option>
                {OT_TIPOS_PROBLEMA.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Field.Select>
            </Field>
          </div>

          <Field label="Descripción" required error={errors.descripcionOT}>
            <Field.Textarea
              value={form.descripcionOT}
              onChange={(e) => setField("descripcionOT", e.target.value)}
              placeholder="Qué hay que hacer y con qué criterio se considera cumplido."
              disabled={saving}
            />
          </Field>

          {/* ── Responsables (obligatorio) ── */}
          <div style={styles.block}>
            <div style={styles.blockHead}>
              <span style={styles.blockTitle}>
                Responsable(s) <span style={styles.req}>*</span>
              </span>
              <span style={styles.blockCount}>
                {responsables.length} seleccionado(s)
              </span>
            </div>

            {responsables.length > 0 ? (
              <div style={styles.chipsRow}>
                {responsables.map((r) => (
                  <button
                    key={r.uid}
                    type="button"
                    onClick={() => toggleResponsable(r)}
                    disabled={saving}
                    style={styles.selectedChip}
                    title="Quitar"
                  >
                    {r.displayName}
                    <X size={13} strokeWidth={2.6} />
                  </button>
                ))}
              </div>
            ) : null}

            <div style={styles.searchWrap}>
              <Search size={16} color={SLATE} />
              <input
                type="search"
                value={responsablesSearch}
                onChange={(e) => setResponsablesSearch(e.target.value)}
                placeholder="Buscar por nombre o ficha…"
                style={styles.searchInput}
                disabled={saving || loadingRefs}
              />
            </div>

            <div style={styles.pickerList}>
              {loadingRefs ? (
                <div style={styles.pickerState}>
                  <Spinner size={20} inline />
                </div>
              ) : filteredPeople.length === 0 ? (
                <div style={styles.pickerState}>
                  No hay personal con permiso de mantenimiento para este criterio.
                </div>
              ) : (
                filteredPeople.map((p) => {
                  const active = responsables.some((r) => r.uid === p.uid);
                  return (
                    <button
                      key={p.uid}
                      type="button"
                      onClick={() => toggleResponsable(p)}
                      disabled={saving}
                      style={{
                        ...styles.pickerItem,
                        ...(active ? styles.pickerItemActive : {}),
                      }}
                    >
                      <span style={styles.pickerItemText}>
                        <span style={styles.pickerItemName}>{p.displayName}</span>
                        <span style={styles.pickerItemMeta}>
                          {p.numeroFicha ? `Ficha ${p.numeroFicha} · ` : ""}
                          {p.role}
                        </span>
                      </span>
                      {active ? (
                        <Check size={17} strokeWidth={2.6} color={ACCENT} />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {errors.responsables ? (
              <div style={styles.fieldError} role="alert">
                {errors.responsables}
              </div>
            ) : null}
          </div>

          {/* ── Subtareas (obligatorio) ── */}
          <div style={styles.block}>
            <div style={styles.blockHead}>
              <span style={styles.blockTitle}>
                Subtareas <span style={styles.req}>*</span>
              </span>
              <span style={styles.blockCount}>{subtareas.length} agregada(s)</span>
            </div>

            {subtareas.length > 0 ? (
              <div style={styles.chipsRow}>
                {subtareas.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => removeSubtarea(s.title)}
                    disabled={saving}
                    style={styles.selectedChip}
                    title="Quitar"
                  >
                    {s.title}
                    <X size={13} strokeWidth={2.6} />
                  </button>
                ))}
              </div>
            ) : null}

            <div style={styles.searchWrap}>
              <Search size={16} color={SLATE} />
              <input
                type="search"
                value={subtaskSearch}
                onChange={(e) => setSubtaskSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTypedSubtarea();
                  }
                }}
                placeholder="Buscar en el catálogo o escribir una nueva…"
                style={styles.searchInput}
                disabled={saving || loadingRefs}
              />
              <button
                type="button"
                onClick={handleAddTypedSubtarea}
                disabled={saving || !normalizeSubtaskTitle(subtaskSearch)}
                style={styles.addBtn}
                title="Agregar la subtarea escrita"
              >
                <Plus size={14} strokeWidth={2.6} />
                Agregar
              </button>
            </div>

            <div style={styles.pickerList}>
              {loadingRefs ? (
                <div style={styles.pickerState}>
                  <Spinner size={20} inline />
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div style={styles.pickerState}>
                  {subtaskQuery
                    ? "Sin coincidencias en el catálogo. Podés agregarla con «Agregar»."
                    : "No quedan subtareas del catálogo por agregar."}
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const label = subtaskCatalogItemLabel(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addSubtarea(label)}
                      disabled={saving}
                      style={styles.pickerItem}
                    >
                      <span style={styles.pickerItemName}>{label}</span>
                      <Plus size={15} strokeWidth={2.6} color={SLATE} />
                    </button>
                  );
                })
              )}
            </div>

            {errors.subtareas ? (
              <div style={styles.fieldError} role="alert">
                {errors.subtareas}
              </div>
            ) : null}
          </div>

          <Field label="Notas (opcional)">
            <Field.Textarea
              value={form.notas}
              onChange={(e) => setField("notas", e.target.value)}
              style={{ minHeight: 70 }}
              disabled={saving}
            />
          </Field>
        </form>
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={onClose} disabled={saving}>
          Cancelar
        </SecondaryButton>
        <PrimaryButton
          type="submit"
          form="new-scheduled-ot-form"
          disabled={saving || loadingRefs}
        >
          {saving ? "Creando…" : "Crear mantenimiento programado"}
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  form: { display: "grid", gap: 14 },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },

  intro: {
    display: "flex",
    gap: 12,
    padding: 12,
    borderRadius: RADIUS,
    background: withAlpha(ACCENT, 0.06),
    border: `1px solid ${withAlpha(ACCENT, 0.24)}`,
  },
  introIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS,
    background: SURFACE,
    border: `1px solid ${withAlpha(ACCENT, 0.3)}`,
    display: "grid",
    placeItems: "center",
    color: ACCENT,
    flexShrink: 0,
  },
  introTitle: { fontSize: 12.5, fontWeight: 950, color: TEXT },
  introDesc: { marginTop: 2, fontSize: 12, fontWeight: 750, color: SLATE, lineHeight: 1.4 },

  inlineError: {
    padding: "10px 12px",
    borderRadius: RADIUS,
    background: "#FEECEC",
    border: "1px solid #F6C7C7",
    color: "#B91C1C",
    fontWeight: 800,
    fontSize: 12,
  },
  warnBox: {
    padding: "10px 12px",
    borderRadius: RADIUS,
    background: "#FFFBEB",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    color: "#92400E",
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.4,
  },

  priorityRow: { display: "flex", gap: 8 },
  priorityBtn: {
    flex: 1,
    padding: "11px 10px",
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
    color: TEXT,
    fontWeight: 900,
    fontSize: 12.5,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  priorityBtnActive: {
    borderColor: ACCENT,
    background: withAlpha(ACCENT, 0.1),
    color: ACCENT,
  },

  block: {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
  },
  blockHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  blockTitle: { fontSize: 12, fontWeight: 950, color: SLATE },
  blockCount: { fontSize: 11, fontWeight: 850, color: MUTED },
  req: { color: "#B91C1C", fontWeight: 950 },

  chipsRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  selectedChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: RADIUS_PILL,
    border: `1px solid ${ACCENT}`,
    background: withAlpha(ACCENT, 0.1),
    color: TEXT,
    fontSize: 12,
    fontWeight: 850,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 800,
    color: TEXT,
    fontFamily: "inherit",
  },
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 10px",
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE_SOFT,
    color: TEXT,
    fontSize: 11.5,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  pickerList: {
    maxHeight: 190,
    overflowY: "auto",
    display: "grid",
    gap: 4,
    padding: 4,
    borderRadius: RADIUS,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
  },
  pickerState: {
    padding: "14px 10px",
    textAlign: "center",
    color: SLATE,
    fontWeight: 800,
    fontSize: 12,
  },
  pickerItem: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 10,
    border: `1px solid transparent`,
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  pickerItemActive: {
    borderColor: ACCENT,
    background: withAlpha(ACCENT, 0.08),
  },
  pickerItemText: { display: "grid", gap: 2, minWidth: 0 },
  pickerItemName: { fontSize: 12.5, fontWeight: 900, color: TEXT },
  pickerItemMeta: { fontSize: 11, fontWeight: 750, color: SLATE },

  fieldError: { color: "#B91C1C", fontWeight: 850, fontSize: 12 },
};
