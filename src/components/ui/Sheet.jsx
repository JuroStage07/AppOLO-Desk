import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BORDER, TEXT } from "../../styles/theme";
import useIsMobile from "../../hooks/useIsMobile";

// Selector de elementos enfocables usado por el focus-trap. Se excluyen los
// deshabilitados y los que optan por salir del orden de tabulación (tabindex=-1).
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Devuelve los elementos enfocables visibles dentro del contenedor del diálogo.
function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0
  );
}

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
  const isMobile = useIsMobile(560);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Accesibilidad (retrocompatible): foco inicial, confinamiento de Tab y
  // restauración del foco al disparador al cerrar/desmontar.
  useEffect(() => {
    if (!open) return;

    // Recordar el elemento que tenía el foco antes de abrir (el disparador).
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;

    // Mover el foco al primer elemento interactivo; si no hay, al contenedor.
    const focusables = getFocusableElements(dialog);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (dialog) {
      dialog.focus();
    }

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const items = getFocusableElements(dialog);
      if (items.length === 0) {
        // Sin elementos enfocables: mantener el foco dentro del contenedor.
        e.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const insideDialog = dialog?.contains(active);
      if (e.shiftKey) {
        if (active === first || !insideDialog) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !insideDialog) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Restaurar el foco al elemento disparador (incluye cierre por Escape).
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  // Portal a document.body: garantiza que `position: fixed` sea relativo al
  // viewport (y no a un ancestro con transform/overflow) y que el modal se
  // acote a la pantalla con header/footer fijos y body con scroll.
  return createPortal(
    <div style={{ ...root, ...(placement === "center" ? rootCenter : rootBottom) }}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={backdrop}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          ...sheetBase,
          ...(placement === "center" ? sheetCenter : sheetBottom),
          ...(isMobile ? sheetMobile : null),
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
    </div>,
    document.body
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

// Debe quedar por encima del Topbar (zIndex 120) y de los sidebars/flyouts
// (~1000), pero por debajo de ConfirmDialog (30050) y CommandPalette (30040)
// para que esos diálogos puedan superponerse a un Sheet abierto.
const root = { position: "fixed", inset: 0, zIndex: 30000 };
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
  background: "var(--c-surface, #fff)",
  border: `1px solid ${BORDER}`,
  padding: 16,
  margin: 12,
  boxSizing: "border-box",
  // Nunca exceder el viewport: header/footer fijos y body con scroll.
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 24px)",
  overflow: "hidden",
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

// En pantallas chicas el modal ocupa el ancho completo, con menos margen y
// padding para aprovechar el espacio disponible.
const sheetMobile = {
  margin: 0,
  padding: 14,
  maxWidth: "100%",
  maxHeight: "100dvh",
  borderRadius: 0,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: 10,
  flexShrink: 0,
};
const titleStyle = { fontSize: 16, fontWeight: 980, color: TEXT };
const closeBtn = {
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${BORDER}`,
  backgroundColor: "var(--c-surface-inset, #F2F4FB)",
  cursor: "pointer",
  fontWeight: 950,
  color: TEXT,
  fontFamily: "inherit",
};

const body = {
  display: "grid",
  gap: 12,
  // Ocupa el espacio disponible y hace scroll cuando el contenido excede el alto.
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  // Aire para el scrollbar y para que no se corten sombras/bordes de inputs.
  paddingRight: 2,
};
const actions = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 12,
  flexShrink: 0,
};
const hint = { marginTop: 10, color: "#64748B", fontWeight: 850, fontSize: 12 };
