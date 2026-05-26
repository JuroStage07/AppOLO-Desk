import React from "react";
import { ArrowRight } from "lucide-react";
import Card from "./Card";
import IconBox from "./IconBox";
import { ACCENT, ACCENT_SOFT, BORDER_SOFT, MUTED, SLATE, TEXT } from "../../styles/theme";

/**
 * Module tile used on hub pages (Recepción, Mantenimiento, etc.).
 *
 *   <ModuleCard title="Equipos" desc="..." icon={Wrench} tag="Equipos" tone="accent" onClick={...} />
 *
 * Image variant: pass `image` (URL). The header becomes a 124-px banner with
 * overlay + tag/status pills floating on top.
 *
 *   <ModuleCard title="Equipos" image={imgEquipos} imageFit="contain" ... />
 */
export default function ModuleCard({
  title,
  desc,
  icon,
  image,
  imageFit = "cover", // "cover" | "contain"
  tag,
  status = "Listo",
  tone = "neutral",
  href,
  onClick,
  cta = "Entrar",
}) {
  const accent = tone === "accent";

  return (
    <Card tone={tone} hoverable onClick={onClick}>
      {image ? (
        <div
          style={{
            ...mediaHeader,
            backgroundImage: `url(${image})`,
            backgroundSize: imageFit,
            backgroundRepeat: imageFit === "contain" ? "no-repeat" : undefined,
          }}
        >
          <div style={mediaOverlay} />
          <div style={mediaTop}>
            {tag ? (
              <span style={{ ...pillOnImg, ...(accent ? pillOnImgAccent : {}) }}>{tag}</span>
            ) : <span />}
            {status ? (
              <span style={{ ...statusOnImg, ...statusOnImgOk }}>{status}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={simpleHeader}>
          <IconBox icon={icon} tone={tone} />
          <div style={simpleHeaderRight}>
            {tag ? (
              <span style={{ ...pillSolid, ...(accent ? pillSolidAccent : {}) }}>{tag}</span>
            ) : null}
            {status ? (
              <span style={{ ...statusPillSolid, ...statusOkSolid }}>{status}</span>
            ) : null}
          </div>
        </div>
      )}

      <div style={cardBody}>
        <div style={cardTitle}>{title}</div>
        {desc ? <div style={cardDesc}>{desc}</div> : null}
        <div style={cardFooter}>
          <span style={{ ...link, ...(accent ? linkAccent : {}) }}>
            <span style={btnInlineIcon}>
              {cta}
              <ArrowRight size={14} strokeWidth={2.5} />
            </span>
          </span>
          {href ? <span style={metaHint}>{href}</span> : null}
        </div>
      </div>
    </Card>
  );
}

/* Image header */
const mediaHeader = {
  height: 124,
  backgroundPosition: "center",
  position: "relative",
};
const mediaOverlay = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.55) 100%)",
};
const mediaTop = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};
const pillOnImg = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 11,
  backdropFilter: "blur(6px)",
  display: "inline-flex",
  alignItems: "center",
};
const pillOnImgAccent = {
  borderColor: "rgba(255,255,255,0.45)",
  background: "rgba(8,159,138,0.28)",
};
const statusOnImg = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 11,
  backdropFilter: "blur(6px)",
  display: "inline-flex",
  alignItems: "center",
};
const statusOnImgOk = { background: "rgba(8,159,138,0.30)" };

/* Icon header (no image) */
const simpleHeader = {
  padding: 14,
  borderBottom: `1px solid ${BORDER_SOFT}`,
  background: "linear-gradient(180deg, #FBFCFF 0%, #fff 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};
const simpleHeaderRight = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

const pillSolid = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${BORDER_SOFT}`,
  background: "#fff",
  color: TEXT,
  fontWeight: 800,
  fontSize: 11,
};
const pillSolidAccent = {
  borderColor: "rgba(8,159,138,0.30)",
  background: "#F3FBF9",
  color: ACCENT,
};

const statusPillSolid = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${BORDER_SOFT}`,
  background: "#fff",
  fontWeight: 800,
  fontSize: 11,
};
const statusOkSolid = {
  borderColor: "rgba(8,159,138,0.30)",
  background: ACCENT_SOFT,
  color: ACCENT,
};

/* Body */
const cardBody = { padding: 16 };
const cardTitle = { fontWeight: 950, fontSize: 16, color: TEXT, marginBottom: 6 };
const cardDesc = { color: SLATE, fontWeight: 650, fontSize: 13, lineHeight: 1.45, minHeight: 40 };

const cardFooter = {
  marginTop: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};
const link = { color: TEXT, fontWeight: 850, fontSize: 13, display: "inline-flex", alignItems: "center" };
const linkAccent = { color: ACCENT };
const metaHint = { color: MUTED, fontWeight: 700, fontSize: 12 };
const btnInlineIcon = { display: "inline-flex", alignItems: "center", gap: 8 };
