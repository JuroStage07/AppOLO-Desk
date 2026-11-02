// Filtro de andenes: andenes sueltos (chips) o rangos escritos ("1-5, 8, 12").
// El estado es solo el texto; los chips lo reescriben, así ambas vías quedan
// sincronizadas. Usado por los reportes de Despacho y Recepción.

import React, { useMemo } from "react";
import { Chip, ChipsRow, Field, theme } from "./ui";
import { andenLabel, formatAndenes, parseAndenes } from "../utils/andenes";

/**
 * @param {object} props
 * @param {Array<number|null>} props.disponibles  Andenes presentes en los datos cargados.
 * @param {string} props.texto                    Selección escrita (vacía = todos).
 * @param {(texto: string) => void} props.onChange
 * @param {string} [props.id]
 */
export default function AndenFilter({ disponibles = [], texto, onChange, id = "filtro-andenes" }) {
  const { andenes, error } = useMemo(() => parseAndenes(texto), [texto]);
  const numeros = useMemo(
    () => [...new Set(disponibles.filter((n) => Number.isInteger(n)))].sort((a, b) => a - b),
    [disponibles]
  );

  const toggle = (n) => {
    const next = new Set(andenes);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange(formatAndenes(next));
  };

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>Andén</span>
      <Field
        htmlFor={id}
        hint={error ? undefined : "Andenes sueltos o rangos, separados por coma. Ej: 1-5, 8, 12. Vacío = todos."}
        error={error || undefined}
      >
        <Field.Input
          id={id}
          value={texto}
          placeholder="Todos los andenes"
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
        />
      </Field>
      {numeros.length > 0 ? (
        <ChipsRow>
          <Chip active={andenes.size === 0} onClick={() => onChange("")}>
            Todos
          </Chip>
          {numeros.map((n) => (
            <Chip key={n} active={andenes.has(n)} onClick={() => toggle(n)}>
              {andenLabel(n)}
            </Chip>
          ))}
        </ChipsRow>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { display: "grid", gap: theme.SPACE_2 },
  label: { color: theme.SLATE, fontWeight: theme.FW_EXTRABOLD, fontSize: theme.FS_SM },
};
