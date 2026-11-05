import { describe, expect, it } from "vitest";

import {
  BODEGA_BIT2,
  PERMISO_PERSONAL,
  armarPersonal,
  estaDesactualizado,
  estadoPersona,
  mapPersona,
  presentesPorHora,
  respuestaPersonal,
  type DepsPersonal,
  type FilaPersonal,
} from "./personal";

const FECHA = "2026-11-05";
/** "HH:MM" del 05/11 en CR → ISO UTC como lo devuelve PostgREST. */
const t = (hhmm: string) => new Date(`${FECHA}T${hhmm}:00-06:00`).toISOString().replace("Z", "+00:00");
/** Hora actual: HH:MM del 05/11 en CR. */
const ahora = (hhmm: string) => new Date(`${FECHA}T${hhmm}:00-06:00`);

function fila(id: string, marcas: string[], extra: Partial<FilaPersonal> = {}): FilaPersonal {
  return {
    fecha: FECHA,
    id_employee: id,
    nombre: `PERSONA ${id}`,
    puesto: "ASISTENTE DE LOGISTICA",
    departamento: "CEDI",
    escala: "colaborador",
    coordinador: "YENDRY QUIEL VARGAS",
    gerente: "RICARDO PEREZ ARAYA",
    marcas: marcas.map(t),
    horario_entrada: "07:00",
    horario_salida: "17:30",
    ...extra,
  };
}

const SYNC_OK = (now: Date) => ({
  ultima_sync: new Date(now.getTime() - 30_000).toISOString(),
  marcas_hasta: new Date(now.getTime() - 10 * 60_000).toISOString(),
});

describe("ops-3d-snapshot · personal · acceso", () => {
  const deps = (over: Partial<DepsPersonal> = {}): DepsPersonal => ({
    autorizar: async () => ({ userId: "u", orgId: "o" }),
    bodega: async () => BODEGA_BIT2,
    filas: async () => [],
    sync: async () => null,
    ...over,
  });

  it("sin el permiso proceso3d.personal.view → 403 (y no lee datos)", async () => {
    let pidio = "";
    let leyo = false;
    const r = await respuestaPersonal(
      deps({
        autorizar: async (p) => {
          pidio = p;
          return { status: 403, error: `Se requiere el permiso ${p} en SRO.` };
        },
        filas: async () => {
          leyo = true;
          return [];
        },
      })
    );
    expect(pidio).toBe(PERMISO_PERSONAL);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Se requiere el permiso proceso3d.personal.view en SRO." });
    expect(leyo).toBe(false);
  });

  it("sesión inválida → 401", async () => {
    const r = await respuestaPersonal(deps({ autorizar: async () => ({ status: 401, error: "Sesión de SRO inválida o vencida." }) }));
    expect(r.status).toBe(401);
  });

  it("almacén que no es OLO (o sin bodega asociada) → 200 { disponible: false }", async () => {
    for (const bodega of ["CR-OLO-ELCOCO", "VNZ-OLO-SANDIEGO", null]) {
      const r = await respuestaPersonal(deps({ bodega: async () => bodega }));
      expect(r).toEqual({ status: 200, body: { disponible: false } });
    }
  });

  it("OLO → 200 con datos del día en CR", async () => {
    let pedido = "";
    const now = new Date("2026-11-06T03:00:00Z"); // 21:00 del 05/11 en CR
    const r = await respuestaPersonal(
      deps({
        filas: async (_b, fecha) => {
          pedido = fecha;
          return [fila("1", ["07:00"])];
        },
        sync: async () => SYNC_OK(now),
      }),
      now
    );
    expect(pedido).toBe(FECHA);
    expect(r.status).toBe(200);
    expect((r.body as any).disponible).toBe(true);
    expect((r.body as any).fecha).toBe(FECHA);
  });
});

describe("ops-3d-snapshot · personal · estado", () => {
  it("impar → en_sitio, sin salida", () => {
    const p = mapPersona(fila("1", ["06:56", "09:00", "09:29"]), ahora("10:00"));
    expect(p.estado).toBe("en_sitio");
    expect(p.salida).toBeNull();
    expect(p.entrada).toBe("2026-11-05T06:56:00-06:00");
    expect(p.marcas).toEqual(["06:56", "09:00", "09:29"]);
  });

  it("par antes de su salida programada (+30 min) → pausa, sin salida", () => {
    const f = fila("2", ["06:58", "09:58"]);
    expect(estadoPersona(f, ahora("10:10"))).toBe("pausa");
    expect(mapPersona(f, ahora("10:10")).salida).toBeNull();
    // 17:30 + 30 min de tolerancia: a las 17:59 sigue en pausa, a las 18:00 ya salió.
    expect(estadoPersona(f, ahora("17:59"))).toBe("pausa");
    expect(estadoPersona(f, ahora("18:00"))).toBe("salio");
  });

  it("par y ya pasó su horario → salio, salida = última marca", () => {
    const p = mapPersona(fila("3", ["05:15", "07:42"], { horario_entrada: "05:00", horario_salida: "06:30" }), ahora("10:00"));
    expect(p.estado).toBe("salio");
    expect(p.salida).toBe("2026-11-05T07:42:00-06:00");
  });

  it("par y sin horario → salio", () => {
    const p = mapPersona(fila("4", ["05:15", "07:42"], { horario_entrada: null, horario_salida: null }), ahora("08:00"));
    expect(p.estado).toBe("salio");
    expect(p.horario).toEqual({ entrada: null, salida: null });
    expect(p.tarde).toBe(false);
  });

  it("turno que cruza la medianoche: la salida programada es al día siguiente", () => {
    const f = fila("5", ["22:00", "23:00"], { horario_entrada: "22:00", horario_salida: "06:00" });
    expect(estadoPersona(f, new Date("2026-11-06T05:30:00Z"))).toBe("pausa"); // 23:30 CR
  });

  it("tarde = primera marca > horario_entrada + 5 min", () => {
    expect(mapPersona(fila("6", ["07:05"]), ahora("08:00")).tarde).toBe(false);
    expect(mapPersona(fila("7", ["07:06"]), ahora("08:00")).tarde).toBe(true);
    expect(mapPersona(fila("8", ["06:40"]), ahora("08:00")).tarde).toBe(false);
  });
});

