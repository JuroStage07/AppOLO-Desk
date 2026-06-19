import { auth } from "../firebase";

// URL base de la API interna de Horas Extra (bit2-api).
// Se configura con VITE_OVERTIME_API_URL (ej: https://bit2-api.ologistics.com).
const API_URL = String(import.meta.env.VITE_OVERTIME_API_URL || "").replace(/\/$/, "");

async function authedFetch(path, { method = "GET", body } = {}) {
  if (!API_URL) {
    throw new Error(
      "VITE_OVERTIME_API_URL no está configurada. Definila en el archivo .env del frontend."
    );
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("No hay sesión activa.");
  }
  const token = await user.getIdToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo JSON */
  }

  if (!res.ok || (data && data.ok === false)) {
    const message = data?.error || `Error ${res.status} al llamar a ${path}`;
    throw new Error(message);
  }

  return data;
}

export function getOvertimeRecords() {
  return authedFetch("/overtime");
}

// Marcas diarias crudas (startEnroll + horario esperado) para reglas de tardanza.
// Sin `date` la API devuelve el día actual; con `date` (YYYY-MM-DD) un día específico.
export function getAttendanceMarks(date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return authedFetch(`/attendance/marks${qs}`);
}

export function decideOvertimeRecord({ attendanceId, status, note, record }) {
  return authedFetch("/overtime/decide", {
    method: "POST",
    body: { attendanceId, status, note, record },
  });
}

export function getOvertimeCoordinators() {
  return authedFetch("/overtime/coordinators");
}

export function saveCoordinatorEmails(coordinators) {
  return authedFetch("/overtime/coordinators", {
    method: "POST",
    body: { coordinators },
  });
}
