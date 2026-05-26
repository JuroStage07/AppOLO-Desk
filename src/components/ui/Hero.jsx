import React from "react";
import { ACCENT, SLATE, TEXT } from "../../styles/theme";

/**
 * Hero block — kicker row + title + subtitle, optionally with an aside slot.
 *
 *   <Hero
 *     kicker="Centro de control"
 *     title="Módulos"
 *     subtitle="Seleccioná el flujo que necesitás."
 *     badge={<Badge icon={Package}>Operación</Badge>}
 *     aside={<QuickCard ... />}
 *   />
 *
 * Variants:
 *  - layout="split" (default): two-column auto-fit
 *  - layout="compact": title on the left, aside on the right (flex row)
 */
export default function Hero({
  kicker,
  title,
  subtitle,
  badge,
  aside,
  layout = "split",
  style,
  children,
}) {
  return (
    <section style={{ ...(layout === "compact" ? heroCompact : hero), ...style }}>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        {(kicker || badge) && (
          <div style={kickerRow}>
            {kicker ? (
              <>
                <span style={kickerDot} />
                <span style={kickerText}>{kicker}</span>
              </>
            ) : null}
            {badge}
          </div>
        )}
        {title ? <h1 style={titleStyle}>{title}</h1> : null}
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        {children}
      </div>

      {aside ? <div style={{ minWidth: 0 }}>{aside}</div> : null}
    </section>
  );
}

export function SectionTitle({ title, hint, action, style }) {
  return (
    <div style={{ ...sectionHeader, ...style }}>
      <div style={{ display: "grid", gap: 2 }}>
        {title ? <div style={sectionTitleTxt}>{title}</div> : null}
        {hint ? <div style={sectionHint}>{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

const hero = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 18,
  alignItems: "start",
};

const heroCompact = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  paddingTop: 8,
  paddingBottom: 4,
};

const kickerRow = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const kickerDot = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: ACCENT,
  boxShadow: "0 0 0 3px rgba(8,159,138,0.2)",
};
const kickerText = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.08,
  textTransform: "uppercase",
  color: ACCENT,
};

const titleStyle = {
  margin: 0,
  fontSize: "clamp(22px, 4vw, 30px)",
  fontWeight: 950,
  letterSpacing: -0.4,
  lineHeight: 1.12,
  color: TEXT,
};

const subtitleStyle = {
  margin: 0,
  color: SLATE,
  fontWeight: 650,
  lineHeight: 1.5,
  fontSize: 14,
  maxWidth: 560,
};

const sectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 8,
  marginBottom: 6,
};
const sectionTitleTxt = { fontWeight: 980, fontSize: 16, color: TEXT };
const sectionHint = { color: SLATE, fontWeight: 800, fontSize: 13, lineHeight: 1.35 };
