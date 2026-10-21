import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider, ToastProvider } from "../../components/ui";
import { AuthCtx } from "../../auth/AuthProvider";
import OrgCatalogPage from "./OrgCatalogPage";

vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));

const AUTH = {
  user: { uid: "u1", email: "dev@ologistics.com" },
  profile: { role: "dev", tenantId: "CR", company: "OLO", bodegaId: "CR-OLO-CLIRO", permisos: {} },
  permisos: {},
  role: "dev",
  loading: false,
};

const fetchOrgCatalog = vi.fn();
const saveOrgCatalog = vi.fn();
vi.mock("../../services/orgCatalog", () => ({
  fetchOrgCatalog: (...a) => fetchOrgCatalog(...a),
  saveOrgCatalog: (...a) => saveOrgCatalog(...a),
}));

const CATALOG = {
  tenants: [
    { id: "CR", name: "Costa Rica", active: true },
    { id: "VNZ", name: "Venezuela", active: true },
  ],
  companies: [{ id: "OLO", name: "OLO", active: true }],
  bodegas: [
    { id: "CR-OLO-CLIRO", tenantId: "CR", companyId: "OLO", code: "CLIRO", name: "CLIRO", sroWarehouseId: null, active: true },
    { id: "VNZ-OLO-SANDIEGO", tenantId: "VNZ", companyId: "OLO", code: "SANDIEGO", name: "San Diego", sroWarehouseId: null, active: false },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthCtx.Provider value={AUTH}>
        <ToastProvider>
          <ConfirmProvider>
            <OrgCatalogPage />
          </ConfirmProvider>
        </ToastProvider>
      </AuthCtx.Provider>
    </MemoryRouter>
  );
}

describe("OrgCatalogPage", () => {
  beforeEach(() => {
    fetchOrgCatalog.mockResolvedValue(CATALOG);
    saveOrgCatalog.mockResolvedValue({});
  });

  it("muestra países, compañías y almacenes con su estado", async () => {
    renderPage();
    expect(await screen.findByText("CR-OLO-CLIRO")).toBeInTheDocument();
    expect(screen.getByText("VNZ-OLO-SANDIEGO")).toBeInTheDocument();
    expect(screen.getAllByText("Costa Rica").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactivo").length).toBe(1);
  });

  it("filtra almacenes por país", async () => {
    renderPage();
    await screen.findByText("CR-OLO-CLIRO");
    fireEvent.change(screen.getByLabelText("Filtrar por país"), { target: { value: "VNZ" } });
    expect(screen.queryByText("CR-OLO-CLIRO")).not.toBeInTheDocument();
    expect(screen.getByText("VNZ-OLO-SANDIEGO")).toBeInTheDocument();
  });

  it("crea un almacén y muestra el ID que se va a generar", async () => {
    renderPage();
    await screen.findByText("CR-OLO-CLIRO");
    fireEvent.click(screen.getByRole("button", { name: /Nuevo almacén/ }));
    const dialog = await screen.findByRole("dialog");
    const [codeInput, nameInput] = within(dialog).getAllByPlaceholderText("CLIRO");
    fireEvent.change(codeInput, { target: { value: "san josé" } });
    fireEvent.change(nameInput, { target: { value: "San José" } });
    expect(within(dialog).getByText(/ID del almacén: CR-OLO-SANJOSE/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear" }));
    await waitFor(() =>
      expect(saveOrgCatalog).toHaveBeenCalledWith(
        "bodega",
        "create",
        expect.objectContaining({ tenantId: "CR", companyId: "OLO", code: "SANJOSE", name: "San José" })
      )
    );
  });
});
