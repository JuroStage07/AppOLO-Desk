import React, { createContext, useContext } from "react";
import { BORDER, SLATE, TEXT, DANGER, DANGER_BORDER } from "../../styles/theme";

/**
 * Form field — label + control + inline validation message.
 *
 *   <Field label="Nombre" error={errors.name}>
 *     <Field.Input value={name} onChange={e => setName(e.target.value)} />
 *   </Field>
 *
 * When `error` is set the message turns red AND the inner control (Field.Input /
 * Select / Textarea) automatically gets a red border + aria-invalid, via context
 * — no need to wire the control yourself. `required` adds a discreet asterisk.
 */

const FieldCtx = createContext({ invalid: false });

export default function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
  style,
}) {
  const invalid = !!error;
  return (
    <FieldCtx.Provider value={{ invalid }}>
      <label style={{ ...wrap, ...style }} htmlFor={htmlFor}>
        {label ? (
          <span style={labelStyle}>
            {label}
            {required ? <span style={req}> *</span> : null}
          </span>
        ) : null}
        {children}
        {invalid ? (
          <span style={errorStyle} role="alert">
            {error}
          </span>
        ) : hint ? (
          <span style={hintStyle}>{hint}</span>
        ) : null}
      </label>
    </FieldCtx.Provider>
  );
}

function controlStyle(invalid, style) {
  return {
    ...inputStyle,
    ...(invalid ? invalidStyle : {}),
    ...style,
  };
}

function Input({ style, invalid: invalidProp, ...rest }) {
  const { invalid } = useContext(FieldCtx);
  const bad = invalidProp ?? invalid;
  return (
    <input
      aria-invalid={bad || undefined}
      style={controlStyle(bad, style)}
      {...rest}
    />
  );
}

function Select({ style, invalid: invalidProp, children, ...rest }) {
  const { invalid } = useContext(FieldCtx);
  const bad = invalidProp ?? invalid;
  return (
    <select
      aria-invalid={bad || undefined}
      style={controlStyle(bad, style)}
      {...rest}
    >
      {children}
    </select>
  );
}

function Textarea({ style, invalid: invalidProp, ...rest }) {
  const { invalid } = useContext(FieldCtx);
  const bad = invalidProp ?? invalid;
  return (
    <textarea
      aria-invalid={bad || undefined}
      style={{ ...controlStyle(bad, style), ...textareaStyle }}
      {...rest}
    />
  );
}

Field.Input = Input;
Field.Select = Select;
Field.Textarea = Textarea;

const wrap = { display: "grid", gap: 6 };
const labelStyle = { color: SLATE, fontWeight: 950, fontSize: 12 };
const req = { color: DANGER, fontWeight: 950 };
const inputStyle = {
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  background: "var(--c-surface-soft, #FBFCFF)",
  padding: "12px 12px",
  outline: "none",
  fontWeight: 850,
  color: TEXT,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
const invalidStyle = {
  borderColor: DANGER_BORDER,
  background: "#FEF6F6",
  boxShadow: `0 0 0 3px rgba(185,28,28,0.10)`,
};
const textareaStyle = { minHeight: 96, resize: "vertical" };
const hintStyle = { color: SLATE, fontWeight: 700, fontSize: 12 };
const errorStyle = { color: DANGER, fontWeight: 800, fontSize: 12 };
