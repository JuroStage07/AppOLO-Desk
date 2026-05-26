import React, { useEffect } from "react";
import { BORDER, TEXT } from "../../styles/theme";

/**
 * Bottom-sheet modal. Composable header / body / footer.
 *
 *   <Sheet open={open} onClose={() => setOpen(false)} title="Nueva acción">
 *     <Sheet.Body>
 *       <Field label="Patente"><Field.Input value={p} onChange={...} /></Field>
 *     </Sheet.Body>
 *     <Sheet.Actions>
 *       <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
 *       <PrimaryButton onClick={save}>Guardar</PrimaryButton>
 *     </Sheet.Actions>
 *   </Sheet>
 *
 * Props:
 *  - open
 *  - onClose
 *  - title
 *  - placement: "bottom" (default) | "center"
 *  - maxWidth: number (default 720)
 */
export default function Sheet({
  open,
  onClose,
  title,
  placement = "bottom",
  maxWidth = 720,
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ ...root, ...(placement === "center" ? rootCenter : rootBottom) }}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={backdrop}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          ...sheetBase,
          ...(placement === "center" ? sheetCenter : sheetBottom),
          maxWidth,
        }}
      >
        {title ? (
          <div style={header}>
            <div style={titleStyle}>{title}</div>
            <button type="button" onClick={onClose} style={closeBtn}>
              Cerrar
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function Body({ children, style }) {
  return <div style={{ ...body, ...style }}>{children}</div>;
}
function Actions({ children, style }) {
  return <div style={{ ...actions, ...style }}>{children}</div>;
}
function Hint({ children, style }) {
  return <div style={{ ...hint, ...style }}>{children}</div>;
}
Sheet.Body = Body;
Sheet.Actions = Actions;
Sheet.Hint = Hint;

const root = { position: "fixed", inset: 0, zIndex: 50 };
const rootBottom = { display: "grid", placeItems: "end center" };
const rootCenter = { display: "grid", placeItems: "center" };

const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.35)",
  border: "none",
  cursor: "pointer",
};

const sheetBase = {
  position: "relative",
  width: "100%",
  background: "#fff",
  border: `1px solid ${BORDER}`,
  padding: 16,
  margin: 12,
  boxSizing: "border-box",
};

const sheetBottom = {
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  boxShadow: "0 -18px 60px rgba(15,23,42,0.22)",
};

const sheetCenter = {
  borderRadius: 22,
  boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: 10,
};
const titleStyle = { fontSize: 16, fontWeight: 980, color: TEXT };
const closeBtn = {
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  backgroundColor: "#F2F4FB",
  cursor: "pointer",
  fontWeight: 950,
  color: TEXT,
  fontFamily: "inherit",
};

const body = { display: "grid", gap: 12 };
const actions = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 };
const hint = { marginTop: 10, color: "#64748B", fontWeight: 850, fontSize: 12 };
