// Feature: despachos-dev — pruebas de componente de `DespachoCard`.
//
// Pruebas de ejemplo (no property tests) que cubren:
//  - 3.4: cuando el despacho tiene `chofer_id` asignado y se provee
//    `choferNombre`, la tarjeta muestra el nombre del chofer; al hacer clic la
//    tarjeta invoca `onClick`.
//
// El componente recibe todos sus datos por props (no consulta Supabase), por lo
// que no se requiere mockear el cliente Supabase.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DespachoCard from "./DespachoCard.jsx";

const catalogo = [
  { codigo: "creado", nombre: "Creado", orden: 1 },
  { codigo: "despachado", nombre: "Despachado", orden: 2 },
];

const baseDespacho = {
  id: "d-1",
  referencia: "REF-001",
  tienda: "Tienda Centro",
  fecha: "2024-05-01",
  tarimas_s: 3,
  tarimas_d: 5,
  estado: "creado",
  updated_at: "2024-05-01T10:00:00.000Z",
};

describe("DespachoCard — Requirement 3.4", () => {
  it("muestra el nombre del chofer cuando el despacho tiene chofer_id y se provee choferNombre", () => {
    render(
      <DespachoCard
        despacho={{ ...baseDespacho, chofer_id: "chf-9" }}
        catalogo={catalogo}
        choferNombre="Juan Pérez"
        now={Date.parse("2024-05-01T10:05:00.000Z")}
      />,
    );

    // La fila de chofer aparece con su etiqueta y el nombre provisto.
    expect(screen.getByText("Chofer")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
  });

  it("no muestra la fila de chofer cuando el despacho no tiene chofer_id", () => {
    render(
      <DespachoCard
        despacho={{ ...baseDespacho, chofer_id: null }}
        catalogo={catalogo}
        choferNombre="Juan Pérez"
        now={Date.parse("2024-05-01T10:05:00.000Z")}
      />,
    );

    expect(screen.queryByText("Chofer")).not.toBeInTheDocument();
    expect(screen.queryByText("Juan Pérez")).not.toBeInTheDocument();
  });

  it("invoca onClick al hacer clic en la tarjeta", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <DespachoCard
        despacho={{ ...baseDespacho, chofer_id: "chf-9" }}
        catalogo={catalogo}
        choferNombre="Juan Pérez"
        now={Date.parse("2024-05-01T10:05:00.000Z")}
        onClick={onClick}
      />,
    );

    // El `Card` con `onClick` se expone como role="button".
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renderiza la referencia y las tarimas en formato S/D", () => {
    render(
      <DespachoCard
        despacho={{ ...baseDespacho, chofer_id: null }}
        catalogo={catalogo}
        now={Date.parse("2024-05-01T10:05:00.000Z")}
      />,
    );

    expect(screen.getByText("REF-001")).toBeInTheDocument();
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });
});
