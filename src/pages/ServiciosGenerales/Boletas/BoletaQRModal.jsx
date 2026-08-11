import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Sheet, SecondaryButton, Spinner, theme } from "../../../components/ui";

/**
 * Modal con el QR de la boleta. El contenido del QR es el número formateado
 * (ej. "BS-000017"), útil para escaneo/validación posterior.
 */
export default function BoletaQRModal({ open, onClose, boleta }) {
  // Guardamos {numero, url} para renderizar el QR solo cuando corresponde al
  // número actual (evita setState síncrono dentro del efecto).
  const [entry, setEntry] = useState({ numero: "", url: "" });
  const numero = boleta?.numero_formateado || "";

  useEffect(() => {
    let alive = true;
    if (!open || !numero) return undefined;
    QRCode.toDataURL(numero, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (alive) setEntry({ numero, url });
      })
      .catch(() => {
        if (alive) setEntry({ numero, url: "" });
      });
    return () => {
      alive = false;
    };
  }, [open, numero]);

  const dataUrl = entry.numero === numero ? entry.url : "";

  return (
    <Sheet open={open} onClose={onClose} title={`Boleta ${numero}`} placement="center" maxWidth={420}>
      <Sheet.Body>
        <div style={styles.center}>
          {dataUrl ? (
            <img src={dataUrl} alt={`QR ${numero}`} style={styles.qr} />
          ) : (
            <Spinner />
          )}
          <div style={styles.numero}>{numero}</div>
          <div style={styles.hint}>Escaneá este código para identificar la boleta.</div>
        </div>
      </Sheet.Body>
      <Sheet.Actions style={{ gridTemplateColumns: "1fr" }}>
        <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}

const styles = {
  center: { display: "grid", justifyItems: "center", gap: 12, padding: 8 },
  qr: {
    width: 260,
    height: 260,
    borderRadius: theme.RADIUS_MD,
    border: `1px solid ${theme.BORDER}`,
    background: "#fff",
  },
  numero: { fontWeight: 950, fontSize: theme.FS_XL, color: theme.TEXT, letterSpacing: 1 },
  hint: { color: theme.SLATE, fontWeight: 800, fontSize: theme.FS_SM, textAlign: "center" },
};
