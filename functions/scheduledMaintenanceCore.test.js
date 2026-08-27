/**
 * Casos límite del mantenimiento programado (lógica pura del job de backend).
 */
import { describe, expect, it } from "vitest";

import {
  ALERT_WINDOWS,
  buildNotificationId,
  buildProfileIndex,
  businessToday,
  daysBetweenIso,
  deadlineAlertTexts,
  isMantenimientoProfile,
  isValidIsoDate,
  monthlySummaryTexts,
  profileMatchesOtScope,
  resolveRecipientUids,
  selectDeadlineAlertTargets,
  selectDueOts,
  selectMonthlySummaryTargets,
} from "./scheduledMaintenanceCore.js";

const SCOPE = { tenantId: "CR", company: "OLO", bodegaId: "cliro" };

function makeOt(overrides = {}) {
  return {
    id: "ot1",
    nombreOT: "Cambio de filtros HVAC",
    NroSolicitud: "SOL-OT-1",
    OTState: "Solicitada",
    scheduledMaintenance: true,
    scheduledDate: "2026-09-10",
    createdBy: "creador",
    responsableUid: "resp",
    responsablesUids: ["resp"],
    responsablesNombres: ["Resp"],
    ...SCOPE,
    ...overrides,
  };
}

const PROFILES = buildProfileIndex([
  { uid: "creador", data: { ...SCOPE, role: "operativo", permisos: {} } },
  { uid: "resp", data: { ...SCOPE, role: "operativo", permisos: { mantenimiento: true } } },
  { uid: "jefeMant", data: { ...SCOPE, role: "operativo", permisos: { mantenimiento: true } } },
  { uid: "admin", data: { ...SCOPE, role: "administrativo", permisos: {} } },
  { uid: "ajeno", data: { tenantId: "VNZ", company: "OLO", bodegaId: "sandiego", role: "administrativo" } },
  { uid: "inactivo", data: { ...SCOPE, role: "administrativo", active: false } },
]);

describe("fechas de negocio", () => {
  it("resuelve el día con offset de negocio, no en UTC", () => {
    // 2026-09-11T03:00Z sigue siendo 10/09 en Costa Rica (UTC−6).
    expect(businessToday(Date.parse("2026-09-11T03:00:00Z"))).toBe("2026-09-10");
    expect(businessToday(Date.parse("2026-09-11T06:00:00Z"))).toBe("2026-09-11");
  });

  it("rechaza fechas inexistentes y formatos ajenos a ISO", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("10/09/2026")).toBe(false);
    expect(isValidIsoDate("2026-09-10")).toBe(true);
  });

  it("cuenta días calendario cruzando meses y años", () => {
    expect(daysBetweenIso("2026-09-10", "2026-09-25")).toBe(15);
    expect(daysBetweenIso("2026-12-28", "2027-01-04")).toBe(7);
    expect(daysBetweenIso("2026-09-10", "2026-09-09")).toBe(-1);
    expect(daysBetweenIso("nope", "2026-09-09")).toBeNull();
  });
});

describe("activación por deadline", () => {
  const today = "2026-09-10";

  it("activa la OT cuando el deadline es hoy o ya pasó", () => {
    const ots = [
      makeOt({ id: "hoy", scheduledDate: today }),
      makeOt({ id: "vencida", scheduledDate: "2026-09-01" }),
      makeOt({ id: "futura", scheduledDate: "2026-09-11" }),
    ];
    expect(selectDueOts(ots, today).map((o) => o.id)).toEqual(["hoy", "vencida"]);
  });

  it("no toca OTs que ya salieron de «Solicitada»", () => {
    const ots = [
      makeOt({ id: "enProceso", scheduledDate: today, OTState: "En proceso" }),
      makeOt({ id: "finalizada", scheduledDate: today, OTState: "Finalizada" }),
    ];
    expect(selectDueOts(ots, today)).toEqual([]);
  });

  it("ignora OTs con deadline inválido en lugar de activarlas", () => {
    expect(selectDueOts([makeOt({ scheduledDate: "" })], today)).toEqual([]);
  });
});

