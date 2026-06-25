// MRP Tarimas — constantes y catálogos del módulo.
//
// REGLA DE NEGOCIO CRÍTICA (no romper):
//   - `merma` es una UBICACIÓN OPERATIVA: su stock cuenta en el total global por marca.
//   - `descartes` (pallet_discards) es un REGISTRO ADMINISTRATIVO de ajustes negativos.
//   - Los ajustes negativos se registran en `pallet_discards`, NUNCA como ubicación `merma`,
//     y NUNCA crean stock en ninguna ubicación operativa.
//
// El módulo opera siempre bajo tenant_id = "CR" y company = "OLO".

export const MRP_TENANT_ID = "CR";
export const MRP_COMPANY = "OLO";

// Ubicaciones OPERATIVAS válidas del inventario (todas cuentan en el global).
export const PALLET_LOCATIONS = Object.freeze([
  "tienda",
  "almacen",
  "patio",
  "reparacion",
  "merma",
  "pend",
]);

// Tipos de movimiento del historial.
export const PALLET_MOVEMENT_TYPES = Object.freeze([
  "ajuste_positivo",
  "ajuste_negativo",
  "traslado",
]);

// Ubicación donde ingresan las tarimas en un ajuste positivo.
export const INTAKE_LOCATION = "pend";

// Motivos disponibles para ajustes y traslados.
export const PALLET_REASONS = Object.freeze(["Ingreso", "Devolución"]);

// Etiquetas legibles (UI) — mantener en español como el resto del sistema.
export const PALLET_LOCATION_LABELS = Object.freeze({
  tienda: "Tienda",
  almacen: "Almacén",
  patio: "Patio",
  reparacion: "Reparación",
  merma: "Merma",
  pend: "Pendiente",
});

export const PALLET_MOVEMENT_TYPE_LABELS = Object.freeze({
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  traslado: "Traslado",
});

// Helpers de validación de dominio.
export const isValidLocation = (l) => PALLET_LOCATIONS.includes(l);
export const isValidMovementType = (m) => PALLET_MOVEMENT_TYPES.includes(m);
