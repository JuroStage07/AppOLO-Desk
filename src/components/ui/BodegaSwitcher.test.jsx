import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthCtx } from "../../auth/AuthProvider";
import BodegaSwitcher from "./BodegaSwitcher";
import UserBodegasEditor from "../../pages/Administracion/UserBodegasEditor";

const updateDoc = vi.fn(() => Promise.resolve());
vi.mock("firebase/firestore", () => ({
  doc: (...a) => ({ path: a.slice(1).join("/") }),
  updateDoc: (...a) => updateDoc(...a),
}));
vi.mock("../../firebase", () => ({ auth: { currentUser: { uid: "u1" } }, db: {} }));

const CATALOG = {
  tenants: [
    { id: "CR", name: "Costa Rica", active: true },
    { id: "VNZ", name: "Venezuela", active: true },
  ],
  companies: [{ id: "OLO", name: "OLO", active: true }],
  bodegas: [
    { id: "CR-OLO-CLIRO", tenantId: "CR", companyId: "OLO", code: "CLIRO", name: "CLIRO", active: true },
    { id: "CR-OLO-ELCOCO", tenantId: "CR", companyId: "OLO", code: "ELCOCO", name: "El Coco", active: true },
    { id: "VNZ-OLO-SANDIEGO", tenantId: "VNZ", companyId: "OLO", code: "SANDIEGO", name: "San Diego", active: true },
  ],
};
vi.mock("../../hooks/useOrgCatalog", () => ({ default: () => ({ catalog: CATALOG, loading: false }) }));

function renderSwitcher(profile) {
  return render(
    <AuthCtx.Provider value={{ profile }}>
      <BodegaSwitcher />
    </AuthCtx.Provider>
  );
}

describe("BodegaSwitcher", () => {
  beforeEach(() => {
    updateDoc.mockClear();
    localStorage.clear();
    Object.defineProperty(window, "location", { value: { reload: vi.fn() }, writable: true });
  });

  it("lista solo los almacenes asignados, agrupados por país, aunque sean de otro país", () => {
    renderSwitcher({ tenantId: "CR", company: "OLO", bodegaId: "CR-OLO-CLIRO", bodegaIds: ["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"] });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar almacén/ }));
    expect(screen.getByText("Costa Rica · OLO")).toBeInTheDocument();
    expect(screen.getByText("Venezuela · OLO")).toBeInTheDocument();
    expect(screen.getByText("San Diego")).toBeInTheDocument();
    // El Coco es del mismo país pero no está asignado → no aparece.
    expect(screen.queryByText("El Coco")).not.toBeInTheDocument();
  });

  it("al cambiar de almacén cambia país y compañía juntos (Firestore y localStorage)", async () => {
    renderSwitcher({ tenantId: "CR", company: "OLO", bodegaId: "CR-OLO-CLIRO", bodegaIds: ["CR-OLO-CLIRO", "VNZ-OLO-SANDIEGO"] });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar almacén/ }));
    fireEvent.click(screen.getByText("San Diego"));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar almacén" }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const expected = { tenantId: "VNZ", company: "OLO", bodegaId: "VNZ-OLO-SANDIEGO", bodegaNombre: "San Diego" };
    expect(updateDoc.mock.calls[0][1]).toEqual(expected);
    expect(JSON.parse(localStorage.getItem("appolo_profile"))).toMatchObject(expected);
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("sin asignaciones ni scope no muestra el chip", () => {
    const { container } = renderSwitcher({});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("UserBodegasEditor", () => {
  it("asignar el primero lo deja activo; quitar el activo pasa a otro asignado", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <UserBodegasEditor catalog={CATALOG} value={{ bodegaIds: [], activeBodegaId: "" }} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Asignar San Diego/ }));
    expect(onChange).toHaveBeenLastCalledWith({ bodegaIds: ["VNZ-OLO-SANDIEGO"], activeBodegaId: "VNZ-OLO-SANDIEGO" });

    rerender(
      <UserBodegasEditor
        catalog={CATALOG}
        value={{ bodegaIds: ["VNZ-OLO-SANDIEGO", "CR-OLO-CLIRO"], activeBodegaId: "VNZ-OLO-SANDIEGO" }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Quitar San Diego/ }));
    expect(onChange).toHaveBeenLastCalledWith({ bodegaIds: ["CR-OLO-CLIRO"], activeBodegaId: "CR-OLO-CLIRO" });
  });

  it("en modo lectura muestra solo los asignados y sin controles", () => {
    render(
      <UserBodegasEditor catalog={CATALOG} value={{ bodegaIds: ["CR-OLO-ELCOCO"], activeBodegaId: "CR-OLO-ELCOCO" }} readOnly />
    );
    expect(screen.getByText("El Coco")).toBeInTheDocument();
    expect(screen.queryByText("San Diego")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
