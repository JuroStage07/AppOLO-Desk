import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { SecondaryButton, theme } from "../../../components/ui";

/**
 * Pad de firma sobre <canvas>. Captura trazos con Pointer Events y expone la
 * firma como PNG (Blob) vía la prop `onChange(blob | null)`.
 *
 * Se auto-dimensiona al ancho del contenedor y respeta devicePixelRatio para
 * trazos nítidos. `disabled` bloquea el dibujo (p. ej. mientras se guarda).
 */
export default function SignaturePad({ height = 200, disabled = false, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [hasInk, setHasInk] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#0F172A";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  }, [height]);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvas]);

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) {
      onChange?.(null);
      return;
    }
    canvas.toBlob((blob) => onChange?.(blob), "image/png");
  }, [hasInk, onChange]);

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pointFromEvent(e);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  };

  const end = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture?.(e.pointerId);
    // emit tras el próximo tick para asegurar hasInk actualizado
    setTimeout(emit, 0);
  };

  const clear = () => {
    setupCanvas();
    setHasInk(false);
    onChange?.(null);
  };

  return (
    <div style={styles.wrap}>
      <canvas
        ref={canvasRef}
        style={{ ...styles.canvas, height, opacity: disabled ? 0.6 : 1 }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <div style={styles.bar}>
        <span style={styles.hint}>
          {hasInk ? "Firma capturada." : "Firmá en el recuadro."}
        </span>
        <SecondaryButton size="sm" icon={Eraser} onClick={clear} disabled={disabled}>
          Limpiar
        </SecondaryButton>
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: "grid", gap: 8 },
  canvas: {
    width: "100%",
    borderRadius: theme.RADIUS_MD,
    border: `1px dashed ${theme.BORDER}`,
    background: "#fff",
    touchAction: "none",
    cursor: "crosshair",
    display: "block",
  },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  hint: { color: theme.SLATE, fontWeight: 800, fontSize: theme.FS_SM },
};
