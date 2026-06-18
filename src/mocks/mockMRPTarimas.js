// Mock data for the MRP Tarimas module.

export const TIPOS_TARIMA = ["sencilla", "doble"];

export const ESTADOS_TARIMA = [
  "disponible",
  "en_uso",
  "dañada",
  "en_reparacion",
  "reparada",
  "descartada",
];

export const UBICACIONES = [
  "Bodega A",
  "Bodega B",
  "Bodega C",
  "Patio 1",
  "Patio 2",
  "Zona de carga",
  "Zona de descarga",
  "Taller",
];

export const TIPOS_DANO = [
  "Tabla rota",
  "Clavo salido",
  "Deformación estructural",
  "Humedad / pudrición",
  "Astillado grave",
  "Refuerzo suelto",
  "Marcado ilegible",
];

export const MATERIALES = [
  { id: "MAT-001", nombre: "Tablas de madera", sku: "TBL-120", unidad: "unidad", stock: 85, stockMinimo: 20, costoUnitario: 1200 },
  { id: "MAT-002", nombre: "Clavos 3\"", sku: "CLV-300", unidad: "kg", stock: 12, stockMinimo: 5, costoUnitario: 850 },
  { id: "MAT-003", nombre: "Tornillos 2.5\"", sku: "TRN-250", unidad: "caja", stock: 3, stockMinimo: 4, costoUnitario: 2400 },
  { id: "MAT-004", nombre: "Grapas industriales", sku: "GRP-100", unidad: "caja", stock: 7, stockMinimo: 3, costoUnitario: 1800 },
  { id: "MAT-005", nombre: "Pintura marcador", sku: "PNT-BLC", unidad: "galón", stock: 2, stockMinimo: 3, costoUnitario: 4500 },
  { id: "MAT-006", nombre: "Refuerzos metálicos", sku: "RFZ-MTL", unidad: "unidad", stock: 40, stockMinimo: 15, costoUnitario: 950 },
  { id: "MAT-007", nombre: "Lijas #80", sku: "LIJ-080", unidad: "pliego", stock: 25, stockMinimo: 10, costoUnitario: 350 },
  { id: "MAT-008", nombre: "Pegamento para madera", sku: "PGM-500", unidad: "litro", stock: 1, stockMinimo: 2, costoUnitario: 3200 },
];

export const RESPONSABLES = [
  "Carlos Méndez",
  "José Ramírez",
  "Luis Mora",
  "María Solano",
  "Roberto Jiménez",
];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function fmt(d) {
  return d.toISOString().split("T")[0];
}

