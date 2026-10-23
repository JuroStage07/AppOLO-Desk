import { describe, expect, it } from "vitest";

import { shouldAdvance, syncAcciones, targetCodeFor } from "./sroSyncCore";

const ORDER = { PENDING: 1, CONFIRMED: 2, ARRIVED_PENDING_UNLOAD: 3, IN_PROGRESS: 4, PENDING_DISCHARGE: 5, UNLOADING: 7, DISCHARGED: 8, DISPATCHED: 9, CANCELLED: 10, NO_SHOW: 12 };
const IDS = Object.fromEntries(Object.keys(ORDER).map((c) => [c, `id-${c}`]));

function fakeClient(reservations) {
  const patches = [];
  return {
    patches,
    getStatuses: async () => ({
      byCode: IDS,
      codeById: Object.fromEntries(Object.entries(IDS).map(([c, id]) => [id, c])),
      orderByCode: ORDER,
    }),
    getReservations: async (ids) =>
      Object.fromEntries(ids.filter((id) => reservations[id]).map((id) => [id, { id, ...reservations[id] }])),
    patchStatus: async (id, statusId) => {
      patches.push([id, statusId]);
      return { ok: true, status: 200, body: {} };
    },
  };
}

describe("sroSyncCore", () => {
  it("destino según la fase de la descarga", () => {
    expect(targetCodeFor({ reservaId: "r" })).toBe(null);
    expect(targetCodeFor({ reservaId: "r", startedAt: 1 })).toBe("UNLOADING");
    expect(targetCodeFor({ reservaId: "r", startedAt: 1, completedAt: 2 })).toBe("DISCHARGED");
    expect(targetCodeFor({ startedAt: 1, completedAt: 2 })).toBe(null);
  });

  it("solo avanza, nunca regresa", () => {
    expect(shouldAdvance("UNLOADING", "DISCHARGED", ORDER)).toBe(true);
    expect(shouldAdvance("PENDING_DISCHARGE", "UNLOADING", ORDER)).toBe(true);
    expect(shouldAdvance("DISPATCHED", "DISCHARGED", ORDER)).toBe(false);
    expect(shouldAdvance("DISCHARGED", "UNLOADING", ORDER)).toBe(false);
    expect(shouldAdvance("DISCHARGED", "DISCHARGED", ORDER)).toBe(false);
  });

  it("No arribó se corrige; cancelada no se toca", () => {
    expect(shouldAdvance("NO_SHOW", "DISCHARGED", ORDER)).toBe(true);
    expect(shouldAdvance("CANCELLED", "DISCHARGED", ORDER)).toBe(false);
  });

  it("caso 5fa8305c: finalizada en AppOLO y SRO en Descargando → Descargado", async () => {
    const c = fakeClient({ r1: { status_id: IDS.UNLOADING, is_cancelled: false } });
    const out = await syncAcciones(c, [{ id: "a1", reservaId: "r1", startedAt: 1, completedAt: 2 }]);
    expect(c.patches).toEqual([["r1", IDS.DISCHARGED]]);
    expect(out[0]).toMatchObject({ from: "UNLOADING", to: "DISCHARGED", result: "actualizada" });
  });

  it("no llama a SRO si ya está al día o más adelante", async () => {
    const c = fakeClient({
      r1: { status_id: IDS.DISCHARGED, is_cancelled: false },
      r2: { status_id: IDS.DISPATCHED, is_cancelled: false },
      r3: { status_id: IDS.UNLOADING, is_cancelled: true },
    });
    const out = await syncAcciones(c, [
      { id: "a1", reservaId: "r1", completedAt: 1 },
      { id: "a2", reservaId: "r2", completedAt: 1 },
      { id: "a3", reservaId: "r3", completedAt: 1 },
    ]);
    expect(c.patches).toEqual([]);
    expect(out.map((o) => o.result)).toEqual(["al_dia", "al_dia", "al_dia"]);
  });

  it("varias descargas de la misma reserva: gana la más avanzada", async () => {
    const c = fakeClient({ r1: { status_id: IDS.PENDING_DISCHARGE, is_cancelled: false } });
    await syncAcciones(c, [
      { id: "a1", reservaId: "r1", startedAt: 1, completedAt: 2 },
      { id: "a2", reservaId: "r1", startedAt: 3 },
    ]);
    expect(c.patches).toEqual([["r1", IDS.DISCHARGED]]);
  });
});
