// Pruebas de accesibilidad del Sheet (modal bottom-sheet).
//
// Cubren el contrato a11y del diálogo:
//  - role="dialog" y aria-modal="true" cuando está abierto.
//  - Foco inicial sobre el primer elemento interactivo del diálogo.
//  - Confinamiento de Tab / Shift+Tab (focus trap) dentro del diálogo.
//  - Cierre con Escape (onClose) y restauración del foco al disparador.
//
// Nota sobre jsdom: jsdom no calcula layout, por lo que
// `Element.prototype.getClientRects()` devuelve una lista vacía. El Sheet usa
// `getClientRects().length > 0` para descartar elementos ocultos, de modo que
// sin layout consideraría a TODOS los elementos como no visibles. Para poder
// ejercitar la lógica real de focus-trap del componente stubbeamos
// `getClientRects` con un rectángulo mínimo durante estas pruebas.

import React, { useState } from "react";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sheet from "./Sheet";

// Componente contenedor: modela open/close con useState y expone un botón
// disparador para poder verificar la restauración del foco al cerrar.
function Harness({ onCloseSpy }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
      >
        <Sheet.Body>
          <input aria-label="nombre" />
          <button type="button">Interno</button>
        </Sheet.Body>
        <Sheet.Actions>
          <button type="button">Guardar</button>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

describe("Sheet — accesibilidad", () => {
  let originalGetClientRects;

  beforeAll(() => {
    // Simular layout: cada elemento reporta un rectángulo no vacío para que
    // el filtro de "visibilidad" del focus-trap encuentre los elementos.
    originalGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function getClientRects() {
      return [{ width: 10, height: 10, top: 0, left: 0, bottom: 10, right: 10 }];
    };
  });

  afterAll(() => {
    Element.prototype.getClientRects = originalGetClientRects;
  });

  it("expone role=\"dialog\" y aria-modal=\"true\" cuando está abierto", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("mueve el foco al primer elemento interactivo al abrir", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const primerFocusable = screen.getByLabelText("nombre");
    await waitFor(() => {
      expect(document.activeElement).toBe(primerFocusable);
    });
  });

  it("confina el foco: Tab desde el último envuelve al primero", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const primero = screen.getByLabelText("nombre");
    const ultimo = screen.getByRole("button", { name: "Guardar" });

    // Posicionar el foco en el último elemento y tabular hacia adelante.
    ultimo.focus();
    expect(document.activeElement).toBe(ultimo);

    await user.keyboard("{Tab}");

    // El trap debe devolver el foco al primer elemento (sigue dentro del diálogo).
    expect(document.activeElement).toBe(primero);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });

  it("confina el foco: Shift+Tab desde el primero envuelve al último", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const primero = screen.getByLabelText("nombre");
    const ultimo = screen.getByRole("button", { name: "Guardar" });

    primero.focus();
    expect(document.activeElement).toBe(primero);

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(document.activeElement).toBe(ultimo);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });

  it("cierra con Escape (onClose) y restaura el foco al disparador", async () => {
    const user = userEvent.setup();
    const onCloseSpy = vi.fn();
    render(<Harness onCloseSpy={onCloseSpy} />);

    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);

    // El diálogo está abierto y el foco entró en él.
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // onClose se invocó y el diálogo se desmontó.
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // El foco vuelve al elemento disparador tras el cierre.
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
