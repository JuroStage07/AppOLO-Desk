// Feature: despachos-dev — pruebas de componente de `DespachoDetailSheet`.
//
// Pruebas de ejemplo (no property tests) que cubren:
//  - 5.1: el detalle se abre (el diálogo es visible cuando `open` es true).
//  - 5.2: muestra los campos de negocio del despacho.
//  - 5.5: muestra `estado_motivo` cuando tiene valor.
//  - 5.6: muestra los datos del chofer cuando se resuelven.
//  - 5.7: muestra "Datos del chofer no disponibles" cuando `choferError` está set.
//  - 5.9: es de solo lectura (no ofrece controles para cambiar estado ni editar).
//
// El componente recibe los datos por props (el hook de datos vive en la página);
// no consulta Supabase directamente, por lo que no se mockea el cliente.
//
// Nota jsdom: el `Sheet` usa `getClientRects().length > 0` para el focus-trap.
// jsdom no calcula layout, así que se stubbea `getClientRects` con un rectángulo
// mínimo para que la lógica de foco no falle (mismo patrón que Sheet.a11y.test).

import React from "react";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import DespachoDetailSheet from "./DespachoDetailSheet.jsx";

const catalogo = [
  { codigo: "creado", nombre: "Creado", orden: 1 },
  { codigo: "despachado", nombre: "Despachado", orden: 2 },
];

const despacho = {
  id: "d-1",
  company: "OLO",
  bodega_nombre: "El Coco",
  tipo: "salida",
  referencia: "REF-001",
  tienda: "Tienda Centro",
  placa: "ABC-123",
  marchamo: "M-77",
  puerta: "P3",
  notas: "Sin novedades",
  transportista: "TransExpress",
  con_dua: true,
  numero_dua: "DUA-555",
  tarimas_s: 3,
  tarimas_d: 5,
  fotos_count: 4,
  estado: "creado",
  estado_motivo: null,
  fecha: "2024-05-01",
  finalized_at: null,
  reopened_at: null,
};

const chofer = {
  id: "chf-9",
  nombre: "Juan Pérez",
  cedula: "1-2345-6789",
  placa_camion: "CAM-999",
  placa_contenedor: "CONT-888",
};

let originalGetClientRects;

beforeAll(() => {
  originalGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function getClientRects() {
    return [{ width: 10, height: 10, top: 0, left: 0, bottom: 10, right: 10 }];
  };
});

afterAll(() => {
  Element.prototype.getClientRects = originalGetClientRects;
});

describe("DespachoDetailSheet — Requirement 5.1 (apertura)", () => {
  it("no renderiza el diálogo cuando open es false", () => {
    render(
      <DespachoDetailSheet
        open={false}
        onClose={() => {}}
        despacho={despacho}
        catalogo={catalogo}
        historial={[]}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza el diálogo (role=dialog, aria-modal) cuando open es true", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={despacho}
        catalogo={catalogo}
        historial={[]}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});

describe("DespachoDetailSheet — Requirement 5.2 (campos de negocio)", () => {
  it("muestra los campos de negocio del despacho", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={despacho}
        catalogo={catalogo}
        historial={[]}
      />,
    );

    expect(screen.getByText("Referencia")).toBeInTheDocument();
    expect(screen.getByText("REF-001")).toBeInTheDocument();
    expect(screen.getByText("Tienda")).toBeInTheDocument();
    expect(screen.getByText("Tienda Centro")).toBeInTheDocument();
    expect(screen.getByText("TransExpress")).toBeInTheDocument();
    expect(screen.getByText("DUA-555")).toBeInTheDocument();
    // Tarimas en formato S/D.
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });
});

describe("DespachoDetailSheet — Requirement 5.5 (estado_motivo)", () => {
  it("muestra estado_motivo cuando tiene valor", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={{ ...despacho, estado_motivo: "Rechazado por documentación" }}
        catalogo={catalogo}
        historial={[]}
      />,
    );
    expect(screen.getByText("Rechazado por documentación")).toBeInTheDocument();
  });

  it("no muestra motivo cuando estado_motivo es nulo/vacío", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={{ ...despacho, estado_motivo: "" }}
        catalogo={catalogo}
        historial={[]}
      />,
    );
    expect(
      screen.queryByText("Rechazado por documentación"),
    ).not.toBeInTheDocument();
  });
});

describe("DespachoDetailSheet — Requirements 5.6 / 5.7 (chofer)", () => {
  it("muestra los datos del chofer cuando se resuelven (5.6)", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={despacho}
        chofer={chofer}
        catalogo={catalogo}
        historial={[]}
      />,
    );

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("1-2345-6789")).toBeInTheDocument();
    expect(screen.getByText("CAM-999")).toBeInTheDocument();
    expect(screen.getByText("CONT-888")).toBeInTheDocument();
  });

  it("muestra un indicador cuando el chofer no está disponible (5.7)", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={despacho}
        chofer={null}
        choferError={new Error("no encontrado")}
        catalogo={catalogo}
        historial={[]}
      />,
    );

    expect(
      screen.getByText(/datos del chofer no disponibles/i),
    ).toBeInTheDocument();
  });
});

describe("DespachoDetailSheet — Requirement 5.9 (solo lectura)", () => {
  it("no ofrece controles para cambiar estado ni editar", () => {
    render(
      <DespachoDetailSheet
        open
        onClose={() => {}}
        despacho={despacho}
        chofer={chofer}
        catalogo={catalogo}
        historial={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /cambiar estado/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /editar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /guardar/i }),
    ).not.toBeInTheDocument();
  });
});
