import { fireEvent, render, screen } from "@testing-library/react";
import DeleteUserDialog from "./DeleteUserDialog";

vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));

const USER = { id: "u2", email: "hvasquez@ologistics.com", displayName: "hvasquez" };

describe("DeleteUserDialog", () => {
  it("solo habilita eliminar al escribir el correo exacto del usuario", () => {
    const onConfirm = vi.fn();
    render(<DeleteUserDialog user={USER} open deleting={false} onCancel={() => {}} onConfirm={onConfirm} />);
    const btn = screen.getByRole("button", { name: /Eliminar usuario/ });
    expect(btn).toBeDisabled();

    const input = screen.getByPlaceholderText("hvasquez@ologistics.com");
    fireEvent.change(input, { target: { value: "otro@ologistics.com" } });
    expect(btn).toBeDisabled();

    fireEvent.change(input, { target: { value: " HVasquez@ologistics.com " } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith(USER, "hvasquez@ologistics.com");
  });

  it("explica que los registros no se eliminan", () => {
    render(<DeleteUserDialog user={USER} open deleting={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/No se elimina:/)).toBeInTheDocument();
    expect(screen.getByText(/se puede restaurar/)).toBeInTheDocument();
  });
});
