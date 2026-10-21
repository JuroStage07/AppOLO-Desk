import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreateUserDialog from "./CreateUserDialog";

vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));

const CATALOG = {
  tenants: [{ id: "CR", name: "Costa Rica", active: true }],
  companies: [{ id: "OLO", name: "OLO", active: true }],
  bodegas: [{ id: "CR-OLO-CLIRO", tenantId: "CR", companyId: "OLO", code: "CLIRO", name: "CLIRO", active: true }],
};

describe("CreateUserDialog", () => {
  it("exige nombre, correo y almacén; envía los datos y muestra la contraseña temporal", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      uid: "u9",
      email: "aperez@ologistics.com",
      username: "aperez",
      tempPassword: "abcd-EFGH-2345-wxyz",
      emailSent: true,
    });
    const onCreated = vi.fn();
    render(<CreateUserDialog open catalog={CATALOG} onClose={() => {}} onCreate={onCreate} onCreated={onCreated} />);

    const crear = screen.getByRole("button", { name: /Crear usuario/ });
    expect(crear).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Ana Pérez"), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByPlaceholderText("aperez@ologistics.com"), { target: { value: "aperez@ologistics.com" } });
    expect(crear).toBeDisabled(); // falta el almacén
    fireEvent.click(screen.getByRole("button", { name: /Asignar CLIRO/ }));
    expect(crear).toBeEnabled();

    fireEvent.click(crear);
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      displayName: "Ana Pérez",
      email: "aperez@ologistics.com",
      username: "aperez",
      role: "operativo",
      bodegaIds: ["CR-OLO-CLIRO"],
      activeBodegaId: "CR-OLO-CLIRO",
      sendWelcomeEmail: true,
    });
    expect(await screen.findByText("abcd-EFGH-2345-wxyz")).toBeInTheDocument();
    expect(screen.getByText(/correo de bienvenida/)).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalled();
  });

  it("muestra el error del servidor sin cerrar el formulario", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Ya existe una cuenta con el correo x."));
    render(<CreateUserDialog open catalog={CATALOG} onClose={() => {}} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText("Ana Pérez"), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByPlaceholderText("aperez@ologistics.com"), { target: { value: "x@ologistics.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Asignar CLIRO/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crear usuario/ }));
    expect(await screen.findByText(/Ya existe una cuenta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear usuario/ })).toBeInTheDocument();
  });
});
