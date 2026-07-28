// Feature: despachos-dev — pruebas de integración de realtime y forma de las
// consultas con un cliente Supabase SIMULADO.
//
// Cubren, mediante 1–3 ejemplos por comportamiento:
// - Apertura y cierre de canales realtime, sin suscripciones colgadas (7.1, 7.5).
// - Forma de las consultas del listado: filtros de scope, exclusión de
//   `eliminado`, orden `created_at desc`, límite 50 vía `.range(0,49)` (9.5, 9.6).
// - Degradación no bloqueante y reintento cada 15s; reconexión → "activo" (7.6, 7.7).
// - Detalle: canal `despacho-dev-actividad-<id>` y su limpieza al desmontar (7.4, 7.5).
//
// _Requirements: 7.1, 7.4, 7.5, 7.6, 7.7, 9.5, 9.6_

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Cliente Supabase simulado (hoisted para poder referenciarlo desde vi.mock).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const state = {
    /** @type {Array<{ table: string, calls: Array<{method:string,args:any[]}> }>} */
    queries: [],
    /** @type {Array<{ name: string, onCalls: any[][], statusCb: Function|null }>} */
    channels: [],
    /** @type {any[]} */
    removed: [],
    /** @type {Record<string, { data: any, error: any }>} */
    resultsByTable: {},
    defaultResult: { data: [], error: null },
    reset() {
      state.queries.length = 0;
      state.channels.length = 0;
      state.removed.length = 0;
      state.resultsByTable = {};
    },
  };

  // Constructor de consultas encadenable que registra cada llamada y resuelve
  // (es "thenable") con el resultado configurado para su tabla.
  function makeBuilder(table) {
    const calls = [];
    const builder = {
      table,
      calls,
      _record(method, args) {
        calls.push({ method, args });
        return builder;
      },
      select(...a) {
        return builder._record("select", a);
      },
      eq(...a) {
        return builder._record("eq", a);
      },
      is(...a) {
        return builder._record("is", a);
      },
      neq(...a) {
        return builder._record("neq", a);
      },
      order(...a) {
        return builder._record("order", a);
      },
      range(...a) {
        return builder._record("range", a);
      },
      maybeSingle(...a) {
        return builder._record("maybeSingle", a);
      },
      // Terminal: cualquier `await` sobre el builder resuelve con el resultado.
      then(onFulfilled, onRejected) {
        const result = state.resultsByTable[table] ?? state.defaultResult;
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const supabase = {
    from(table) {
      const b = makeBuilder(table);
      state.queries.push(b);
      return b;
    },
    channel(name) {
      const ch = {
        name,
        onCalls: [],
        statusCb: null,
        on(...a) {
          ch.onCalls.push(a);
          return ch; // encadenable
        },
        subscribe(cb) {
          ch.statusCb = cb; // el test conduce el callback de estado
          return ch;
        },
      };
      state.channels.push(ch);
      return ch;
    },
    removeChannel(ch) {
      state.removed.push(ch);
      return Promise.resolve({ error: null });
    },
  };

  return { state, supabase };
});

vi.mock("../../../../supabase", () => ({ supabase: h.supabase }));

// Importa el hook DESPUÉS de declarar el mock.
import { useDespachosDevData } from "./useDespachosDevData";
import { useDespachoDetail } from "./useDespachoDetail";

const SCOPE = { tenantId: "t1", company: "c1", bodegaId: "b1" };

/** Busca las llamadas registradas de un método sobre un builder. */
function callsOf(builder, method) {
  return builder.calls.filter((c) => c.method === method).map((c) => c.args);
}

/** Aplana varias iteraciones de microtasks dentro de act(). */
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  h.state.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDespachosDevData — realtime e integración", () => {
  it("abre el canal 'despachos-dev-list' al montar y lo libera al desmontar (7.1, 7.5)", async () => {
    h.state.resultsByTable["despacho_dev_estados"] = {
      data: [{ codigo: "creado", nombre: "Creado", orden: 1 }],
      error: null,
    };

    const { result, unmount } = renderHook(() => useDespachosDevData(SCOPE));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const listChannels = h.state.channels.filter(
      (c) => c.name === "despachos-dev-list",
    );
    expect(listChannels).toHaveLength(1);
    // Suscrito a postgres_changes.
    expect(listChannels[0].onCalls[0][0]).toBe("postgres_changes");

    const opened = listChannels[0];
    unmount();

    // Limpieza: el canal abierto se libera (sin suscripciones colgadas).
    expect(h.state.removed).toContain(opened);
  });

  it("construye la consulta del listado con scope, orden y límite 50 vía range (9.5, 9.6)", async () => {
    h.state.resultsByTable["despacho_dev_estados"] = {
      data: [
        { codigo: "creado", nombre: "Creado", orden: 1 },
        { codigo: "eliminado", nombre: "Eliminado", orden: 99 },
      ],
      error: null,
    };
    h.state.resultsByTable["despacho_dev_despachos"] = {
      data: [{ id: "d1", tenant_id: "t1", company: "c1", bodega_id: "b1" }],
      error: null,
    };

    const { result } = renderHook(() => useDespachosDevData(SCOPE));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Solo debe existir una consulta de despachos (el estado `eliminado` se excluye).
    const despachoQueries = h.state.queries.filter(
      (q) => q.table === "despacho_dev_despachos",
    );
    expect(despachoQueries).toHaveLength(1);

    const q = despachoQueries[0];

    // select("*")
    expect(callsOf(q, "select")).toEqual([["*"]]);

    // Filtros de scope + estado (aprovechan el índice compuesto).
    const eqArgs = callsOf(q, "eq");
    expect(eqArgs).toContainEqual(["tenant_id", "t1"]);
    expect(eqArgs).toContainEqual(["company", "c1"]);
    expect(eqArgs).toContainEqual(["bodega_id", "b1"]);
    expect(eqArgs).toContainEqual(["estado", "creado"]);
    // No se consulta el estado excluido.
    expect(eqArgs).not.toContainEqual(["estado", "eliminado"]);

    // Solo despachos activos.
    expect(callsOf(q, "is")).toContainEqual(["deleted_at", null]);
    expect(callsOf(q, "neq")).toContainEqual(["estado", "eliminado"]);

    // Orden descendente por created_at.
    expect(callsOf(q, "order")).toContainEqual([
      "created_at",
      { ascending: false },
    ]);

    // Límite de 50 por estado con paginación: range(0, 49).
    expect(callsOf(q, "range")).toContainEqual([0, 49]);
  });

  it("degrada a 'inactivo', reintenta a los 15s y vuelve a 'activo' al reconectar (7.6, 7.7)", async () => {
    vi.useFakeTimers();

    h.state.resultsByTable["despacho_dev_estados"] = {
      data: [{ codigo: "creado", nombre: "Creado", orden: 1 }],
      error: null,
    };

    let result;
    let unmount;
    act(() => {
      ({ result, unmount } = renderHook(() => useDespachosDevData(SCOPE)));
    });
    await flushMicrotasks();

    const first = h.state.channels.find((c) => c.name === "despachos-dev-list");
    expect(first).toBeTruthy();
    expect(typeof first.statusCb).toBe("function");

    // Estado no-SUBSCRIBED ⇒ degradación no bloqueante.
    act(() => {
      first.statusCb("CHANNEL_ERROR");
    });
    expect(result.current.realtimeStatus).toBe("inactivo");

    const channelsBefore = h.state.channels.length;

    // A los 15s se reintenta: se libera el canal anterior y se abre uno nuevo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(h.state.channels.length).toBe(channelsBefore + 1);
    expect(h.state.removed).toContain(first);

    // El nuevo canal se suscribe correctamente ⇒ vuelve a "activo".
    const latest = h.state.channels[h.state.channels.length - 1];
    expect(latest.name).toBe("despachos-dev-list");
    act(() => {
      latest.statusCb("SUBSCRIBED");
    });
    expect(result.current.realtimeStatus).toBe("activo");

    unmount();
  });
});

describe("useDespachoDetail — realtime del historial", () => {
  it("abre el canal 'despacho-dev-actividad-<id>' y lo libera al desmontar (7.4, 7.5)", async () => {
    h.state.resultsByTable["despacho_dev_despachos"] = {
      data: { id: "d1", chofer_id: null },
      error: null,
    };
    h.state.resultsByTable["despacho_dev_actividad"] = { data: [], error: null };

    const { result, unmount } = renderHook(() =>
      useDespachoDetail({ despachoId: "d1", ...SCOPE }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const detailChannels = h.state.channels.filter(
      (c) => c.name === "despacho-dev-actividad-d1",
    );
    expect(detailChannels).toHaveLength(1);
    expect(detailChannels[0].onCalls[0][0]).toBe("postgres_changes");

    const opened = detailChannels[0];
    unmount();

    expect(h.state.removed).toContain(opened);
  });
});
