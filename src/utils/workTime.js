/**
 * Cálculo de tiempo laboral para los cronómetros de subtareas.
 *
 * Regla actual (acordada con negocio): el cronómetro cuenta de forma continua
 * de lunes a viernes (incluidas las noches entre semana) y NO cuenta los
 * sábados ni los domingos. No hay ventana horaria diaria, ni almuerzo, ni
 * feriados. Una subtarea iniciada el viernes y completada el lunes solo
 * acumula el tiempo de viernes + lunes; el fin de semana queda descontado
 * automáticamente, sin pausar/reanudar manualmente.
 *
 * Todo se calcula en hora local del navegador (la operación corre en Costa
 * Rica, sin horario de verano).
 *
 * Para extender en el futuro (p. ej. ventana 07:00–17:30 o feriados) basta con
 * filtrar también esos tramos dentro del bucle por día.
 */

/** ¿El día (0=domingo … 6=sábado) es fin de semana? */
function isWeekend(weekday) {
  return weekday === 0 || weekday === 6;
}

/**
 * Milisegundos transcurridos entre `startMs` y `endMs` que caen en días
 * hábiles (lunes a viernes). Los sábados y domingos no se cuentan.
 *
 * @param {number} startMs epoch ms de inicio
 * @param {number} endMs epoch ms de fin (normalmente Date.now() o el momento de completar)
 * @returns {number} ms hábiles (>= 0)
 */
export function businessElapsedMs(startMs, endMs) {
  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  let total = 0;
  let cursor = start;

  // Recorremos tramo por tramo, cortando en el límite de cada día local.
  while (cursor < end) {
    const d = new Date(cursor);
    const dayEnd = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    const segmentEnd = Math.min(dayEnd, end);

    if (!isWeekend(d.getDay())) {
      total += segmentEnd - cursor;
    }

    cursor = segmentEnd;
  }

  return total;
}
