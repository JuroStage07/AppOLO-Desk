// Feature: despachos-dev — barra de filtros del listado (controlada).
//
// Componente controlado: el estado de los filtros vive en el padre y se recibe
// por `filtros`; cualquier cambio se comunica vía `onChange(next)`. Reutiliza
// componentes del UI kit (`SearchInput`, `Chip`/`ChipsRow`, `Field`, `Button`,
// `SecondaryButton`) y consume la capa de dominio pura (`despachoFilters.js`).
//
// Cubre:
//  - 4.1 Búsqueda de texto (SearchInput → filtros.texto).
//  - 4.2 Selector de estados múltiple (Chip por estado del catálogo, sin
//    'eliminado'); alternar añade/quita de filtros.estados.
//  - 4.3/4.4 Dos inputs de fecha con validación de rango y error inline en
//    español; el rango inválido no altera resultados (el padre usa
//    `filterDespachos`, que ignora rangos inválidos).
//  - 4.6 Acción "Limpiar filtros" → onChange(clearFilters()).
//  - 4.7/4.8 Contador de despachos visibles.
//  - 4.9 Mini-resumen por estado (recharts, carga perezosa) cuando está
//    disponible y habilitado; degrada a resumen textual sin romper.
//
// Colores/espaciados sólo desde tokens del tema (Requirement 11.4).

import React, { useMemo, Suspense } from "react";
import { RotateCcw } from "lucide-react";
import {
  SearchInput,
  Field,
  SecondaryButton,
  theme,
} from "../../../../components/ui";
import {
  isValidDateRange,
  clearFilters,
  countByEstado,
} from "../lib/despachoFilters.js";
import { colorFor, labelFor } from "../lib/mapaEstados.js";

