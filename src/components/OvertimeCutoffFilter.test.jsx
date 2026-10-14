import { fireEvent, render, screen } from "@testing-library/react";
import OvertimeCutoffFilter, { CutoffTag } from "./OvertimeCutoffFilter";
import OvertimeSheetTable from "./OvertimeSheetTable";
import { ALL_PERIODS, CURRENT_PERIOD, listCutoffPeriods } from "../utils/overtimeCutoffs";

const periods = listCutoffPeriods({ startDay: 21, endDay: 20 }, { count: 3, today: new Date(2026, 9, 14) });

describe("OvertimeCutoffFilter", () => {
  it("lista el corte actual, los anteriores y 'todos'", () => {
    const onChange = vi.fn();
    render(
      <OvertimeCutoffFilter periods={periods} value={CURRENT_PERIOD} onChange={onChange} />
    );
    const select = screen.getByRole("combobox");
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels[0]).toBe("Corte actual · 21 sep – 20 oct 2026");
    expect(labels[1]).toBe("21 ago – 20 sep 2026");
    expect(labels[labels.length - 1]).toContain("Todos los cortes");

    fireEvent.change(select, { target: { value: ALL_PERIODS } });
    expect(onChange).toHaveBeenCalledWith(ALL_PERIODS);
  });

  it("muestra el conteo de atrasadas y activa el filtro", () => {
    const onLate = vi.fn();
    render(
      <OvertimeCutoffFilter
        periods={periods}
        value={CURRENT_PERIOD}
        onChange={() => {}}
        onlyLate={false}
        onOnlyLateChange={onLate}
        lateCount={4}
      />
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onLate).toHaveBeenCalledWith(true);
  });

  it("CutoffTag marca atrasada", () => {
    render(<CutoffTag period={periods[1]} late />);
    expect(screen.getByText("Corte 21 ago – 20 sep 2026")).toBeInTheDocument();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
  });
});

describe("OvertimeSheetTable", () => {
  it("renderiza encabezados, número de fila y celdas", () => {
    render(
      <OvertimeSheetTable
        columns={[
          { header: "Empleado", key: "name" },
          { header: "Horas", key: "h", align: "right" },
        ]}
        rows={[
          { name: "Ana", h: 1.5 },
          { name: "Luis", h: 2 },
        ]}
      />
    );
    expect(screen.getByText("Empleado")).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});