// Generate 25 tarimas
export const TARIMAS = [
  { id: "TAR-001", tipo: "doble", estado: "disponible", ubicacion: "Bodega A", fechaIngreso: "2024-08-12", ultimoMovimiento: "2025-05-28", costoAcumulado: 0 },
  { id: "TAR-002", tipo: "sencilla", estado: "disponible", ubicacion: "Bodega A", fechaIngreso: "2024-07-03", ultimoMovimiento: "2025-06-01", costoAcumulado: 3600 },
  { id: "TAR-003", tipo: "doble", estado: "en_uso", ubicacion: "Zona de carga", fechaIngreso: "2024-09-15", ultimoMovimiento: "2025-06-05", costoAcumulado: 0 },
  { id: "TAR-004", tipo: "sencilla", estado: "dañada", ubicacion: "Patio 1", fechaIngreso: "2024-06-20", ultimoMovimiento: "2025-06-08", costoAcumulado: 1200 },
  { id: "TAR-005", tipo: "doble", estado: "en_reparacion", ubicacion: "Taller", fechaIngreso: "2024-05-10", ultimoMovimiento: "2025-06-09", costoAcumulado: 7800 },
  { id: "TAR-006", tipo: "sencilla", estado: "reparada", ubicacion: "Bodega B", fechaIngreso: "2024-10-01", ultimoMovimiento: "2025-06-04", costoAcumulado: 4200 },
  { id: "TAR-007", tipo: "doble", estado: "disponible", ubicacion: "Bodega C", fechaIngreso: "2024-11-22", ultimoMovimiento: "2025-05-30", costoAcumulado: 0 },
  { id: "TAR-008", tipo: "sencilla", estado: "en_uso", ubicacion: "Zona de descarga", fechaIngreso: "2024-04-18", ultimoMovimiento: "2025-06-07", costoAcumulado: 2400 },
  { id: "TAR-009", tipo: "doble", estado: "dañada", ubicacion: "Patio 2", fechaIngreso: "2024-08-30", ultimoMovimiento: "2025-06-06", costoAcumulado: 0 },
  { id: "TAR-010", tipo: "sencilla", estado: "descartada", ubicacion: "Bodega A", fechaIngreso: "2023-12-05", ultimoMovimiento: "2025-04-15", costoAcumulado: 12500 },
  { id: "TAR-011", tipo: "doble", estado: "disponible", ubicacion: "Bodega B", fechaIngreso: "2025-01-10", ultimoMovimiento: "2025-06-02", costoAcumulado: 0 },
  { id: "TAR-012", tipo: "sencilla", estado: "en_reparacion", ubicacion: "Taller", fechaIngreso: "2024-03-14", ultimoMovimiento: "2025-06-10", costoAcumulado: 5600 },
  { id: "TAR-013", tipo: "doble", estado: "disponible", ubicacion: "Patio 1", fechaIngreso: "2025-02-20", ultimoMovimiento: "2025-05-25", costoAcumulado: 1800 },
  { id: "TAR-014", tipo: "sencilla", estado: "en_uso", ubicacion: "Zona de carga", fechaIngreso: "2024-07-28", ultimoMovimiento: "2025-06-03", costoAcumulado: 0 },
  { id: "TAR-015", tipo: "doble", estado: "dañada", ubicacion: "Patio 2", fechaIngreso: "2024-12-12", ultimoMovimiento: "2025-06-09", costoAcumulado: 3200 },
  { id: "TAR-016", tipo: "sencilla", estado: "disponible", ubicacion: "Bodega C", fechaIngreso: "2025-03-05", ultimoMovimiento: "2025-06-01", costoAcumulado: 0 },
  { id: "TAR-017", tipo: "doble", estado: "reparada", ubicacion: "Bodega A", fechaIngreso: "2024-01-22", ultimoMovimiento: "2025-05-20", costoAcumulado: 9400 },
  { id: "TAR-018", tipo: "sencilla", estado: "en_uso", ubicacion: "Zona de descarga", fechaIngreso: "2024-09-08", ultimoMovimiento: "2025-06-06", costoAcumulado: 0 },
  { id: "TAR-019", tipo: "doble", estado: "disponible", ubicacion: "Bodega B", fechaIngreso: "2025-04-01", ultimoMovimiento: "2025-06-08", costoAcumulado: 0 },
  { id: "TAR-020", tipo: "sencilla", estado: "dañada", ubicacion: "Patio 1", fechaIngreso: "2024-06-15", ultimoMovimiento: "2025-06-10", costoAcumulado: 2800 },
  { id: "TAR-021", tipo: "doble", estado: "en_reparacion", ubicacion: "Taller", fechaIngreso: "2024-02-28", ultimoMovimiento: "2025-06-11", costoAcumulado: 6200 },
  { id: "TAR-022", tipo: "sencilla", estado: "disponible", ubicacion: "Bodega A", fechaIngreso: "2025-05-10", ultimoMovimiento: "2025-06-07", costoAcumulado: 0 },
  { id: "TAR-023", tipo: "doble", estado: "en_uso", ubicacion: "Zona de carga", fechaIngreso: "2024-10-20", ultimoMovimiento: "2025-06-04", costoAcumulado: 1500 },
  { id: "TAR-024", tipo: "sencilla", estado: "reparada", ubicacion: "Bodega C", fechaIngreso: "2024-04-05", ultimoMovimiento: "2025-05-28", costoAcumulado: 8100 },
  { id: "TAR-025", tipo: "doble", estado: "disponible", ubicacion: "Bodega B", fechaIngreso: "2025-01-30", ultimoMovimiento: "2025-06-09", costoAcumulado: 0 },
];

