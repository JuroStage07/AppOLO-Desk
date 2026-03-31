import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../../firebase";

const ACCENT = "#089F8A";

const OT_STATE_SOLICITADA = "Solicitada";

const DEPARTAMENTOS = [
  "Control",
  "Sistema",
  "Personal",
  "Comercio exterior",
  "Ventas",
  "CEDI",
  "Transportes",
  "Otro",
];

const LUGARES_PROBLEMA = [
  "Piso #1",
  "Piso #2",
  "Piso #3",
  "CEDI",
  "Parqueo",
  "Vehículo/Flota",
  "Otro",
];

const TIPOS_PROBLEMA = [
  "Albañeria",
  "Pisos",
  "Techos",
  "Goteras",
  "Canoas",
  "Cielo raso",
  "Instalación eléctrica",
  "Cañerías",
  "Carpintería",
  "Fontanería",
  "Pintura",
  "Soldadura",
  "Tanques sépticos",
  "Aire acondicionado",
  "Remodelaciones",
  "Puertas y portones",
  "Accesos",
  "Racks",
  "Equipos",
  "Rotulaciones",
  "Sistema de incendios",
  "Andenes de carga",
  "Banda transportadora",
  "Ilimunacion",
  "Baños",
  "Control de plagas",
  "Camaras / CCTV",
  "Otro",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const modal = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  header: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    background: "#F3FBF9",
    border: "1px solid rgba(8,159,138,0.30)",
    display: "grid",
    placeItems: "center",
    color: ACCENT,
  },
  title: {
    fontWeight: 980,
    color: "#0F172A",
  },
  sub: {
    marginTop: 2,
    fontWeight: 850,
    color: "#64748B",
    fontSize: 12,
  },
  close: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 36,
    height: 36,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    color: "#0F172A",
  },
  actions: {
    padding: "0 14px 14px 14px",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
  },
  sheetLg: {
    width: "min(860px, 100%)",
    maxHeight: "92vh",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "auto",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
  },

  /** Variante embebida en página: sin tope de altura ni scroll interno */
  sheetPage: {
    width: "100%",
    maxWidth: "100%",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 22,
    overflow: "visible",
    boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
  },
};

const pickerStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 10000,
  },
  sheet: {
    width: "min(520px, 100%)",
    maxHeight: "80vh",
    background: "#fff",
    border: "1px solid #E7E9F2",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
  },
  header: {
    padding: 14,
    borderBottom: "1px solid #EEF1F7",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "#FBFCFF",
  },
  title: {
    fontWeight: 980,
    color: "#0F172A",
  },
  close: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    width: 36,
    height: 36,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "#0F172A",
  },
  searchWrap: {
    padding: 14,
    borderBottom: "1px solid #EEF1F7",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
  },
  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    background: "transparent",
  },
  list: {
    overflowY: "auto",
    padding: 10,
    display: "grid",
    gap: 8,
  },
  item: {
    width: "100%",
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "12px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    textAlign: "left",
  },
  itemActive: {
    border: `1px solid ${ACCENT}`,
    background: "#F3FBF9",
  },
  empty: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
    fontWeight: 800,
  },
};

const formUi = {
  btnGhost: {
    border: "1px solid #E7E9F2",
    background: "#fff",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    color: "#0F172A",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  btnPrimary: {
    borderRadius: 16,
    border: `1px solid ${ACCENT}`,
    background: ACCENT,
    color: "#fff",
    padding: "10px 14px",
    fontWeight: 980,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 18px 32px rgba(8,159,138,0.18)",
    whiteSpace: "nowrap",
  },
  modalForm: {
    padding: 14,
    display: "grid",
    gap: 14,
    background: "#fff",
  },
  modalFormPage: {
    padding: "22px 22px 24px",
    display: "grid",
    gap: 16,
    background: "#fff",
  },
  fieldGroup: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontWeight: 980,
    fontSize: 13,
    color: "#0F172A",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  twoColsPage: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
  },
  selectorBtn: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    minHeight: 46,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#FBFCFF",
    padding: "11px 12px",
    outline: "none",
    fontWeight: 850,
    color: "#0F172A",
    fontSize: 14,
    minHeight: 96,
    resize: "vertical",
  },
};

