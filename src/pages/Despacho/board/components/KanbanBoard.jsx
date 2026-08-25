// Feature: despachos-dev — tablero kanban del Listado (escritorio, ≥ 1024px).
//
// Renderiza una columna por cada estado presente en el catálogo con al menos un
// despacho, en el orden definido por el dominio (`groupByEstado`): ascendente
// por `orden` del catálogo, desempate alfabético por `nombre`. Cada columna
// tiene un encabezado (insignia de estado + contador) y una lista de
// `DespachoCard`. Al hacer clic en una tarjeta se invoca `onSelect(despacho)`
// para abrir el Detalle.
//
// El contenedor usa `overflow-x: auto` para que muchas columnas puedan
// desplazarse horizontalmente sin romper el layout.
//
// Colores y espaciados provienen exclusivamente de los tokens del tema
// (`src/styles/theme.js`), sin literales embebidos.
//
// Requirements: 2.6

import React, { useMemo } from "react";
import { theme } from "../../../../components/ui";
import EstadoBadge from "./EstadoBadge.jsx";
import DespachoCard from "./DespachoCard.jsx";
import { groupByEstado } from "../lib/despachoGrouping.js";

/**
 * Tablero kanban de despachos agrupados por estado (vista de escritorio).
 *
 * @param {object} props
 * @param {Array<object>} props.despachos - Despachos a mostrar (ya filtrados por scope/filtros).
 * @param {Array<{codigo:string,nombre?:string,orden?:number}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:Function,color:Function,icon:Function}} [props.mapaEstados] - Mapa prearmado.
 * @param {Record<string,string>} [props.choferNombres] - Mapa `chofer_id` → nombre del chofer.
 * @param {Date|number|string} [props.now] - Instante de referencia para el tiempo relativo.
 * @param {(despacho:object)=>void} [props.onSelect] - Abre el Detalle del despacho seleccionado.
 */
export default function KanbanBoard({
  despachos,
  catalogo,
  mapaEstados,
  choferNombres,
  now,
  onSelect,
}) {
  // Columnas ordenadas por el dominio: un grupo por estado con ≥ 1 despacho,
  // excluyendo 'eliminado', en el orden definido (2.3/2.6).
  const columnas = useMemo(
    () => groupByEstado(despachos, catalogo),
    [despachos, catalogo],
  );

  const nombresChofer = choferNombres || {};

  return (
    <div style={styles.board} role="list" aria-label="Tablero de despachos por estado">
      {columnas.map((columna) => (
        <section
          key={columna.codigo}
          style={styles.column}
          role="listitem"
          aria-label={`${columna.nombre} (${columna.despachos.length})`}
        >
          <header style={styles.columnHeader}>
            <EstadoBadge
              codigo={columna.codigo}
              catalogo={catalogo}
              mapaEstados={mapaEstados}
            />
            <span style={styles.count} aria-hidden="true">
              {columna.despachos.length}
            </span>
          </header>

          <div style={styles.cards}>
            {columna.despachos.map((despacho) => {
              const choferId = despacho?.chofer_id;
              const choferNombre =
                choferId !== null && choferId !== undefined
                  ? nombresChofer[choferId]
                  : undefined;
              return (
                <DespachoCard
                  key={despacho?.id ?? `${columna.codigo}-${despacho?.referencia ?? ""}`}
                  despacho={despacho}
                  catalogo={catalogo}
                  mapaEstados={mapaEstados}
                  choferNombre={choferNombre}
                  now={now}
                  onClick={() => onSelect?.(despacho)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const styles = {
  board: {
    display: "flex",
    alignItems: "flex-start",
    gap: theme.SPACE_4,
    overflowX: "auto",
    paddingBottom: theme.SPACE_3,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: theme.SPACE_3,
    flex: "0 0 auto",
    width: 300,
    padding: theme.SPACE_3,
    borderRadius: theme.RADIUS,
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_2,
  },
  count: {
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_EXTRABOLD,
    color: theme.SLATE,
  },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: theme.SPACE_3,
    // Muestra ~2 tarjetas y desplaza el resto, para que la columna (y la
    // página) no crezcan de forma indefinida con muchos despachos.
    maxHeight: 440,
    overflowY: "auto",
    // Aire para que el scrollbar no tape el borde de las tarjetas.
    paddingRight: theme.SPACE_1,
    minHeight: 0,
  },
};
