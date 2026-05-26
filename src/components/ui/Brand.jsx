import React from "react";
import { ACCENT, SHADOW_ACCENT, SLATE, TEXT } from "../../styles/theme";

/**
 * Brand mark + title/subtitle, used in <Topbar/>.
 *
 *   <Brand title="Recepción" subtitle="Panel de módulos" icon={Truck} onClick={() => nav("/")} />
 *
 * Props:
 *  - icon: lucide-react component (rendered white on accent square)
 *  - iconNode: alternative custom element if `icon` doesn't fit
 *  - title, subtitle
 *  - onClick
 *  - markColor: override accent color for the icon square
 */
export default function Brand({
  icon: Icon,
  iconNode,
  title,
  subtitle,
  onClick,
  markColor = ACCENT,
  size = 20,
  style,
}) {
  const interactive = typeof onClick === "function";
  const handleKey = (e) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") onClick(e);
  };

  return (
    <div
      style={{ ...brand, cursor: interactive ? "pointer" : "default", ...style }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKey}
    >
      <div style={{ ...brandMark, background: markColor, boxShadow: SHADOW_ACCENT }}>
        {iconNode ?? (Icon ? <Icon size={size} strokeWidth={2.25} color="#fff" /> : null)}
      </div>
      <div style={brandText}>
        {title ? <div style={brandTitle}>{title}</div> : null}
        {subtitle ? <div style={brandSub}>{subtitle}</div> : null}
      </div>
    </div>
  );
}

const brand = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  userSelect: "none",
  outline: "none",
  minWidth: 0,
};
const brandMark = {
  width: 44,
  height: 44,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const brandText = { display: "grid", gap: 2, minWidth: 0 };
const brandTitle = { fontWeight: 950, fontSize: 14, color: TEXT };
const brandSub = { fontWeight: 800, fontSize: 12, color: SLATE };
