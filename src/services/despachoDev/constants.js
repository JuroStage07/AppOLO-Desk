// Boletas de salida — constantes compartidas (Servicios Generales).

// Bucket privado de Supabase Storage para firma y foto de cédula.
export const FOTOS_BUCKET = "despacho-dev-fotos";

// Tipos de vehículo admitidos. `furgon` es el único que lleva contenedor.
export const TIPOS_VEHICULO = [
  { key: "camion", label: "Camión" },
  { key: "plataforma", label: "Plataforma" },
  { key: "furgon", label: "Furgón" },
];

export const TIPO_VEHICULO_LABELS = Object.fromEntries(
  TIPOS_VEHICULO.map((t) => [t.key, t.label])
);

export function requiereContenedor(tipoVehiculo) {
  return tipoVehiculo === "furgon";
}

// Estados de la boleta.
export const ESTADOS_BOLETA = {
  PENDIENTE: "pendiente_validacion",
  DESPACHADO: "despachado",
  RECHAZADO: "rechazado",
  ANULADA: "anulada",
};

export const ESTADO_BOLETA_LABELS = {
  pendiente_validacion: "Pendiente de validación",
  despachado: "Despachada",
  rechazado: "Rechazada",
  anulada: "Anulada",
};

// tono de StatusPill por estado.
export const ESTADO_BOLETA_TONE = {
  pendiente_validacion: "warn",
  despachado: "ok",
  rechazado: "danger",
  anulada: "neutral",
};

// Checklist de inspección de salida. Todas las respuestas deben ser "sí" para
// poder validar (el backend lo revalida en dd_validar_boleta).
export const CHECKLIST_ITEMS = [
  { key: "documentos", label: "Documentación de salida completa y correcta" },
  { key: "identidad", label: "Identidad del chofer verificada (cédula)" },
  { key: "placas", label: "Placas del vehículo coinciden con la boleta" },
  { key: "carga", label: "Carga asegurada y acorde a lo declarado" },
  { key: "marchamo", label: "Marchamo colocado y verificado (si aplica)" },
  { key: "vehiculo", label: "Vehículo en condiciones para salir" },
];

// Longitud mínima del motivo de rechazo (espejo de dd_rechazar_boleta).
export const MOTIVO_RECHAZO_MIN = 10;