export const REPARACIONES = [
  { id: "REP-001", tarimaId: "TAR-002", tipoDano: "Tabla rota", materiales: [{ materialId: "MAT-001", cantidad: 2, costo: 2400 }], costoManoObra: 800, otrosGastos: 400, observaciones: "Reemplazo de tabla lateral derecha", fecha: "2025-03-15", responsable: "Carlos Méndez", estado: "completada" },
  { id: "REP-002", tarimaId: "TAR-005", tipoDano: "Deformación estructural", materiales: [{ materialId: "MAT-006", cantidad: 4, costo: 3800 }, { materialId: "MAT-003", cantidad: 1, costo: 2400 }], costoManoObra: 1200, otrosGastos: 400, observaciones: "Refuerzo de estructura completa", fecha: "2025-06-09", responsable: "José Ramírez", estado: "en_proceso" },
  { id: "REP-003", tarimaId: "TAR-006", tipoDano: "Clavo salido", materiales: [{ materialId: "MAT-002", cantidad: 0.5, costo: 425 }], costoManoObra: 600, otrosGastos: 0, observaciones: "Extracción y recolocación de clavos", fecha: "2025-05-20", responsable: "Luis Mora", estado: "completada" },
  { id: "REP-004", tarimaId: "TAR-010", tipoDano: "Humedad / pudrición", materiales: [{ materialId: "MAT-001", cantidad: 5, costo: 6000 }, { materialId: "MAT-008", cantidad: 0.5, costo: 1600 }], costoManoObra: 2500, otrosGastos: 800, observaciones: "Daño extenso por humedad, se intentó reparar pero se descartó", fecha: "2025-04-10", responsable: "Roberto Jiménez", estado: "completada" },
  { id: "REP-005", tarimaId: "TAR-012", tipoDano: "Astillado grave", materiales: [{ materialId: "MAT-007", cantidad: 3, costo: 1050 }, { materialId: "MAT-001", cantidad: 1, costo: 1200 }], costoManoObra: 900, otrosGastos: 200, observaciones: "Lijado profundo y reemplazo parcial", fecha: "2025-06-10", responsable: "María Solano", estado: "en_proceso" },
  { id: "REP-006", tarimaId: "TAR-017", tipoDano: "Refuerzo suelto", materiales: [{ materialId: "MAT-006", cantidad: 3, costo: 2850 }, { materialId: "MAT-002", cantidad: 1, costo: 850 }], costoManoObra: 1500, otrosGastos: 300, observaciones: "Refuerzos metálicos reemplazados", fecha: "2025-05-15", responsable: "Carlos Méndez", estado: "completada" },
  { id: "REP-007", tarimaId: "TAR-021", tipoDano: "Tabla rota", materiales: [{ materialId: "MAT-001", cantidad: 3, costo: 3600 }, { materialId: "MAT-004", cantidad: 1, costo: 1800 }], costoManoObra: 1000, otrosGastos: 0, observaciones: "Múltiples tablas dañadas por impacto", fecha: "2025-06-11", responsable: "José Ramírez", estado: "en_proceso" },
  { id: "REP-008", tarimaId: "TAR-024", tipoDano: "Marcado ilegible", materiales: [{ materialId: "MAT-005", cantidad: 0.25, costo: 1125 }, { materialId: "MAT-007", cantidad: 2, costo: 700 }], costoManoObra: 500, otrosGastos: 100, observaciones: "Re-marcado completo con plantilla", fecha: "2025-05-22", responsable: "Luis Mora", estado: "completada" },
  { id: "REP-009", tarimaId: "TAR-004", tipoDano: "Clavo salido", materiales: [{ materialId: "MAT-002", cantidad: 0.3, costo: 255 }], costoManoObra: 400, otrosGastos: 0, observaciones: "Pendiente de evaluación completa", fecha: "2025-06-08", responsable: "Roberto Jiménez", estado: "pendiente" },
  { id: "REP-010", tarimaId: "TAR-013", tipoDano: "Deformación estructural", materiales: [{ materialId: "MAT-006", cantidad: 2, costo: 1900 }], costoManoObra: 800, otrosGastos: 0, observaciones: "Refuerzo preventivo", fecha: "2025-04-02", responsable: "María Solano", estado: "completada" },
];

// Helper to compute KPIs from the mock data
export function computeMRPMetrics(tarimas, materiales) {
  const total = tarimas.length;
  const sencillas = tarimas.filter(t => t.tipo === "sencilla" && t.estado === "disponible").length;
  const dobles = tarimas.filter(t => t.tipo === "doble" && t.estado === "disponible").length;
  const enReparacion = tarimas.filter(t => t.estado === "en_reparacion").length;
  const danadas = tarimas.filter(t => t.estado === "dañada").length;
  const costoTotal = tarimas.reduce((acc, t) => acc + t.costoAcumulado, 0);
  const materialesDisponibles = materiales.filter(m => m.stock > m.stockMinimo).length;
  const alertasBajoInventario = materiales.filter(m => m.stock <= m.stockMinimo).length;

  return {
    total,
    sencillasDisponibles: sencillas,
    doblesDisponibles: dobles,
    enReparacion,
    danadas,
    costoTotal,
    materialesDisponibles,
    alertasBajoInventario,
  };
}