function SearchSelectModal({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  if (!open) return null;

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const picker = pickerStyles;

  return (
    <div style={picker.backdrop} onClick={onClose}>
      <div style={picker.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={picker.header}>
          <div style={picker.title}>{title}</div>
          <button type="button" style={picker.close} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={picker.searchWrap}>
          <Search size={16} color="#64748B" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={picker.searchInput}
          />
        </div>

        <div style={picker.list}>
          {filtered.length === 0 ? (
            <div style={picker.empty}>No hay resultados.</div>
          ) : (
            filtered.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  style={{
                    ...picker.item,
                    ...(active ? picker.itemActive : {}),
                  }}
                  onClick={() => {
                    onSelect(opt);
                    onClose();
                  }}
                >
                  <span>{opt}</span>
                  <ChevronRight size={16} />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  solicitanteNombre: "",
  solicitanteFicha: "",
  fecha: todayISO(),
  nombreOT: "",
  activoReferencia: "",
  departamento: "",
  departamentoOtro: "",
  lugarProblema: "",
  lugarProblemaOtro: "",
  tipoProblema: "",
  tipoProblemaOtro: "",
  descripcionOT: "",
  notas: "",
});

const emptyPicker = () => ({
  departamento: false,
  lugarProblema: false,
  tipoProblema: false,
});

/**
 * @param {"modal"|"page"} variant — `page` embeds the form without a fullscreen backdrop (e.g. Servicios generales).
 * @param {boolean} [suppressSuccessAlert] — si es true, no se muestra `alert` tras crear (p. ej. el padre muestra su propio modal).
 */
export function NewOTModal({
  open,
  onClose,
  onCreate,
  variant = "modal",
  suppressSuccessAlert = false,
}) {
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(emptyPicker());

  const [form, setForm] = useState(emptyForm);

  const isActive = variant === "page" || open;

  useEffect(() => {
    if (!isActive) return;

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const profileRef = doc(db, "profiles", uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data();
          setForm((prev) => ({
            ...prev,
            solicitanteNombre: data?.displayName || "",
            solicitanteFicha: data?.numeroFicha || "",
          }));
        } else {
          setForm((prev) => ({
            ...prev,
            solicitanteNombre:
              auth.currentUser?.displayName ||
              auth.currentUser?.email ||
              "",
            solicitanteFicha: "",
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [isActive]);

  useEffect(() => {
    if (variant === "page") return;
    if (!open) {
      setForm(emptyForm());
      setPickerOpen(emptyPicker());
    }
  }, [open, variant]);

  if (variant !== "page" && !open) return null;

  const ui = formUi;

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const departamentoFinal =
    form.departamento === "Otro"
      ? form.departamentoOtro.trim()
      : form.departamento;

  const lugarProblemaFinal =
    form.lugarProblema === "Otro"
      ? form.lugarProblemaOtro.trim()
      : form.lugarProblema;

  const tipoProblemaFinal =
    form.tipoProblema === "Otro"
      ? form.tipoProblemaOtro.trim()
      : form.tipoProblema;

  const canSave =
    !saving &&
    !loadingProfile &&
    form.fecha.trim() &&
    form.nombreOT.trim() &&
    form.activoReferencia.trim() &&
    form.departamento.trim() &&
    departamentoFinal &&
    form.lugarProblema.trim() &&
    lugarProblemaFinal &&
    form.tipoProblema.trim() &&
    tipoProblemaFinal &&
    form.descripcionOT.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;

    try {
      setSaving(true);

      const now = Date.now();
      const NroSolicitud = `SOL-OT-${now}`;

      const payload = {
        solicitanteNombre: form.solicitanteNombre?.trim() || "",
        solicitanteFicha: form.solicitanteFicha?.trim() || "",
        fecha: form.fecha,
        nombreOT: form.nombreOT.trim(),
        activoReferencia: form.activoReferencia.trim(),

        departamento: departamentoFinal,
        departamentoBase: form.departamento,
        departamentoOtro:
          form.departamento === "Otro" ? form.departamentoOtro.trim() : "",

        lugarProblema: lugarProblemaFinal,
        lugarProblemaBase: form.lugarProblema,
        lugarProblemaOtro:
          form.lugarProblema === "Otro" ? form.lugarProblemaOtro.trim() : "",

        tipoProblema: tipoProblemaFinal,
        tipoProblemaBase: form.tipoProblema,
        tipoProblemaOtro:
          form.tipoProblema === "Otro" ? form.tipoProblemaOtro.trim() : "",

        descripcionOT: form.descripcionOT.trim(),
        notas: form.notas.trim(),

        OTState: OT_STATE_SOLICITADA,
        NroSolicitud,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
        createdByName:
          auth.currentUser?.displayName ||
          auth.currentUser?.email ||
          "Usuario",
      };

      const docRef = await addDoc(collection(db, "solicitudesOT"), payload);

      const createdItem = {
        id: docRef.id,
        type: "pending",
        checked: false,
        priority: "SOLICITADA",
        priorityTone: "solicitada",
        subtaskCount: 0,
        subtaskCompletedCount: 0,
        taskTitle: form.nombreOT.trim(),
        asset: form.activoReferencia.trim(),
        duration: tipoProblemaFinal,
        schedule: departamentoFinal,
        date: form.fecha,

        nroSolicitud: NroSolicitud,
        solicitanteNombre: form.solicitanteNombre?.trim() || "",
        solicitanteFicha: form.solicitanteFicha?.trim() || "",
        lugarProblema: lugarProblemaFinal,
        tipoProblema: tipoProblemaFinal,
        descripcionOT: form.descripcionOT.trim(),
        estadoOT: OT_STATE_SOLICITADA,
        notas: form.notas.trim(),
        responsableNombre: "",
      };

      onCreate?.(createdItem);

      if (!suppressSuccessAlert) {
        alert("✅ Solicitud OT creada correctamente.");
      }

      if (variant === "modal") {
        onClose();
      } else if (!onCreate) {
        onClose();
      }
    } catch (err) {
      console.error(err);
      alert("❌ Error creando la solicitud OT");
    } finally {
      setSaving(false);
    }
  };

  const isPage = variant === "page";

  const sheet = (
    <div
      style={isPage ? modal.sheetPage : modal.sheetLg}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {!isPage ? (
        <div style={modal.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={modal.icon}>
              <Plus size={18} />
            </div>

            <div>
              <div style={modal.title}>Nueva OT</div>
              <div style={modal.sub}>
                Creá una nueva solicitud de orden de trabajo
              </div>
            </div>
          </div>

          <button type="button" style={modal.close} onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>
      ) : (
        <div
          style={{
            height: 4,
            width: "100%",
            background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.2) 55%, rgba(8,159,138,0) 100%)`,
            borderRadius: "22px 22px 0 0",
          }}
          aria-hidden
        />
      )}

      <form
        onSubmit={handleSubmit}
        style={isPage ? ui.modalFormPage : ui.modalForm}
      >
        <div style={isPage ? ui.twoColsPage : ui.twoCols}>
          <div style={ui.fieldGroup}>
            <div style={ui.label}>Nombre del solicitante</div>
            <input
              value={form.solicitanteNombre}
              style={ui.input}
              readOnly
              placeholder="Cargando..."
            />
          </div>

          <div style={ui.fieldGroup}>
            <div style={ui.label}>Ficha del solicitante</div>
            <input
              value={form.solicitanteFicha}
              style={ui.input}
              readOnly
              placeholder="Cargando..."
            />
          </div>
        </div>

        <div style={isPage ? ui.twoColsPage : ui.twoCols}>
          <div style={ui.fieldGroup}>
            <div style={ui.label}>Fecha</div>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setField("fecha", e.target.value)}
              style={ui.input}
              disabled={saving}
            />
          </div>

          <div style={ui.fieldGroup}>
            <div style={ui.label}>Nombre de OT</div>
            <input
              value={form.nombreOT}
              onChange={(e) => setField("nombreOT", e.target.value)}
              style={ui.input}
              placeholder="Ej: Reparación de portón principal"
              disabled={saving}
            />
          </div>
        </div>

        <div style={ui.fieldGroup}>
          <div style={ui.label}>Activo referencia</div>
          <input
            value={form.activoReferencia}
            onChange={(e) => setField("activoReferencia", e.target.value)}
            style={ui.input}
            placeholder="Ej: PORTÓN-01 / VEH-12 / RACK-03"
            disabled={saving}
          />
        </div>

        <div style={isPage ? ui.twoColsPage : ui.twoCols}>
          <div style={ui.fieldGroup}>
            <div style={ui.label}>Departamento</div>
            <button
              type="button"
              style={ui.selectorBtn}
              onClick={() =>
                setPickerOpen((prev) => ({ ...prev, departamento: true }))
              }
              disabled={saving}
            >
              <span>
                {form.departamento || "Seleccionar departamento"}
              </span>
              <ChevronRight size={16} />
            </button>

            {form.departamento === "Otro" && (
              <input
                value={form.departamentoOtro}
                onChange={(e) =>
                  setField("departamentoOtro", e.target.value)
                }
                style={ui.input}
                placeholder="Especifique departamento"
                disabled={saving}
              />
            )}
          </div>

          <div style={ui.fieldGroup}>
            <div style={ui.label}>Lugar del problema</div>
            <button
              type="button"
              style={ui.selectorBtn}
              onClick={() =>
                setPickerOpen((prev) => ({ ...prev, lugarProblema: true }))
              }
              disabled={saving}
            >
              <span>
                {form.lugarProblema || "Seleccionar lugar"}
              </span>
              <ChevronRight size={16} />
            </button>

            {form.lugarProblema === "Otro" && (
              <input
                value={form.lugarProblemaOtro}
                onChange={(e) =>
                  setField("lugarProblemaOtro", e.target.value)
                }
                style={ui.input}
                placeholder="Especifique lugar"
                disabled={saving}
              />
            )}
          </div>
        </div>

        <div style={ui.fieldGroup}>
          <div style={ui.label}>Tipo de problema</div>
          <button
            type="button"
            style={ui.selectorBtn}
            onClick={() =>
              setPickerOpen((prev) => ({ ...prev, tipoProblema: true }))
            }
            disabled={saving}
          >
            <span>
              {form.tipoProblema || "Seleccionar tipo de problema"}
            </span>
            <ChevronRight size={16} />
          </button>

          {form.tipoProblema === "Otro" && (
            <input
              value={form.tipoProblemaOtro}
              onChange={(e) => setField("tipoProblemaOtro", e.target.value)}
              style={ui.input}
              placeholder="Especifique tipo de problema"
              disabled={saving}
            />
          )}
        </div>

        <div style={ui.fieldGroup}>
          <div style={ui.label}>Descripción de OT</div>
          <textarea
            value={form.descripcionOT}
            onChange={(e) => setField("descripcionOT", e.target.value)}
            style={ui.textarea}
            placeholder="Describa el problema o trabajo requerido"
            disabled={saving}
          />
        </div>

        <div style={ui.fieldGroup}>
          <div style={ui.label}>Notas</div>
          <textarea
            value={form.notas}
            onChange={(e) => setField("notas", e.target.value)}
            style={ui.textarea}
            placeholder="Notas adicionales"
            disabled={saving}
          />
        </div>

        <div style={modal.actions}>
          <button
            type="button"
            onClick={onClose}
            style={ui.btnGhost}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            type="submit"
            style={ui.btnPrimary}
            disabled={!canSave}
          >
            <Plus size={16} />
            {saving ? "Guardando..." : "Crear solicitud"}
          </button>
        </div>
      </form>
    </div>
  );

  const pickers = (
    <>
      <SearchSelectModal
        open={pickerOpen.departamento}
        title="Seleccionar departamento"
        options={DEPARTAMENTOS}
        value={form.departamento}
        onSelect={(value) => {
          setField("departamento", value);
          if (value !== "Otro") setField("departamentoOtro", "");
        }}
        onClose={() =>
          setPickerOpen((prev) => ({ ...prev, departamento: false }))
        }
      />

      <SearchSelectModal
        open={pickerOpen.lugarProblema}
        title="Seleccionar lugar del problema"
        options={LUGARES_PROBLEMA}
        value={form.lugarProblema}
        onSelect={(value) => {
          setField("lugarProblema", value);
          if (value !== "Otro") setField("lugarProblemaOtro", "");
        }}
        onClose={() =>
          setPickerOpen((prev) => ({ ...prev, lugarProblema: false }))
        }
      />

      <SearchSelectModal
        open={pickerOpen.tipoProblema}
        title="Seleccionar tipo de problema"
        options={TIPOS_PROBLEMA}
        value={form.tipoProblema}
        onSelect={(value) => {
          setField("tipoProblema", value);
          if (value !== "Otro") setField("tipoProblemaOtro", "");
        }}
        onClose={() =>
          setPickerOpen((prev) => ({ ...prev, tipoProblema: false }))
        }
      />
    </>
  );

  if (variant === "page") {
    return (
      <>
        <div style={{ width: "100%", minWidth: 0 }}>{sheet}</div>
        {pickers}
      </>
    );
  }

  return (
    <>
      <div style={modal.backdrop} onClick={onClose}>
        {sheet}
      </div>
      {pickers}
    </>
  );
}
