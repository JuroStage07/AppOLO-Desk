// Feature: despachos-dev — pruebas de componente de `FiltersBar`.
//
// Pruebas de ejemplo (no property tests) que cubren:
//  - 4.6: la acción "Limpiar filtros" invoca `onChange` con los filtros
//    restablecidos (texto:"", estados:[], desde:null, hasta:null).
//  - 4.8: el contador de visibles muestra el `visibleCount` provisto
//    (p. ej. 0 → "0 despachos visibles").
//
// `FiltersBar` es un componente controlado que recibe datos por props; no
// consulta Supabase, por lo que no se requiere mockearlo.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FiltersBar from "./FiltersBar.jsx";

const catalogo = [
  { codigo: "creado", nombre: "Creado", orden: 1 },
  { codigo: "despachado", nombre: "Despachado", orden: 2 },
];

const filtrosVacios = { texto: "", estados: [], desde: null, hasta: null };

describe("FiltersBar — Requirement 4.6 (limpiar filtros)", () => {
  it("al pulsar 'Limpiar filtros' invoca onChange con los filtros restablecidos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FiltersBar
        filtros={{ texto: "abc", estados: ["creado"], desde: "2024-05-01", hasta: "2024-05-10" }}
        onChange={onChange}
        catalogo={catalogo}
        visibleCount={2}
        visibleDespachos={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /limpiar filtros/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      texto: "",
      estados: [],
      desde: null,
      hasta: null,
    });
  });
});

describe("FiltersBar — Requirement 4.8 (contador de visibles)", () => {
  it("muestra '0 despachos visibles' cuando visibleCount es 0", () => {
    render(
      <FiltersBar
        filtros={filtrosVacios}
        onChange={() => {}}
        catalogo={catalogo}
        visibleCount={0}
        visibleDespachos={[]}
      />,
    );

    expect(screen.getByText("0 despachos visibles")).toBeInTheDocument();
  });

  it("usa el singular '1 despacho visible' cuando visibleCount es 1", () => {
    render(
      <FiltersBar
        filtros={filtrosVacios}
        onChange={() => {}}
        catalogo={catalogo}
        visibleCount={1}
        visibleDespachos={[]}
      />,
    );

    expect(screen.getByText("1 despacho visible")).toBeInTheDocument();
  });

  it("muestra el plural con el conteo provisto", () => {
    render(
      <FiltersBar
        filtros={filtrosVacios}
        onChange={() => {}}
        catalogo={catalogo}
        visibleCount={7}
        visibleDespachos={[]}
      />,
    );

    expect(screen.getByText("7 despachos visibles")).toBeInTheDocument();
  });
});
