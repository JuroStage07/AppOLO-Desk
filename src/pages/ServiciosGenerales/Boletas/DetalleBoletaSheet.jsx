import React, { useEffect, useState } from "react";
import { QrCode, ShieldCheck, XOctagon, Image as ImageIcon } from "lucide-react";
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
  ESTADOS_BOLETA,
  ESTADO_BOLETA_LABELS,
  ESTADO_BOLETA_TONE,
  TIPO_VEHICULO_LABELS,
  MOTIVO_RECHAZO_MIN,
} from "../../../services/despachoDev/constants";
import { rechazarBoleta, getSignedUrl } from "../../../services/despachoDev/boletasDev";

function Dato({ label, value }) {
  return (
    <div style={styles.dato}>
      <span style={styles.datoLabel}>{label}</span>
      <span style={styles.datoValue}>{value || "—"}</span>
    </div>
  );
}

/**
 * Detalle de una boleta. Muestra el snapshot y, según el estado, permite
 * validar (checklist+firma), rechazar (motivo) o ver el QR. La firma y la foto
 * de cédula se leen con signed URLs del bucket privado.
 */
export default function DetalleBoletaSheet({
  open,
  onClose,
  boleta,
  puedeValidar = false,
  onValidar,
  onQR,
  onChanged,
}) {
  const toast = useToast();
  const [motivoOpen, setMotivoOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [firmaUrl, setFirmaUrl] = useState("");
  const [cedulaUrl, setCedulaUrl] = useState("");

  const snapshot = boleta?.snapshot || {};
  const chofer = snapshot.chofer || {};
  const despacho = snapshot.despacho || {};
  const manual = snapshot.manual || {};
  const esPendiente = boleta?.estado === ESTADOS_BOLETA.PENDIENTE;

  useEffect(() => {
    let alive = true;
    setFirmaUrl("");
    setCedulaUrl("");
    setMotivoOpen(false);
    setMotivo("");
    if (!open || !boleta) return undefined;

    (async () => {
      try {
        if (boleta.firma_path) {
          const u = await getSignedUrl(boleta.firma_path);
          if (alive) setFirmaUrl(u || "");
        }
        const cedulaPath = chofer.cedulaFotoPath;
        if (cedulaPath) {
          const u = await getSignedUrl(cedulaPath);
          if (alive) setCedulaUrl(u || "");
        }
      } catch {
        /* signed url no crítica */
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boleta?.id]);

  async function handleRechazar() {
    if (motivo.trim().length < MOTIVO_RECHAZO_MIN) {
      toast.info(`El motivo debe tener al menos ${MOTIVO_RECHAZO_MIN} caracteres.`);
      return;
    }
    setSaving(true);
    try {
      await rechazarBoleta({ boletaId: boleta.id, motivo });
      toast.success(`Boleta ${boleta.numero_formateado} rechazada.`);
      setMotivo("");
      setMotivoOpen(false);
      onChanged?.();
    } catch (e) {
      toast.error(e?.message || "No se pudo rechazar la boleta.");
    } finally {
      setSaving(false);
    }
  }

  if (!boleta) return null;

  const tipoLabel = TIPO_VEHICULO_LABELS[boleta.tipo_vehiculo] || boleta.tipo_vehiculo || "—";
  const fecha = boleta.created_at
    ? new Date(boleta.created_at).toLocaleString("es-CR")
    : "—";

  return (
    <Sheet open={open} onClose={onClose} title={`Boleta ${boleta.numero_formateado}`} maxWidth={640}>
      <Sheet.Body>
        <div style={styles.headerRow}>
          <StatusPill tone={ESTADO_BOLETA_TONE[boleta.estado] || "neutral"} icon={null}>
            {ESTADO_BOLETA_LABELS[boleta.estado] || boleta.estado}
          </StatusPill>
          <span style={styles.origen}>
            {boleta.origen === "manual" ? "Manual" : "Desde despacho"} · {fecha}
          </span>
        </div>

        <div style={styles.sectionTitle}>Chofer</div>
        <div style={styles.grid}>
          <Dato label="Nombre" value={boleta.chofer_nombre || chofer.nombre} />
          <Dato label="Cédula" value={boleta.chofer_cedula || chofer.cedula} />
          <Dato label="Compañía" value={chofer.compania || despacho.transportista} />
        </div>

        <div style={styles.sectionTitle}>Vehículo</div>
        <div style={styles.grid}>
          <Dato label="Tipo" value={tipoLabel} />
          <Dato label="Placa camión" value={boleta.placa_camion} />
          {boleta.placa_contenedor ? (
            <Dato label="Placa contenedor" value={boleta.placa_contenedor} />
          ) : null}
        </div>

        <div style={styles.sectionTitle}>Carga</div>
        <div style={styles.grid}>
          <Dato label="Estado carga" value={boleta.cargado ? "Cargado" : "Sin carga"} />
          {boleta.cargado ? <Dato label="Destino" value={boleta.destino || manual.destino} /> : null}
          {boleta.cargado ? <Dato label="Marchamo" value={boleta.marchamo} /> : null}
        </div>

        {(cedulaUrl || firmaUrl) && (
          <>
            <div style={styles.sectionTitle}>Adjuntos</div>
            <div style={styles.adjuntos}>
              {cedulaUrl ? (
                <a href={cedulaUrl} target="_blank" rel="noreferrer" style={styles.adjunto}>
                  <ImageIcon size={14} strokeWidth={2.4} /> Foto de cédula
                </a>
              ) : null}
              {firmaUrl ? (
                <a href={firmaUrl} target="_blank" rel="noreferrer" style={styles.adjunto}>
                  <ImageIcon size={14} strokeWidth={2.4} /> Firma
                </a>
              ) : null}
            </div>
          </>
        )}

        {boleta.estado === ESTADOS_BOLETA.RECHAZADO && boleta.rechazo_motivo ? (
          <div style={styles.motivoBox}>
            <strong>Motivo de rechazo:</strong> {boleta.rechazo_motivo}
          </div>
        ) : null}

        {motivoOpen ? (
          <Field label="Motivo de rechazo" required hint={`Mínimo ${MOTIVO_RECHAZO_MIN} caracteres.`}>
            <Field.Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Detallá el motivo del rechazo…"
            />
          </Field>
        ) : null}
      </Sheet.Body>

      <Sheet.Actions style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <SecondaryButton icon={QrCode} onClick={() => onQR?.(boleta)}>
          Ver QR
        </SecondaryButton>

        {esPendiente && !motivoOpen && puedeValidar ? (
          <PrimaryButton icon={ShieldCheck} onClick={() => onValidar?.(boleta)}>
            Validar
          </PrimaryButton>
        ) : null}

        {esPendiente && !motivoOpen ? (
          <SecondaryButton
            icon={XOctagon}
            onClick={() => setMotivoOpen(true)}
            style={{ color: theme.DANGER }}
          >
            Rechazar
          </SecondaryButton>
        ) : null}

        {esPendiente && motivoOpen ? (
          <>
            <SecondaryButton onClick={() => setMotivoOpen(false)} disabled={saving}>
              Volver
            </SecondaryButton>
            <PrimaryButton
              icon={XOctagon}
              onClick={handleRechazar}
              loading={saving}
              style={{ background: theme.DANGER, borderColor: theme.DANGER }}
            >
              Confirmar rechazo
            </PrimaryButton>
          </>
        ) : null}

        {!esPendiente ? (
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        ) : null}
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  origen: { color: theme.SLATE, fontWeight: 800, fontSize: theme.FS_SM },
  sectionTitle: {
    color: theme.TEXT,
    fontWeight: 950,
    fontSize: theme.FS_SM,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
    paddingTop: 8,
    borderTop: `1px solid ${theme.BORDER_SOFT}`,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
  adjuntos: { display: "flex", gap: 10, flexWrap: "wrap" },
  adjunto: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    color: theme.ACCENT,
    fontWeight: 900,
    fontSize: theme.FS_SM,
    textDecoration: "none",
  },
  motivoBox: {
    color: theme.DANGER,
    background: theme.DANGER_BG,
    border: `1px solid ${theme.DANGER_BORDER}`,
    borderRadius: theme.RADIUS_MD,
    padding: "8px 12px",
    fontWeight: 700,
    fontSize: theme.FS_SM,
  },
};