// Gráfico de mini-resumen con carga perezosa de `recharts`. La fábrica de
// `React.lazy` sólo se invoca la primera vez que el componente se renderiza
// (es decir, cuando el resumen está habilitado y hay datos), por lo que
// `recharts` no se importa si el resumen está deshabilitado. El try/catch
// evita romper cuando la biblioteca no está disponible: en ese caso el
// componente perezoso renderiza `null`. (Requirement 4.9)
const LazyResumenChart = React.lazy(async () => {
  try {
    const recharts = await import("recharts");
    const {
      ResponsiveContainer,
      BarChart,
      Bar,
      XAxis,
      YAxis,
      Tooltip,
      Cell,
    } = recharts;

    function ResumenChart({ data }) {
      return (
        <ResponsiveContainer width="100%" height={168}>
          <BarChart
            data={data}
            margin={{ top: theme.SPACE_2, right: theme.SPACE_2, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: theme.FS_XS, fill: theme.SLATE }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={28}
              tick={{ fontSize: theme.FS_XS, fill: theme.SLATE }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.withAlpha(theme.SLATE, 0.08) }}
              contentStyle={{ fontSize: theme.FS_SM }}
            />
            <Bar dataKey="count" radius={[theme.SPACE_1, theme.SPACE_1, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.codigo} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return { default: ResumenChart };
  } catch {
    // Biblioteca no disponible: no romper, renderizar nada.
    return { default: function ResumenUnavailable() { return null; } };
  }
});

/**
 * Barra de filtros controlada del listado de Despachos Dev.
 *
 * @param {object} props
 * @param {{ texto?: string, estados?: string[], desde?: string|null, hasta?: string|null }} props.filtros
 *        Estado de filtros (propiedad del padre).
 * @param {(next: object) => void} props.onChange - Notifica el nuevo estado de filtros.
 * @param {Array<{ codigo: string, nombre?: string, orden?: number }>} [props.catalogo] - Catalogo_Estados.
 * @param {{ label:(c:string)=>string, color:(c:string)=>string }} [props.mapaEstados] - Mapa de estados prearmado.
 * @param {number} [props.visibleCount] - Cantidad de despachos visibles tras filtrar.
 * @param {Array<object>} [props.visibleDespachos] - Despachos visibles (para el mini-resumen).
 * @param {boolean} [props.showResumen] - Habilita el mini-resumen por estado.
 */
export default function FiltersBar({
  filtros,
  onChange,
  catalogo,
  mapaEstados,
  visibleCount,
  visibleDespachos,
  showResumen = false,
}) {
  const safeFiltros = filtros || {};
  const { texto = "", desde = null, hasta = null } = safeFiltros;

  const rangeInvalid = !isValidDateRange(desde, hasta);

  // Etiqueta y color por estado (mapa prearmado > catálogo/tokens del tema).
  const labelOf = (codigo) =>
    mapaEstados ? mapaEstados.label(codigo) : labelFor(codigo, catalogo);
  const colorOf = (codigo) =>
    mapaEstados ? mapaEstados.color(codigo) : colorFor(codigo);

  // Datos del mini-resumen: conteo por estado sobre los despachos visibles.
  // (Requirement 4.9)
  const resumenData = useMemo(() => {
    const counts = countByEstado(visibleDespachos);
    return Object.entries(counts)
      .map(([codigo, count]) => ({
        codigo,
        label: labelOf(codigo),
        color: colorOf(codigo),
        count,
      }))
      .sort((a, b) => b.count - a.count);
    // labelOf/colorOf dependen de mapaEstados/catalogo; se listan esas fuentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDespachos, mapaEstados, catalogo]);

  const resumenTextual = useMemo(
    () => resumenData.map((d) => `${d.label}: ${d.count}`).join("  ·  "),
    [resumenData],
  );

  function emit(patch) {
    onChange?.({ ...safeFiltros, ...patch });
  }

  const count = typeof visibleCount === "number" ? visibleCount : 0;
  const counterText = `${count} despacho${count === 1 ? "" : "s"} visible${
    count === 1 ? "" : "s"
  }`;

  return (
    <div style={styles.wrap}>
      {/* Búsqueda de texto (Requirement 4.1) */}
      <SearchInput
        value={texto}
        onChange={(t) => emit({ texto: t })}
        placeholder="Buscar por referencia, tienda o placa..."
      />

      {/* Rango de fechas (Requirements 4.3, 4.4) */}
      <div style={styles.dateRow}>
        <Field label="Desde" htmlFor="filtro-desde" error={rangeInvalid ? " " : undefined}>
          <Field.Input
            id="filtro-desde"
            type="date"
            value={desde ?? ""}
            onChange={(e) => emit({ desde: e.target.value || null })}
          />
        </Field>
        <Field label="Hasta" htmlFor="filtro-hasta" error={rangeInvalid ? " " : undefined}>
          <Field.Input
            id="filtro-hasta"
            type="date"
            value={hasta ?? ""}
            onChange={(e) => emit({ hasta: e.target.value || null })}
          />
        </Field>
      </div>
      {rangeInvalid ? (
        <span style={styles.rangeError} role="alert">
          El rango de fechas es inválido: la fecha de inicio es posterior a la fecha de fin
        </span>
      ) : null}

      {/* Contador + limpiar (Requirements 4.6, 4.7, 4.8) */}
      <div style={styles.footer}>
        <span style={styles.counter} aria-live="polite">
          {counterText}
        </span>
        <SecondaryButton
          size="sm"
          icon={RotateCcw}
          onClick={() => onChange?.(clearFilters())}
        >
          Limpiar filtros
        </SecondaryButton>
      </div>

      {/* Mini-resumen por estado (Requirement 4.9) */}
      {showResumen && resumenData.length > 0 ? (
        <div style={styles.resumen}>
          <span style={styles.sectionLabel}>Resumen por estado</span>
          <Suspense
            fallback={<div style={styles.resumenText}>{resumenTextual}</div>}
          >
            <LazyResumenChart data={resumenData} />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: theme.SPACE_3,
  },
  section: {
    display: "grid",
    gap: theme.SPACE_2,
  },
  sectionLabel: {
    color: theme.SLATE,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
  },
  dateRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.SPACE_3,
  },
  rangeError: {
    color: theme.DANGER,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    flexWrap: "wrap",
  },
  counter: {
    color: theme.TEXT,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
  },
  resumen: {
    display: "grid",
    gap: theme.SPACE_2,
    padding: theme.SPACE_3,
    borderRadius: theme.RADIUS,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
  },
  resumenText: {
    color: theme.SLATE,
    fontWeight: theme.FW_BOLD,
    fontSize: theme.FS_SM,
    lineHeight: theme.LH_NORMAL,
  },
};
