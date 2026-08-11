import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import {
  Sheet,
  PrimaryButton,
  SecondaryButton,
  useToast,
  theme,
} from "../../../components/ui";
import { CHECKLIST_ITEMS } from "../../../services/despachoDev/constants";
import { subirFirma, validarBoleta } from "../../../services/despachoDev/boletasDev";
import SignaturePad from "./SignaturePad";

/**
 * Validación de una boleta: checklist (todas "sí") + firma obligatoria.
 * Al confirmar sube la firma al bucket y llama a dd_validar_boleta.
 */
export default function ValidarBoletaSheet({ open, onClose, boleta, scope, validatedBy, onDone }) {
  const toast = useToast();
  const [respuestas, setRespuestas] = useState({});
  const [firmaBlob, setFirmaBlob] = useState(null);
  const [saving, setSaving] = useState(false);

  const todasSi = useMemo(
    () => CHECKLIST_ITEMS.every((item) => respuestas[item.key] === "si"),
    [respuestas]
  );
  const puedeValidar = todasSi && Boolean(firmaBlob);

  const setRespuesta = (key, value) =>
    setRespuestas((r) => ({ ...r, [key]: value }));

  const handleClose = () => {
    if (saving) return;
    setRespuestas({});
    setFirmaBlob(null);
    onClose?.();
  };

  async function handleValidar() {
    if (!puedeValidar) {
      toast.info("Marcá todo el checklist en «Sí» y capturá la firma.");
      return;
    }
    setSaving(true);
    try {
      const firmaPath = await subirFirma(scope, boleta.id, firmaBlob);
      const checklist = CHECKLIST_ITEMS.reduce((acc, item) => {
        acc[item.key] = respuestas[item.key];
        return acc;
      }, {});
      await validarBoleta(scope, validatedBy, {
        boletaId: boleta.id,
        checklist,
        firmaPath,
      });
      toast.success(`Boleta ${boleta.numero_formateado} validada.`);
      setRespuestas({});
      setFirmaBlob(null);
      onDone?.();
    } catch (e) {
      toast.error(e?.message || "No se pudo validar la boleta.");
    } finally {
      setSaving(false);
    }
  }

  if (!boleta) return null;

  return (
    <Sheet open={open} onClose={handleClose} title={`Validar ${boleta.numero_formateado}`} maxWidth={620}>
      <Sheet.Body>
        <div style={styles.sectionTitle}>Checklist de salida</div>
        <div style={styles.list}>
          {CHECKLIST_ITEMS.map((item) => {
            const val = respuestas[item.key];
            return (
              <div key={item.key} style={styles.item}>
                <span style={styles.itemLabel}>{item.label}</span>
                <div style={styles.choices}>
                  <button
                    type="button"
                    onClick={() => setRespuesta(item.key, "si")}
                    style={{
                      ...styles.choice,
                      ...(val === "si" ? styles.choiceSi : {}),
                    }}
                  >
                    <Check size={14} strokeWidth={2.6} /> Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setRespuesta(item.key, "no")}
                    style={{
                      ...styles.choice,
                      ...(val === "no" ? styles.choiceNo : {}),
                    }}
                  >
                    <X size={14} strokeWidth={2.6} /> No
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.sectionTitle}>Firma del responsable</div>
        <SignaturePad onChange={setFirmaBlob} disabled={saving} />

        {!todasSi ? (
          <div style={styles.warn}>
            Todas las respuestas deben ser «Sí» para poder validar.
          </div>
        ) : null}
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={handleClose} disabled={saving}>
          Cancelar
        </SecondaryButton>
        <PrimaryButton onClick={handleValidar} loading={saving} disabled={!puedeValidar}>
          Validar y despachar
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  sectionTitle: {
    color: theme.TEXT,
    fontWeight: 950,
    fontSize: theme.FS_SM,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  list: { display: "grid", gap: 8 },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: theme.RADIUS_MD,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
  },
  itemLabel: { color: theme.TEXT, fontWeight: 800, fontSize: theme.FS_SM, flex: 1 },
  choices: { display: "flex", gap: 6, flexShrink: 0 },
  choice: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE,
    color: theme.SLATE,
    fontWeight: 900,
    fontSize: theme.FS_SM,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  choiceSi: {
    background: theme.OK_BG,
    borderColor: theme.OK_BORDER,
    color: "#1B7A3A",
  },
  choiceNo: {
    background: theme.DANGER_BG,
    borderColor: theme.DANGER_BORDER,
    color: theme.DANGER,
  },
  warn: {
    color: "#8C5A00",
    background: theme.WARN_BG,
    border: `1px solid ${theme.WARN_BORDER}`,
    borderRadius: theme.RADIUS_MD,
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: theme.FS_SM,
  },
};
