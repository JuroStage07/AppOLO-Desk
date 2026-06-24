import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, ArrowRight, X } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { isEpaRestrictedUser } from "../../config/epaOnlyUids";
import { getVisibleAreas } from "../../config/workAreas";
import SidebarAreaIcon from "./SidebarAreaIcon";
import { OPEN_COMMAND_PALETTE_EVENT, CLOSE_COMMAND_PALETTE_EVENT } from "./commandPaletteBus";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, TEXT } from "../../styles/theme";

/**
 * Global command palette for fast navigation. Opens with ⌘K / Ctrl+K (or by
 * dispatching the window event from ./commandPaletteBus). Lists every area +
 * sub-module the user can see, with substring search and full keyboard control
 * (↑/↓ to move, Enter to go, Esc to close). Mount once at the app root.
 */

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function CommandPalette() {
  const nav = useNavigate();
  const { profile, permisos, epaAdmin, role, user: ctxUser } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const items = useMemo(() => {
    if (!user) return [];
    const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
    const areas = getVisibleAreas({ epaOnly, role, permisos, profile });
    const rows = [];
    for (const a of areas) {
      if (a.blocked) continue;
      rows.push({
        id: a.path,
        label: a.title,
        sublabel: "Área",
        path: a.path,
        img: a.img,
        icon: a.icon,
        hay: normalize([a.title, a.tag, a.desc].join(" ")),
      });
      for (const sub of a.subModules || []) {
        rows.push({
          id: sub.path,
          label: sub.label,
          sublabel: a.title,
          path: sub.path,
          img: a.img,
          icon: a.icon,
          hay: normalize([sub.label, a.title].join(" ")),
        });
      }
    }
    return rows;
  }, [user, profile, permisos, epaAdmin, role]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    const tokens = q.split(/\s+/);
    return items.filter((it) => tokens.every((t) => it.hay.includes(t)));
  }, [items, query]);

  // Global open via custom event only (Ctrl+K is handled by CircleMenu).
  useEffect(() => {
    const openPalette = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    return () => {
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    };
  }, []);

  // Capture Esc at the window level (capture phase) so it closes the palette
  // WITHOUT propagating to the CircleMenu's bubble-phase listener.
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        window.dispatchEvent(new Event(CLOSE_COMMAND_PALETTE_EVENT));
      }
    };
    window.addEventListener("keydown", onEsc, true); // capture phase
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [open]);

  // Focus the input on open (DOM-only side effect).
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || !user) return null;

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event(CLOSE_COMMAND_PALETTE_EVENT));
  };
  const choose = (it) => {
    if (!it) return;
    close();
    nav(it.path);
  };

  const onListKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div style={root}>
      <button type="button" aria-label="Cerrar" onClick={close} style={backdrop} />
      <div role="dialog" aria-modal="true" aria-label="Buscar y navegar" style={panel}>
        <div style={searchRow}>
          <Search size={18} strokeWidth={2.2} color={SLATE} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onListKey}
            placeholder="Buscar área o sección…"
            style={input}
            aria-label="Buscar"
          />
          <button type="button" onClick={close} style={escBtn} aria-label="Cerrar">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

        <div ref={listRef} style={list}>
          {filtered.length === 0 ? (
            <div style={empty}>Sin resultados para “{query}”.</div>
          ) : (
            filtered.map((it, idx) => {
              const isActive = idx === active;
              return (
                <button
                  key={it.id}
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(it)}
                  style={{ ...row, ...(isActive ? rowActive : {}) }}
                >
                  <SidebarAreaIcon img={it.img} fallback={it.icon} />
                  <span style={rowText}>
                    <span style={rowLabel}>{it.label}</span>
                    <span style={rowSub}>{it.sublabel}</span>
                  </span>
                  {isActive ? (
                    <CornerDownLeft size={15} strokeWidth={2.2} color={ACCENT} />
                  ) : (
                    <ArrowRight size={14} strokeWidth={2.2} color="#CBD5E1" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div style={footer}>
          <span style={footHint}><kbd style={kbd}>↑</kbd><kbd style={kbd}>↓</kbd> moverse</span>
          <span style={footHint}><kbd style={kbd}>↵</kbd> abrir</span>
          <span style={footHint}><kbd style={kbd}>Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

const root = {
  position: "fixed",
  inset: 0,
  zIndex: 30040,
  display: "grid",
  alignItems: "start",
  justifyItems: "center",
  padding: "12vh 16px 16px",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  border: "none",
  cursor: "pointer",
};
const panel = {
  position: "relative",
  width: "min(560px, 100%)",
  background: "#fff",
  borderRadius: 18,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 24px 60px rgba(15,23,42,0.30)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  maxHeight: "70vh",
  animation: "appoloConfirmIn 180ms cubic-bezier(0.22,1,0.36,1)",
};
const searchRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 14px",
  borderBottom: `1px solid ${BORDER}`,
};
const input = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 15,
  fontWeight: 700,
  color: TEXT,
  fontFamily: "inherit",
  minWidth: 0,
};
const escBtn = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "none",
  background: "#F1F5F9",
  color: SLATE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
  flexShrink: 0,
};
const list = { overflowY: "auto", padding: 8, display: "grid", gap: 2 };
const empty = { padding: "28px 16px", textAlign: "center", color: SLATE, fontWeight: 750, fontSize: 13 };
const row = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  transition: "background 120ms ease",
};
const rowActive = { background: ACCENT_SOFT };
const rowText = { flex: 1, display: "grid", gap: 1, minWidth: 0 };
const rowLabel = {
  fontSize: 13.5,
  fontWeight: 800,
  color: TEXT,
  lineHeight: 1.25,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const rowSub = { fontSize: 11.5, fontWeight: 650, color: SLATE, lineHeight: 1.2 };
const footer = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "9px 14px",
  borderTop: `1px solid ${BORDER}`,
  background: "#FBFCFF",
};
const footHint = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: SLATE };
const kbd = {
  display: "inline-grid",
  placeItems: "center",
  minWidth: 18,
  height: 18,
  padding: "0 4px",
  borderRadius: 5,
  background: "#fff",
  border: `1px solid ${BORDER}`,
  fontSize: 10,
  fontWeight: 800,
  color: TEXT,
};
