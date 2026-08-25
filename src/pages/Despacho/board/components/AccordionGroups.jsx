// Feature: despachos-dev — Listado en acordeón (viewport < 1024px).
//
// Vista móvil del Listado: una sección colapsable por cada estado presente en
// el Catalogo_Estados con al menos un despacho, en el orden definido por
// `groupByEstado` (ascendente por `orden`; desempate alfabético por `nombre`;
// excluye `eliminado`). Cada sección tiene un encabezado accesible (un `button`
// con `aria-expanded`) que muestra la insignia de estado y el conteo de
// despachos y alterna la expansión del grupo. Al expandirse, se renderiza un
// `DespachoCard` por despacho; `onSelect(despacho)` abre el Detalle.
//
// Colores y espaciados provienen exclusivamente de los tokens del tema; no hay
// literales de color/espaciado embebidos (Requirement 11.4).
//
// Requirements: 2.7

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { theme } from "../../../../components/ui";
import { groupByEstado } from "../lib/despachoGrouping.js";
import DespachoCard from "./DespachoCard.jsx";
import EstadoBadge from "./EstadoBadge.jsx";

/**
 * Acordeón de despachos agrupados por estado (vista móvil, viewport < 1024px).
 *
 * @param {object} props
 * @param {Array<object>} [props.despachos] - Despachos activos ya cargados.
 * @param {Array<{codigo:string,nombre?:string,orden?:number}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:Function,color:Function,icon:Function}} [props.mapaEstados] - Mapa de estados prearmado.
 * @param {Record<string,string>} [props.choferNombres] - Mapa `chofer_id` → nombre del chofer.
 * @param {Date|number|string} [props.now] - Instante de referencia para el tiempo relativo.
 * @param {(despacho:object)=>void} [props.onSelect] - Abre el Detalle del despacho.
 */
export default function AccordionGroups({
  despachos,
  catalogo,
  mapaEstados,
  choferNombres,
  now,
  onSelect,
}) {
  // Grupos ordenados desde la capa de dominio pura (orden y exclusiones ya
  // resueltos por `groupByEstado`).
  const grupos = useMemo(
    () => groupByEstado(despachos, catalogo),
    [despachos, catalogo],
  );

  // Secciones abiertas por `codigo`. Por defecto, todos los grupos abiertos.
  const [openCodes, setOpenCodes] = useState(null);
  const openSet = useMemo(() => {
    if (openCodes) return openCodes;
    // Estado inicial derivado: todos los grupos abiertos.
    return new Set(grupos.map((g) => g.codigo));
  }, [openCodes, grupos]);

  function toggle(codigo) {
    setOpenCodes((prev) => {
      const base = prev ?? new Set(grupos.map((g) => g.codigo));
      const next = new Set(base);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  if (grupos.length === 0) return null;

  return (
    <div style={styles.wrap}>
      {grupos.map((grupo) => {
        const open = openSet.has(grupo.codigo);
        const panelId = `acordeon-panel-${grupo.codigo}`;
        const headerId = `acordeon-header-${grupo.codigo}`;
        const color = mapaEstados
          ? mapaEstados.color(grupo.codigo)
          : undefined;

        return (
          <section key={grupo.codigo} style={styles.section}>
            <h3 style={styles.headingReset}>
              <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(grupo.codigo)}
                style={{
                  ...styles.header,
                  ...(color ? { borderInlineStartColor: color } : null),
                }}
              >
                <span style={styles.headerLeft}>
                  <EstadoBadge
                    codigo={grupo.codigo}
                    catalogo={catalogo}
                    mapaEstados={mapaEstados}
                  />
                  <span style={styles.count}>{grupo.despachos.length}</span>
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  style={{
                    ...styles.chevron,
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
            </h3>

            {open ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                style={styles.panel}
              >
                {grupo.despachos.map((despacho) => (
                  <DespachoCard
                    key={despacho.id}
                    despacho={despacho}
                    catalogo={catalogo}
                    mapaEstados={mapaEstados}
                    choferNombre={
                      choferNombres && despacho?.chofer_id != null
                        ? choferNombres[despacho.chofer_id]
                        : undefined
                    }
                    now={now}
                    onClick={() => onSelect?.(despacho)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: theme.SPACE_3,
  },
  section: {
    border: `1px solid ${theme.BORDER}`,
    borderRadius: theme.RADIUS,
    background: theme.SURFACE,
    overflow: "hidden",
  },
  headingReset: {
    margin: 0,
    padding: 0,
    fontSize: "inherit",
    fontWeight: "inherit",
  },
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    padding: theme.SPACE_3,
    background: theme.SURFACE_SOFT,
    border: "none",
    borderInlineStart: `3px solid ${theme.BORDER}`,
    cursor: "pointer",
    textAlign: "left",
    color: theme.TEXT,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: theme.SPACE_2,
  },
  count: {
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_EXTRABOLD,
    color: theme.MUTED,
  },
  chevron: {
    color: theme.MUTED,
    transition: "transform 150ms ease",
    flexShrink: 0,
  },
  panel: {
    display: "grid",
    gap: theme.SPACE_3,
    padding: theme.SPACE_3,
    background: theme.SURFACE,
    // Muestra ~2 tarjetas por grupo y desplaza el resto (evita listas infinitas).
    maxHeight: 440,
    overflowY: "auto",
    minHeight: 0,
  },
};
