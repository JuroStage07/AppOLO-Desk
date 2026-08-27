/**
 * Helpers de mantenimiento programado usados por el frontend (formulario, chips
 * de deadline y filtro del tablero).
 */
import { describe, expect, it } from "vitest";

import {
  SCHEDULED_ALERT_WINDOWS,
  businessMonth,
  businessToday,
  daysBetweenIso,
  daysUntilDeadline,
  deadlineLabel,
  isDeadlineReached,
  isScheduledMaintenanceOt,
  isValidIsoDate,
  missedAlertWindows,
  validateScheduledOtDraft,
} from "./scheduledMaintenance";

/** 2026-09-10, media mañana en hora de negocio. */
const NOW = Date.parse("2026-09-10T15:00:00Z");

function draft(overrides = {}) {
  return {
    nombreOT: "Cambio de filtros HVAC",
    descripcionOT: "Reemplazar los cuatro filtros del chiller.",
    scheduledDate: "2026-10-01",
    responsables: [{ uid: "u1", displayName: "Ana" }],
    subtareas: [{ title: "Desmontar tapa" }],
    ...overrides,
  };
}

describe("identificación de OTs programadas", () => {
  it("distingue una OT programada de una convencional", () => {
    expect(isScheduledMaintenanceOt({ scheduledMaintenance: true })).toBe(true);
    expect(isScheduledMaintenanceOt({ scheduledMaintenance: false })).toBe(false);
    // Compatibilidad: las OTs existentes no tienen el campo.
    expect(isScheduledMaintenanceOt({ nombreOT: "OT normal" })).toBe(false);
    expect(isScheduledMaintenanceOt(null)).toBe(false);
    // Un valor truthy que no sea el booleano no la convierte en programada.
    expect(isScheduledMaintenanceOt({ scheduledMaintenance: "true" })).toBe(false);
  });
});

describe("fechas de negocio", () => {
  it("usa el offset de negocio y no la hora UTC para decidir el día", () => {
    expect(businessToday(Date.parse("2026-09-11T03:00:00Z"))).toBe("2026-09-10");
    expect(businessToday(Date.parse("2026-09-11T06:00:00Z"))).toBe("2026-09-11");
  });

  it("acepta un Date además de milisegundos", () => {
    expect(businessToday(new Date("2026-09-11T06:00:00Z"))).toBe("2026-09-11");
  });

  it("expone el mes de negocio", () => {
    expect(businessMonth(NOW)).toBe("2026-09");
  });

  it("valida el formato y la existencia real de la fecha", () => {
    expect(isValidIsoDate("2026-09-10")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 no es bisiesto
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-9-10")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
  });

  it("cuenta días calendario y devuelve null ante datos inválidos", () => {
    expect(daysBetweenIso("2026-09-10", "2026-09-25")).toBe(15);
    expect(daysBetweenIso("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetweenIso("2026-09-10", "basura")).toBeNull();
  });
});

describe("estado del deadline", () => {
  it("calcula los días restantes desde la fecha de negocio", () => {
    expect(daysUntilDeadline("2026-09-25", NOW)).toBe(15);
    expect(daysUntilDeadline("2026-09-11", NOW)).toBe(1);
    expect(daysUntilDeadline("2026-09-10", NOW)).toBe(0);
    expect(daysUntilDeadline("2026-09-08", NOW)).toBe(-2);
  });

  it("marca el deadline como alcanzado el mismo día y después", () => {
    expect(isDeadlineReached("2026-09-11", NOW)).toBe(false);
    expect(isDeadlineReached("2026-09-10", NOW)).toBe(true);
    expect(isDeadlineReached("2026-09-01", NOW)).toBe(true);
  });

  it("etiqueta el deadline para los chips de la UI", () => {
    expect(deadlineLabel("2026-09-25", NOW)).toBe("Faltan 15 días");
    expect(deadlineLabel("2026-09-11", NOW)).toBe("Falta 1 día");
    expect(deadlineLabel("2026-09-10", NOW)).toBe("Vence hoy");
    expect(deadlineLabel("2026-09-08", NOW)).toBe("Vencido hace 2 d");
    expect(deadlineLabel("", NOW)).toBe("");
  });

  it("informa qué ventanas de aviso ya no aplican", () => {
    // Creada con 20 días: se van a emitir las tres.
    expect(missedAlertWindows("2026-09-30", NOW)).toEqual([]);
    // Con 10 días la ventana de 15 ya pasó.
    expect(missedAlertWindows("2026-09-20", NOW)).toEqual([15]);
    // Con 5 días quedan 15 y 7 fuera.
    expect(missedAlertWindows("2026-09-15", NOW)).toEqual([15, 7]);
    // El día anterior solo aplica el aviso de 1 día.
    expect(missedAlertWindows("2026-09-11", NOW)).toEqual([15, 7]);
    // El mismo día del deadline no queda ninguna ventana.
    expect(missedAlertWindows("2026-09-10", NOW)).toEqual(SCHEDULED_ALERT_WINDOWS);
  });
});

describe("validación del borrador", () => {
  it("acepta un borrador completo", () => {
    expect(validateScheduledOtDraft(draft(), NOW)).toEqual({});
  });

  it("exige responsable", () => {
    expect(validateScheduledOtDraft(draft({ responsables: [] }), NOW)).toHaveProperty(
      "responsables"
    );
    // Un responsable sin uid no cuenta.
    expect(
      validateScheduledOtDraft(draft({ responsables: [{ displayName: "Ana" }] }), NOW)
    ).toHaveProperty("responsables");
  });

  it("exige deadline válido y no permite fechas pasadas", () => {
    expect(validateScheduledOtDraft(draft({ scheduledDate: "" }), NOW)).toHaveProperty(
      "scheduledDate"
    );
    expect(
      validateScheduledOtDraft(draft({ scheduledDate: "2026-09-09" }), NOW)
    ).toHaveProperty("scheduledDate");
    // El mismo día del deadline es válido: el job la activa en su corrida.
    expect(
      validateScheduledOtDraft(draft({ scheduledDate: "2026-09-10" }), NOW)
    ).not.toHaveProperty("scheduledDate");
  });

  it("exige al menos una subtarea", () => {
    expect(validateScheduledOtDraft(draft({ subtareas: [] }), NOW)).toHaveProperty(
      "subtareas"
    );
    expect(
      validateScheduledOtDraft(draft({ subtareas: [{ title: "   " }] }), NOW)
    ).toHaveProperty("subtareas");
  });

  it("exige nombre y descripción", () => {
    const errors = validateScheduledOtDraft(
      draft({ nombreOT: "  ", descripcionOT: "" }),
      NOW
    );
    expect(errors).toHaveProperty("nombreOT");
    expect(errors).toHaveProperty("descripcionOT");
  });

  it("reporta todos los faltantes de una sola vez", () => {
    const errors = validateScheduledOtDraft({}, NOW);
    expect(Object.keys(errors).sort()).toEqual([
      "descripcionOT",
      "nombreOT",
      "responsables",
      "scheduledDate",
      "subtareas",
    ]);
  });
});
