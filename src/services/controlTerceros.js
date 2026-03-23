import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { dayKeyOf } from "../utils/dayKey";

export async function findUsuarioByCedula(cedula) {
  const qU = query(
    collection(db, "usuariosTerceros"),
    where("cedula", "==", String(cedula).trim()),
    limit(1)
  );
  const snap = await getDocs(qU);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function alreadyTipoToday({ terceroId, tipo }) {
  const todayKey = dayKeyOf(new Date());
  const qE = query(
    collection(db, "controlTerceros"),
    where("dayKey", "==", todayKey),
    where("tipo", "==", tipo),
    where("terceroId", "==", terceroId),
    limit(1)
  );
  const snap = await getDocs(qE);
  return !snap.empty;
}

export async function registrarEvento({ usuario, tipo }) {
  const uid = auth.currentUser?.uid;

  const payload = {
    terceroId: usuario.id,
    tipo,
    dayKey: dayKeyOf(new Date()),
    createdAt: serverTimestamp(),
    terceroNombre: String(usuario.nombre ?? "").trim(),
    terceroCedula: String(usuario.cedula ?? "").trim(),
    terceroEmpresa: String(usuario.empresa ?? "").trim(),
    terceroMotivo: String(usuario.motivo ?? "").trim(),
    ...(uid ? { creadoPorUid: uid } : {}), // 👈 solo si hay uid
  };

  await addDoc(collection(db, "controlTerceros"), payload);
}

export async function registrarEntradaPorCedula(cedula) {
  const c = String(cedula).trim();
  if (!c) return { ok: false, kind: "warn", msg: "Ingresa una cédula." };

  const usuario = await findUsuarioByCedula(c);
  if (!usuario?.id) return { ok: false, kind: "warn", msg: `No existe un tercero con cédula: ${c}` };

  if (usuario.usuarioBloqueado === true) {
    return { ok: false, kind: "blocked", msg: "Usuario bloqueado. Este usuario no puede registrar movimientos." };
  }

  if (usuario.entrada === true) {
    return { ok: true, kind: "warn", msg: `Ya tiene entrada: ${String(usuario.nombre ?? "").trim()}` };
  }

  const yaHoy = await alreadyTipoToday({ terceroId: usuario.id, tipo: "ENTRADA" });
  if (yaHoy) return { ok: true, kind: "warn", msg: `Ya fue registrado hoy: ${String(usuario.nombre ?? "").trim()}` };

  const ref = doc(db, "usuariosTerceros", usuario.id);
  await updateDoc(ref, { entrada: true, entradaAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await registrarEvento({ usuario, tipo: "ENTRADA" });

  return { ok: true, kind: "ok", msg: `✅ Entrada: ${String(usuario.nombre ?? "").trim()}` };
}

export async function registrarSalidaPorCedula(cedula) {
  const c = String(cedula).trim();
  if (!c) return { ok: false, kind: "warn", msg: "Ingresa una cédula." };

  const usuario = await findUsuarioByCedula(c);
  if (!usuario?.id) return { ok: false, kind: "warn", msg: `No existe un tercero con cédula: ${c}` };

  if (usuario.usuarioBloqueado === true) {
    return { ok: false, kind: "blocked", msg: "Usuario bloqueado. Este usuario no puede registrar movimientos." };
  }

  if (!usuario.entrada) {
    return { ok: false, kind: "warn", msg: "Salida no permitida: no tiene entrada activa (entrada: true)." };
  }

  const yaHoy = await alreadyTipoToday({ terceroId: usuario.id, tipo: "SALIDA" });
  if (yaHoy) return { ok: true, kind: "warn", msg: `Ya fue registrado hoy: ${String(usuario.nombre ?? "").trim()}` };

  const ref = doc(db, "usuariosTerceros", usuario.id);
  await updateDoc(ref, { entrada: false, salidaAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await registrarEvento({ usuario, tipo: "SALIDA" });

  return { ok: true, kind: "ok", msg: `✅ Salida: ${String(usuario.nombre ?? "").trim()}` };
}