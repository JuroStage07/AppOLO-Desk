// Feature: despachos-dev — pruebas de componente de `HistorialTimeline`.
//
// Pruebas de ejemplo (no property tests) que cubren:
//  - 6.3 / 6.4: cada entrada muestra `descripcion`, `actor_email` y `created_at`
//    (fecha y hora), usando la `descripcion` directamente como contenido.
//  - 6.7: estado vacío con el mensaje "No existen registros de actividad".
//  - 6.8: estado de error que renderiza una región de error sin lanzar
//    excepciones (el detalle permanece abierto; este componente sólo dibuja su
//    propia región).
//
// El componente recibe los datos por props; no consulta Supabase.

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HistorialTimeline from "./HistorialTimeline.jsx";

const catalogo = [
  { codigo: "creado", nombre: "Creado", orden: 1 },
  { codigo: "despachado", nombre: "Despachado", orden: 2 },
];

describe("HistorialTimeline — Requirements 6.3 / 6.4 (contenido de la entrada)", () => {
  it("muestra descripcion, actor_email y created_at (fecha/hora) de cada entrada", () => {
    const historial = [
      {
        id: "a-1",
        descripcion: "Despacho creado",
        actor_email: "operador@olo.com",
        created_at: "2024-05-01T10:00:00.000Z",
        detalle: null,
      },
      {
        id: "a-2",
        descripcion: "Estado actualizado a despachado",
        actor_email: "supervisor@olo.com",
        created_at: "2024-05-02T12:30:00.000Z",
        detalle: null,
      },
    ];

    const { container } = render(
      <HistorialTimeline historial={historial} catalogo={catalogo} />,
    );

    // 6.4: la descripcion se usa directamente como contenido legible.
    expect(screen.getByText("Despacho creado")).toBeInTheDocument();
    expect(screen.getByText("Estado actualizado a despachado")).toBeInTheDocument();

    // 6.3: actor_email visible.
    expect(screen.getByText("operador@olo.com")).toBeInTheDocument();
    expect(screen.getByText("supervisor@olo.com")).toBeInTheDocument();

    // 6.3: created_at renderizado con fecha/hora (elemento <time> no vacío).
    const times = container.querySelectorAll("time");
    expect(times.length).toBe(2);
    times.forEach((t) => {
      expect(t.textContent.trim().length).toBeGreaterThan(0);
      // La fecha formateada incluye el año (independiente de zona horaria).
      expect(t.textContent).toMatch(/2024/);
    });
  });

  it("muestra la transición coloreada cuando el detalle trae ambos estados", () => {
    const historial = [
      {
        id: "a-1",
        descripcion: "Cambio de estado",
        actor_email: "operador@olo.com",
        created_at: "2024-05-01T10:00:00.000Z",
        detalle: { estadoAnterior: "creado", estadoNuevo: "despachado" },
      },
    ];

    render(<HistorialTimeline historial={historial} catalogo={catalogo} />);

    // Las insignias de ambos estados aparecen (texto del catálogo).
    expect(screen.getByText("Creado")).toBeInTheDocument();
    expect(screen.getByText("Despachado")).toBeInTheDocument();
  });
});

describe("HistorialTimeline — Requirement 6.7 (estado vacío)", () => {
  it("muestra el mensaje de sin actividad cuando el historial está vacío", () => {
    render(<HistorialTimeline historial={[]} catalogo={catalogo} />);
    expect(
      screen.getByText("No existen registros de actividad."),
    ).toBeInTheDocument();
  });

  it("trata historial nulo/no-array como vacío", () => {
    render(<HistorialTimeline historial={null} catalogo={catalogo} />);
    expect(
      screen.getByText("No existen registros de actividad."),
    ).toBeInTheDocument();
  });
});

describe("HistorialTimeline — Requirement 6.8 (estado de error)", () => {
  it("renderiza una región de error sin lanzar cuando error es truthy", () => {
    render(
      <HistorialTimeline
        historial={[]}
        catalogo={catalogo}
        error="fallo de red"
      />,
    );

    // ErrorState expone role="alert" y su título en español.
    const region = screen.getByRole("alert");
    expect(region).toBeInTheDocument();
    expect(
      screen.getByText("No se pudo cargar el historial"),
    ).toBeInTheDocument();
    // No se muestra el estado vacío cuando hay error.
    expect(
      screen.queryByText("No existen registros de actividad."),
    ).not.toBeInTheDocument();
  });
});
