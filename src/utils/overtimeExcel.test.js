import ExcelJS from "exceljs";
import { downloadOvertimeXlsx, minutesToHours } from "./overtimeExcel";

describe("downloadOvertimeXlsx", () => {
  let blobs;

  beforeEach(() => {
    blobs = [];
    globalThis.URL.createObjectURL = vi.fn((blob) => {
      blobs.push(blob);
      return "blob:test";
    });
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("genera un .xlsx con título, meta, encabezados, filas y filtro", async () => {
    await downloadOvertimeXlsx({
      fileName: "horas-extra-prueba",
      sheets: [
        {
          name: "Aprobación",
          title: "Aprobación de horas extra",
          meta: [["Corte", "Corte 21 sep – 20 oct 2026"]],
          columns: [
            { header: "Empleado", key: "employee" },
            { header: "Horas (decimal)", key: "hours", numFmt: "0.00" },
          ],
          rows: [
            { employee: "Ana", hours: 1.5 },
            { employee: "Luis", hours: 2.25 },
          ],
        },
      ],
    });

    expect(blobs).toHaveLength(1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blobs[0].arrayBuffer());
    const ws = wb.getWorksheet("Aprobación");
    expect(ws.getCell("A1").value).toBe("Aprobación de horas extra");
    expect(ws.getCell("B2").value).toBe("Corte 21 sep – 20 oct 2026");
    expect(ws.getCell("A4").value).toBe("Empleado");
    expect(ws.getCell("A5").value).toBe("Ana");
    expect(ws.getCell("B6").value).toBe(2.25);
    expect(ws.getCell("B6").numFmt).toBe("0.00");
    expect(ws.autoFilter).toBeTruthy();
  });

  it("falla con mensaje claro si no hay filas", async () => {
    await expect(
      downloadOvertimeXlsx({
        fileName: "x",
        sheets: [{ name: "A", columns: [{ header: "H", key: "h" }], rows: [] }],
      })
    ).rejects.toThrow("No hay datos para exportar");
  });
});

describe("minutesToHours", () => {
  it("convierte a horas con 2 decimales", () => {
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(100)).toBe(1.67);
    expect(minutesToHours(null)).toBe(0);
  });
});