describe("avisos de proximidad", () => {
  const today = "2026-09-10";

  it("emite solo en las ventanas de 15, 7 y 1 día", () => {
    for (const days of ALERT_WINDOWS) {
      const deadline = days === 15 ? "2026-09-25" : days === 7 ? "2026-09-17" : "2026-09-11";
      const targets = selectDeadlineAlertTargets([makeOt({ scheduledDate: deadline })], PROFILES, today);
      expect(targets.length).toBeGreaterThan(0);
      expect(targets[0].data.metadata.daysLeft).toBe(days);
    }
  });

  it("no emite en días fuera de las ventanas ni el mismo día del deadline", () => {
    for (const deadline of ["2026-09-10", "2026-09-12", "2026-09-20", "2026-09-01"]) {
      expect(selectDeadlineAlertTargets([makeOt({ scheduledDate: deadline })], PROFILES, today)).toEqual([]);
    }
  });

  it("no genera avisos retroactivos para una OT creada dentro de la ventana", () => {
    // OT creada hoy con deadline a 5 días: 15 y 7 ya pasaron, no se emiten.
    const targets = selectDeadlineAlertTargets([makeOt({ scheduledDate: "2026-09-15" })], PROFILES, today);
    expect(targets).toEqual([]);
  });

  it("nunca avisa sobre una OT finalizada", () => {
    const ots = [makeOt({ scheduledDate: "2026-09-11", OTState: "Finalizada" })];
    expect(selectDeadlineAlertTargets(ots, PROFILES, today)).toEqual([]);
  });

  it("usa los textos pedidos para cada ventana", () => {
    expect(deadlineAlertTexts(15, "Cambio de filtros HVAC").message).toBe(
      'Faltan 15 días para el mantenimiento "Cambio de filtros HVAC".'
    );
    expect(deadlineAlertTexts(7, "Cambio de filtros HVAC").message).toBe(
      'Falta 1 semana para el mantenimiento "Cambio de filtros HVAC".'
    );
    expect(deadlineAlertTexts(1, "Cambio de filtros HVAC").message).toBe(
      'Mañana corresponde realizar el mantenimiento "Cambio de filtros HVAC".'
    );
  });

  it("es idempotente: mismos datos ⇒ mismos IDs de notificación", () => {
    const ots = [makeOt({ scheduledDate: "2026-09-11" })];
    const first = selectDeadlineAlertTargets(ots, PROFILES, today).map((t) => t.notificationId);
    const second = selectDeadlineAlertTargets(ots, PROFILES, today).map((t) => t.notificationId);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it("reprogramar el deadline genera IDs nuevos sin reusar los del calendario viejo", () => {
    const before = selectDeadlineAlertTargets([makeOt({ scheduledDate: "2026-09-11" })], PROFILES, today);
    const after = selectDeadlineAlertTargets([makeOt({ scheduledDate: "2026-09-25" })], PROFILES, today);
    const beforeIds = new Set(before.map((t) => t.notificationId));
    expect(after.every((t) => !beforeIds.has(t.notificationId))).toBe(true);
  });

  it("sanea los IDs para que sean válidos como document id de Firestore", () => {
    const id = buildNotificationId(["smm", "CR|OLO|el coco", "2026-09", "uid/1"]);
    expect(id).not.toMatch(/[/|\s]/);
  });
});

describe("destinatarios", () => {
  it("incluye creador, responsables y personal con permiso de mantenimiento", () => {
    const uids = resolveRecipientUids(makeOt(), PROFILES);
    expect([...uids].sort()).toEqual(["admin", "creador", "jefeMant", "resp"]);
  });

  it("entrega una sola notificación a quien cae en varios grupos", () => {
    // El creador es también el responsable y tiene permiso de mantenimiento.
    const ot = makeOt({ createdBy: "resp", responsableUid: "resp", responsablesUids: ["resp"] });
    const uids = [...resolveRecipientUids(ot, PROFILES)];
    expect(uids.filter((u) => u === "resp")).toHaveLength(1);
  });

  it("excluye perfiles de otro scope y perfiles inactivos", () => {
    const uids = resolveRecipientUids(makeOt(), PROFILES);
    expect(uids.has("ajeno")).toBe(false);
    expect(uids.has("inactivo")).toBe(false);
  });

  it("no crea destinatarios para uids sin perfil", () => {
    const uids = resolveRecipientUids(makeOt({ createdBy: "fantasma", responsablesUids: [], responsableUid: "" }), PROFILES);
    expect(uids.has("fantasma")).toBe(false);
  });

  it("reconoce el permiso de mantenimiento igual que las reglas de Firestore", () => {
    expect(isMantenimientoProfile({ role: "dev" })).toBe(true);
    expect(isMantenimientoProfile({ role: "administrativo" })).toBe(true);
    expect(isMantenimientoProfile({ role: "operativo", permisos: { mantenimiento: true } })).toBe(true);
    expect(isMantenimientoProfile({ role: "operativo", permisos: { despacho: true } })).toBe(false);
    expect(isMantenimientoProfile({ role: "dev", active: false })).toBe(false);
  });

  it("tolera documentos legados sin scope", () => {
    expect(profileMatchesOtScope({ role: "dev" }, makeOt())).toBe(true);
    expect(profileMatchesOtScope({ ...SCOPE }, { nombreOT: "legacy" })).toBe(true);
  });
});

describe("resumen mensual", () => {
  const today = "2026-09-10";

  it("cuenta las OTs del mes y expone sus nombres", () => {
    const ots = [
      makeOt({ id: "a", nombreOT: "Filtros HVAC", scheduledDate: "2026-09-05" }),
      makeOt({ id: "b", nombreOT: "Engrase de racks", scheduledDate: "2026-09-20" }),
      makeOt({ id: "c", nombreOT: "Mes siguiente", scheduledDate: "2026-10-02" }),
    ];
    const targets = selectMonthlySummaryTargets(ots, PROFILES, today);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].data.title).toBe("Mantenimientos programados este mes: 2");
    expect(targets[0].data.metadata.ots.map((o) => o.nombreOT)).toEqual([
      "Filtros HVAC",
      "Engrase de racks",
    ]);
  });

  it("emite un único resumen por usuario, mes y scope", () => {
    const ots = [
      makeOt({ id: "a", scheduledDate: "2026-09-05" }),
      makeOt({ id: "b", scheduledDate: "2026-09-20" }),
    ];
    const ids = selectMonthlySummaryTargets(ots, PROFILES, today).map((t) => t.notificationId);
    expect(new Set(ids).size).toBe(ids.length);
    const perUser = selectMonthlySummaryTargets(ots, PROFILES, today).filter(
      (t) => t.data.targetUserId === "resp"
    );
    expect(perUser).toHaveLength(1);
  });

  it("separa los resúmenes por scope", () => {
    const ots = [
      makeOt({ id: "a", scheduledDate: "2026-09-05" }),
      makeOt({ id: "b", scheduledDate: "2026-09-06", tenantId: "VNZ", company: "OLO", bodegaId: "sandiego" }),
    ];
    const scopes = new Set(
      selectMonthlySummaryTargets(ots, PROFILES, today).map((t) => t.notificationId.split("~")[1])
    );
    expect(scopes.size).toBe(2);
  });

  it("no emite nada si el mes no tiene mantenimientos programados", () => {
    const ots = [makeOt({ scheduledDate: "2026-11-02" })];
    expect(selectMonthlySummaryTargets(ots, PROFILES, today)).toEqual([]);
  });

  it("resume la lista cuando hay muchas OTs", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    expect(monthlySummaryTexts(7, names).message).toContain("y 2 más");
  });
});
