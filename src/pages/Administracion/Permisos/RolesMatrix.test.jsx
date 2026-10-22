import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RolesMatrix from "./RolesMatrix";

const roles = [
  { id: "r1", nombre: "Técnico", permisos: { mantenimiento: true } },
  { id: "r2", nombre: "Despachador", permisos: { despachoReporte: true } },
];

describe("RolesMatrix", () => {
  it("dibuja roles como columnas y permisos como filas", () => {
    const draft = { r1: roles[0].permisos, r2: roles[1].permisos };
    render(<RolesMatrix roles={roles} draft={draft} onSet={() => {}} userCounts={{ r1: 3 }} onEditRole={() => {}} />);
    expect(screen.getByText("Técnico")).toBeTruthy();
    expect(screen.getByText("Despachador")).toBeTruthy();
    expect(screen.getByText("3 usuario(s)")).toBeTruthy();
    expect(screen.getByText("Reporte de despachos")).toBeTruthy();
  });

  it("marcar una celda llama onSet con rol, clave y valor", () => {
    const onSet = vi.fn();
    const draft = { r1: {}, r2: {} };
    render(<RolesMatrix roles={roles} draft={draft} onSet={onSet} userCounts={{}} onEditRole={() => {}} />);
    fireEvent.click(screen.getByLabelText("Despacho · Reporte de despachos · Despachador"));
    expect(onSet).toHaveBeenCalledWith("r2", "despachoReporte", true);
  });

  it("una acción incluida por «Acceso total» queda implícita y no se puede tocar", () => {
    const draft = { r1: { mantenimiento: true }, r2: {} };
    render(<RolesMatrix roles={roles} draft={draft} onSet={() => {}} userCounts={{}} onEditRole={() => {}} />);
    const cell = screen.getByLabelText("Equipos · Agregar equipo · Técnico");
    expect(cell.disabled).toBe(true);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
  });
});