describe("ops-3d-snapshot · personal · resumen y por hora", () => {
  it("cuenta en_sitio, en_pausa, salieron y por_escala (gerente siempre presente)", () => {
    const now = ahora("10:00");
    const body = armarPersonal(
      [
        fila("1", ["06:56", "09:00", "09:29"]), // en sitio
        fila("2", ["06:58", "09:58"]), // pausa
        fila("3", ["05:15", "07:42"], { horario_salida: "06:30", horario_entrada: "05:00" }), // salió
        fila("4", ["07:10"], { escala: "coordinador", coordinador: "EDWIN JESUS CARDENAS SAENZ" }), // en sitio
      ],
      SYNC_OK(now),
      FECHA,
      now
    );
    expect(body.resumen).toEqual({
      en_sitio: 2,
      en_pausa: 1,
      salieron: 1,
      por_escala: { gerente: 0, coordinador: 1, colaborador: 3 },
    });
    expect(body.desactualizado).toBe(false);
    expect(body.actualizado_at).toBe(body.ultima_sync);
    expect(body.ultima_sync).toBe("2026-11-05T09:59:30-06:00");
    expect(body.marcas_hasta).toBe("2026-11-05T09:50:00-06:00");
    // Agrupado: gerente → coordinador → escala → nombre.
    expect(body.personas.map((p) => p.id)).toEqual(["4", "1", "2", "3"]);
  });

  it("presentes_por_hora con entradas y salidas que cruzan horas", () => {
    const now = ahora("12:20");
    const horas = presentesPorHora(
      [
        fila("a", ["06:50", "09:00", "09:30"]), // 06–09 y 09:30→ahora: horas 6,7,8,9,10,11,12
        fila("b", ["07:59", "08:01"]), // un tramo que cruza de las 7 a las 8
        fila("c", ["10:00", "11:00"]), // termina justo a las 11:00: no cuenta en la hora 11
      ],
      FECHA,
      now
    );
    expect(horas).toHaveLength(24);
    expect(horas.slice(5, 14)).toEqual([0, 1, 2, 2, 1, 2, 1, 1, 0]);
    expect(horas.slice(13).every((n) => n === 0)).toBe(true); // horas futuras
  });

  it("la pausa no cuenta como presente en la hora de la pausa", () => {
    // 06:00–09:00 dentro, 09:00–10:30 en pausa, 10:30–11:00 dentro.
    const horas = presentesPorHora([fila("p", ["06:00", "09:00", "10:30", "11:00"])], FECHA, ahora("12:00"));
    expect(horas[9]).toBe(0);
    expect(horas[10]).toBe(1);
  });
});

describe("ops-3d-snapshot · personal · desactualizado", () => {
  it("sync de bit2-api con más de 5 min → true", () => {
    const now = ahora("10:00");
    expect(estaDesactualizado({ ultima_sync: new Date(now.getTime() - 6 * 60_000).toISOString(), marcas_hasta: now.toISOString() }, now)).toBe(true);
    expect(estaDesactualizado(null, now)).toBe(true);
  });

  it("marcas con más de 30 min de atraso dentro del horario operativo → true", () => {
    const now = ahora("15:48"); // caso real del 05/11: última descarga del reloj a las 11:11
    expect(estaDesactualizado({ ultima_sync: now.toISOString(), marcas_hasta: t("11:11") }, now)).toBe(true);
    expect(estaDesactualizado({ ultima_sync: now.toISOString(), marcas_hasta: t("15:20") }, now)).toBe(false);
  });

  it("fuera de 06:00–22:30 el atraso de marcas no cuenta", () => {
    const noche = new Date("2026-11-06T05:00:00Z"); // 23:00 CR
    expect(estaDesactualizado({ ultima_sync: noche.toISOString(), marcas_hasta: t("15:00") }, noche)).toBe(false);
    const madrugada = ahora("05:59");
    expect(estaDesactualizado({ ultima_sync: madrugada.toISOString(), marcas_hasta: null }, madrugada)).toBe(false);
  });
});

describe("ops-3d-snapshot · personal · privacidad", () => {
  it("cada persona trae solo las claves del contrato (sin cédula ni horas extra)", () => {
    const p = mapPersona({ ...fila("1", ["07:00"]), cedula: "123", codeEmployee: "123", overtime: 5 } as any, ahora("08:00"));
    expect(Object.keys(p).sort()).toEqual(
      ["coordinador", "departamento", "entrada", "escala", "estado", "gerente", "horario", "id", "marcas", "nombre", "puesto", "salida", "tarde"].sort()
    );
  });
});
