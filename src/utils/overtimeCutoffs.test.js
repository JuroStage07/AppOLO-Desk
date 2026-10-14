import {
  cutoffPeriodFor,
  formatPeriodLabel,
  isInPeriod,
  isoDate,
  listCutoffPeriods,
  periodStatus,
  toLocalDate,
} from "./overtimeCutoffs";

const CROSS_MONTH = { startDay: 21, endDay: 20 };
const SAME_MONTH = { startDay: 1, endDay: 31 };

describe("toLocalDate", () => {
  it("parsea los formatos de registro", () => {
    expect(isoDate(toLocalDate("2026-10-14"))).toBe("2026-10-14");
    expect(isoDate(toLocalDate("14/10/2026"))).toBe("2026-10-14");
    expect(isoDate(toLocalDate("14-10-26"))).toBe("2026-10-14");
    expect(toLocalDate("basura")).toBeNull();
    expect(toLocalDate("")).toBeNull();
  });
});

describe("cutoffPeriodFor", () => {
  it("asigna al corte que cierra en la próxima ocurrencia de endDay", () => {
    const p = cutoffPeriodFor("2026-10-14", CROSS_MONTH);
    expect(isoDate(p.start)).toBe("2026-09-21");
    expect(isoDate(p.end)).toBe("2026-10-20");
    expect(p.key).toBe("2026-10-20");
  });

  it("el día de cierre pertenece a su corte y el siguiente al próximo", () => {
    expect(cutoffPeriodFor("2026-10-20", CROSS_MONTH).key).toBe("2026-10-20");
    expect(cutoffPeriodFor("2026-10-21", CROSS_MONTH).key).toBe("2026-11-20");
  });

  it("cruza de año", () => {
    const p = cutoffPeriodFor("2026-12-25", CROSS_MONTH);
    expect(isoDate(p.start)).toBe("2026-12-21");
    expect(isoDate(p.end)).toBe("2027-01-20");
    expect(p.label).toBe("21 dic 2026 – 20 ene 2027");
  });

  it("recorta endDay al último día del mes", () => {
    const p = cutoffPeriodFor("2026-02-10", SAME_MONTH);
    expect(isoDate(p.start)).toBe("2026-02-01");
    expect(isoDate(p.end)).toBe("2026-02-28");
  });

  it("devuelve null sin configuración o fecha inválida", () => {
    expect(cutoffPeriodFor("2026-10-14", null)).toBeNull();
    expect(cutoffPeriodFor("x", CROSS_MONTH)).toBeNull();
  });
});

describe("listCutoffPeriods", () => {
  it("lista del corte actual hacia atrás, sin huecos", () => {
    const list = listCutoffPeriods(CROSS_MONTH, { count: 3, today: new Date(2026, 9, 14) });
    expect(list.map((p) => p.key)).toEqual(["2026-10-20", "2026-09-20", "2026-08-20"]);
    expect(isoDate(list[1].start)).toBe("2026-08-21");
  });

  it("vacía si no hay endDay", () => {
    expect(listCutoffPeriods({})).toEqual([]);
  });
});

describe("periodStatus / isInPeriod", () => {
  const today = new Date(2026, 9, 14);
  const [current, previous] = listCutoffPeriods(CROSS_MONTH, { count: 2, today });

  it("clasifica cortes", () => {
    expect(periodStatus(current, current)).toBe("current");
    expect(periodStatus(previous, current)).toBe("closed");
    expect(periodStatus(cutoffPeriodFor("2026-11-05", CROSS_MONTH), current)).toBe("future");
  });

  it("detecta pertenencia inclusiva", () => {
    expect(isInPeriod("2026-09-21", current)).toBe(true);
    expect(isInPeriod("2026-10-20", current)).toBe(true);
    expect(isInPeriod("2026-09-20", current)).toBe(false);
  });

  it("formatea etiquetas", () => {
    expect(formatPeriodLabel(current)).toBe("21 sep – 20 oct 2026");
  });
});
