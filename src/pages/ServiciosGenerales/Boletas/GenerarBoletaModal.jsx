import React, { useMemo, useState } from "react";
import { Search, Upload, UserRound } from "lucide-react";
import {
  Sheet,
  Field,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  useToast,
  theme,
} from "../../../components/ui";
import {
  TIPOS_VEHICULO,
  requiereContenedor,
} from "../../../services/despachoDev/constants";
import {
  buscarChoferPorCedula,
  upsertChoferPorCedula,
  subirFotoCedula,
} from "../../../services/despachoDev/choferesDev";
import { generarBoletaManual, obtenerBoleta } from "../../../services/despachoDev/boletasDev";

const EMPTY = {
  choferId: null,
  cedula: "",
  nombre: "",
  compania: "",
  celular: "",
  cedulaFotoPath: null,
  tipoVehiculo: "camion",
  placaCamion: "",
  placaContenedor: "",
  cargado: true,
  destino: "",
  marchamo: "",
};

/**
 * Formulario de generación de boleta manual. Flujo:
 *  1) chofer primero (buscar por cédula → autocompletar; upsert al guardar),
 *  2) subir foto de cédula (opcional) al bucket privado,
 *  3) generar boleta vía RPC (queda en pendiente_validacion).
 */
export default function GenerarBoletaModal({ open, onClose, scope, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [fotoFile, setFotoFile] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const necesitaContenedor = requiereContenedor(form.tipoVehiculo);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const resetAll = () => {
    setForm(EMPTY);
    setFotoFile(null);
    setErrors({});
  };

  const handleClose = () => {
    if (saving) return;
    resetAll();
    onClose?.();
  };

  async function handleBuscarChofer() {
    const cedula = form.cedula.trim();
    if (!cedula) {
      toast.info("Ingresá una cédula para buscar.");
      return;
    }
    setBuscando(true);
    try {
      const chofer = await buscarChoferPorCedula(cedula);
      if (!chofer) {
        toast.info("Chofer no encontrado. Se creará uno nuevo al generar la boleta.");
        set("choferId", null);
        return;
      }
      setForm((f) => ({
        ...f,
        choferId: chofer.id,
        nombre: chofer.nombre || "",
        compania: chofer.compania || "",
        celular: chofer.celular || "",
        cedulaFotoPath: chofer.cedula_foto_path || null,
        tipoVehiculo: chofer.tipo_vehiculo || f.tipoVehiculo,
        // El chofer guarda `placa_camion`; el contenedor es dato de la boleta.
        placaCamion: chofer.placa_camion || f.placaCamion,
      }));
      toast.success(`Chofer ${chofer.nombre} cargado.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo buscar el chofer.");
    } finally {
      setBuscando(false);
    }
  }

  function validate() {
    const next = {};
    if (!form.cedula.trim()) next.cedula = "La cédula es obligatoria.";
    if (!form.nombre.trim()) next.nombre = "El nombre es obligatorio.";
    if (!form.placaCamion.trim()) next.placaCamion = "La placa del camión es obligatoria.";
    if (necesitaContenedor && !form.placaContenedor.trim())
      next.placaContenedor = "El furgón exige placa de contenedor.";
    if (form.cargado && !form.destino.trim())
      next.destino = "El destino es obligatorio si va cargado.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    try {
      // 1) Foto de cédula (si se seleccionó una nueva).
      let cedulaFotoPath = form.cedulaFotoPath;
      if (fotoFile) {
        cedulaFotoPath = await subirFotoCedula(scope, fotoFile, form.cedula);
      }

      // 2) Chofer (crear o actualizar por cédula).
      const chofer = await upsertChoferPorCedula(scope, {
        cedula: form.cedula,
        nombre: form.nombre,
        compania: form.compania,
        celular: form.celular,
        tipoVehiculo: form.tipoVehiculo,
        placaCamion: form.placaCamion,
        placaContenedor: necesitaContenedor ? form.placaContenedor : "",
        cedulaFotoPath,
      });

      // 3) Boleta (la RPC devuelve el boletaId; el scope/autor los toma del JWT).
      const boletaId = await generarBoletaManual({
        choferId: chofer?.id || form.choferId || null,
        choferNombre: form.nombre,
        choferCedula: form.cedula,
        compania: form.compania,
        cedulaFotoPath,
        tipoVehiculo: form.tipoVehiculo,
        placaCamion: form.placaCamion,
        placaContenedor: necesitaContenedor ? form.placaContenedor : "",
        marchamo: form.cargado ? form.marchamo : "",
        cargado: form.cargado,
        destino: form.cargado ? form.destino : "",
      });

      // Traemos la boleta creada para mostrar número/QR.
      const boleta = await obtenerBoleta(boletaId).catch(() => null);
      toast.success(`Boleta ${boleta?.numero_formateado || ""} generada.`);
      resetAll();
      onCreated?.(boleta || { id: boletaId });
    } catch (e) {
      toast.error(e?.message || "No se pudo generar la boleta.");
    } finally {
      setSaving(false);
    }
  }

  const fotoLabel = useMemo(() => {
    if (fotoFile) return fotoFile.name;
    if (form.cedulaFotoPath) return "Foto de cédula registrada";
    return "Adjuntar foto de cédula (opcional)";
  }, [fotoFile, form.cedulaFotoPath]);

  return (
    <Sheet open={open} onClose={handleClose} title="Generar boleta de salida" maxWidth={640}>
      <Sheet.Body>
        {/* Chofer */}
        <div style={styles.sectionTitle}>
          <UserRound size={16} strokeWidth={2.4} /> Chofer
        </div>

        <div style={styles.row2}>
          <Field label="Cédula" required error={errors.cedula}>
            <div style={styles.inlineSearch}>
              <Field.Input
                value={form.cedula}
                onChange={(e) => set("cedula", e.target.value)}
                placeholder="Ej. 1-2345-6789"
                inputMode="numeric"
              />
              <SecondaryButton
                size="sm"
                icon={Search}
                loading={buscando}
                onClick={handleBuscarChofer}
              >
                Buscar
              </SecondaryButton>
            </div>
          </Field>
          <Field label="Nombre" required error={errors.nombre}>
            <Field.Input
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Nombre completo"
            />
          </Field>
        </div>

        <div style={styles.row2}>
          <Field label="Compañía">
            <Field.Input
              value={form.compania}
              onChange={(e) => set("compania", e.target.value)}
              placeholder="Transportista"
            />
          </Field>
          <Field label="Celular">
            <Field.Input
              value={form.celular}
              onChange={(e) => set("celular", e.target.value)}
              placeholder="Opcional"
              inputMode="tel"
            />
          </Field>
        </div>

        <Field label="Foto de cédula">
          <label style={styles.fileBtn}>
            <Upload size={15} strokeWidth={2.4} />
            <span style={styles.fileLabel}>{fotoLabel}</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
            />
          </label>
        </Field>

        {/* Vehículo */}
        <div style={styles.sectionTitle}>Vehículo</div>
        <div style={styles.row2}>
          <Field label="Tipo de vehículo" required>
            <Field.Select
              value={form.tipoVehiculo}
              onChange={(e) => set("tipoVehiculo", e.target.value)}
            >
              {TIPOS_VEHICULO.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Field.Select>
          </Field>
          <Field label="Placa del camión" required error={errors.placaCamion}>
            <Field.Input
              value={form.placaCamion}
              onChange={(e) => set("placaCamion", e.target.value)}
              placeholder="Ej. C 123456"
            />
          </Field>
        </div>

        {necesitaContenedor ? (
          <Field label="Placa de contenedor" required error={errors.placaContenedor}>
            <Field.Input
              value={form.placaContenedor}
              onChange={(e) => set("placaContenedor", e.target.value)}
              placeholder="Solo para furgón"
            />
          </Field>
        ) : null}

        {/* Carga */}
        <div style={styles.sectionTitle}>Carga</div>
        <div style={styles.toggleRow}>
          <label style={styles.check}>
            <input
              type="checkbox"
              checked={form.cargado}
              onChange={(e) => set("cargado", e.target.checked)}
            />
            <span>Vehículo cargado</span>
          </label>
          <StatusPill tone={form.cargado ? "accent" : "neutral"} icon={null}>
            {form.cargado ? "Con carga" : "Sin carga"}
          </StatusPill>
        </div>

        {form.cargado ? (
          <div style={styles.row2}>
            <Field label="Destino" required error={errors.destino}>
              <Field.Input
                value={form.destino}
                onChange={(e) => set("destino", e.target.value)}
                placeholder="Destino de la carga"
              />
            </Field>
            <Field label="Marchamo" hint="Dejar vacío usa N/A.">
              <Field.Input
                value={form.marchamo}
                onChange={(e) => set("marchamo", e.target.value)}
                placeholder="N/A"
              />
            </Field>
          </div>
        ) : null}
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={handleClose} disabled={saving}>
          Cancelar
        </SecondaryButton>
        <PrimaryButton onClick={handleSubmit} loading={saving}>
          Generar boleta
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: theme.TEXT,
    fontWeight: 950,
    fontSize: theme.FS_SM,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
    paddingTop: 8,
    borderTop: `1px solid ${theme.BORDER_SOFT}`,
  },
  row2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  inlineSearch: { display: "flex", gap: 8, alignItems: "stretch" },
  fileBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 12px",
    borderRadius: 14,
    border: `1px dashed ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
    cursor: "pointer",
    color: theme.SLATE,
    fontWeight: 800,
    fontSize: theme.FS_SM,
  },
  fileLabel: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  check: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    color: theme.TEXT,
    fontSize: theme.FS_BASE,
    cursor: "pointer",
  },
};
