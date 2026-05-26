import React from "react";
import { BORDER, SLATE, TEXT } from "../../styles/theme";

/**
 * Form field — label + control. Use `<Field.Input/>`, `<Field.Select/>`,
 * or pass your own control as children.
 *
 *   <Field label="Nombre">
 *     <Field.Input value={name} onChange={e => setName(e.target.value)} />
 *   </Field>
 *
 *   <Field label="Fecha"><Field.Input type="date" .../></Field>
 */
export default function Field({ label, hint, error, htmlFor, children, style }) {
  return (
    <label style={{ ...wrap, ...style }} htmlFor={htmlFor}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      {children}
      {error ? <span style={errorStyle}>{error}</span> : hint ? <span style={hintStyle}>{hint}</span> : null}
    </label>
  );
}

function Input({ style, ...rest }) {
  return <input style={{ ...inputStyle, ...style }} {...rest} />;
}

function Select({ style, children, ...rest }) {
  return (
    <select style={{ ...inputStyle, ...style }} {...rest}>
      {children}
    </select>
  );
}

function Textarea({ style, ...rest }) {
  return <textarea style={{ ...inputStyle, ...textareaStyle, ...style }} {...rest} />;
}

Field.Input = Input;
Field.Select = Select;
Field.Textarea = Textarea;

const wrap = { display: "grid", gap: 6 };
const labelStyle = { color: SLATE, fontWeight: 950, fontSize: 12 };
const inputStyle = {
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  background: "#FBFCFF",
  padding: "12px 12px",
  outline: "none",
  fontWeight: 850,
  color: TEXT,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
const textareaStyle = { minHeight: 96, resize: "vertical" };
const hintStyle = { color: SLATE, fontWeight: 700, fontSize: 12 };
const errorStyle = { color: "#B91C1C", fontWeight: 800, fontSize: 12 };
