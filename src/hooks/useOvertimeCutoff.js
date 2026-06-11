import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const pad2 = (n) => String(n).padStart(2, "0");

export function fmtCutoffDate(date) {
  if (!date) return "";
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function fmtCutoffLong(date) {
  if (!date) return "";
  return `${DAYS_ES[date.getDay()]} ${date.getDate()} de ${MONTHS_ES[date.getMonth()]}`;
}

/**
 * Calcula la próxima fecha de corte (el día de final del corte) a partir de hoy.
 * El corte cierra el día `endDay` de cada mes; si ese día ya pasó este mes,
 * la próxima fecha de corte es el `endDay` del mes siguiente.
 * @param {{ endDay?: number, startDay?: number }} config
 * @param {Date} now
 * @returns {{ date: Date, daysRemaining: number } | null}
 */
export function computeNextCutoff(config, now = new Date()) {
  const endDay = Number(config?.endDay) || null;
  if (!endDay) return null;

  const startDay = Number(config?.startDay) || null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Fin del corte: próxima ocurrencia de endDay desde hoy.
  let end = new Date(today.getFullYear(), today.getMonth(), endDay);
  if (end < today) {
    end = new Date(today.getFullYear(), today.getMonth() + 1, endDay);
  }
  const daysRemaining = Math.round((end - today) / MS_PER_DAY);

  // Inicio del corte: startDay del mismo mes del fin si startDay <= endDay,
  // o del mes anterior cuando el corte cruza de mes (ej: 21 → 19 del mes siguiente).
  let range = null;
  if (startDay) {
    const start =
      startDay <= endDay
        ? new Date(end.getFullYear(), end.getMonth(), startDay)
        : new Date(end.getFullYear(), end.getMonth() - 1, startDay);
    range = { start, end };
  }

  return { date: end, daysRemaining, range };
}

/**
 * Suscribe a overtimeConfig/cutoffDates y expone la próxima fecha de corte.
 */
export function useOvertimeCutoff() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "overtimeConfig", "cutoffDates");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setConfig(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error("Error cargando fecha de corte:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { config, next: computeNextCutoff(config), loading };
}
