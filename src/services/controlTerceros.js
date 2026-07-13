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
import { isInUserScope, normalizeScopeValue } from "../utils/dataScope";

export async function findUsuarioByCedula(cedula, tenantId, company, bodegaId) {
  // Las reglas (sameTenantScopeData) exigen filtrar por tenantId+company en la query;
  // la bodega NO se filtra en servidor (se descartaría legacy sin bodega): se aplica en
  // memoria con isInUserScope más abajo.
  const qU = query(
    collection(db, "usuariosTerceros"),
    where("cedula", "==", String(cedula).trim()),
    where("tenantId", "==", normalizeScopeValue(tenantId)),
    where("company", "==", normalizeScopeValue(company)),
    limit(1)
  );
  const snap = await getDocs(qU);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const row = { id: d.id, ...d.data() };
  if (!isInUserScope(row, tenantId, company, bodegaId)) return null;
  return row;
}

export async function alreadyTipoToday({ terceroId, tipo, tenantId, company }) {
  const todayKey = dayKeyOf(new Date());
  const qE = query(
    collection(db, "controlTerceros"),
    where("dayKey", "==", todayKey),
    where("tipo", "==", tipo),
    where("terceroId", "==", terceroId),
    where("tenantId", "==", normalizeScopeValue(tenantId)),
    where("company", "==", normalizeScopeValue(company)),
    limit(1)
  );
  const snap = await getDocs(qE);
  return !snap.empty;
}

export async function registrarEvento({ usuario, tipo, tenantId, company, bodegaId, bodegaNombre }) {
  const uid = auth.currentUser?.uid;

  // Bodega: preferimos la del usuario logeado; si no hay, heredamos la del tercero (legacy).
  const bId = normalizeScopeValue(bodegaId) || normalizeScopeValue(usuario?.bodegaId) || "";
  const bNombre = normalizeScopeValue(bodegaNombre) || normalizeScopeValue(usuario?.bodegaNombre) || "";

  const payload = {
    terceroId: usuario.id,
    tipo,
    dayKey: dayKeyOf(new Date()),
    createdAt: serverTimestamp(),
    terceroNombre: String(usuario.nombre ?? "").trim(),
    terceroCedula: String(usuario.cedula ?? "").trim(),
    terceroEmpresa: String(usuario.empresa ?? "").trim(),
    terceroMotivo: String(usuario.motivo ?? "").trim(),
    tenantId: normalizeScopeValue(tenantId) || normalizeScopeValue(usuario?.tenantId) || "",
    company: normalizeScopeValue(company) || normalizeScopeValue(usuario?.company) || "",
    ...(bId ? { bodegaId: bId, bodegaNombre: bNombre } : {}), // tercera identidad (si hay bodega)
    ...(uid ? { creadoPorUid: uid } : {}), // 👈 solo si hay uid
  };

  await addDoc(collection(db, "controlTerceros"), payload);
}

export async function registrarEntradaPorCedula(cedula, tenantId, company, bodegaId, bodegaNombre) {
  const c = String(cedula).trim();
  if (!c) return { ok: false, kind: "warn", msg: "Ingresa una cédula." };

  const usuario = await findUsuarioByCedula(c, tenantId, company, bodegaId);
  if (!usuario?.id) return { ok: false, kind: "warn", msg: `No existe un tercero con cédula: ${c}` };

  if (usuario.usuarioBloqueado === true) {
    return { ok: false, kind: "blocked", msg: "Usuario bloqueado. Este usuario no puede registrar movimientos." };
  }

  if (usuario.entrada === true) {
    return { ok: true, kind: "warn", msg: `Ya tiene entrada: ${String(usuario.nombre ?? "").trim()}` };
  }

  const yaHoy = await alreadyTipoToday({ terceroId: usuario.id, tipo: "ENTRADA", tenantId, company });
  if (yaHoy) return { ok: true, kind: "warn", msg: `Ya fue registrado hoy: ${String(usuario.nombre ?? "").trim()}` };

  const ref = doc(db, "usuariosTerceros", usuario.id);
  await updateDoc(ref, { entrada: true, entradaAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await registrarEvento({ usuario, tipo: "ENTRADA", tenantId, company, bodegaId, bodegaNombre });

  return { ok: true, kind: "ok", msg: `✅ Entrada: ${String(usuario.nombre ?? "").trim()}` };
}

export async function registrarSalidaPorCedula(cedula, tenantId, company, bodegaId, bodegaNombre) {
  const c = String(cedula).trim();
  if (!c) return { ok: false, kind: "warn", msg: "Ingresa una cédula." };

  const usuario = await findUsuarioByCedula(c, tenantId, company, bodegaId);
  if (!usuario?.id) return { ok: false, kind: "warn", msg: `No existe un tercero con cédula: ${c}` };

  if (usuario.usuarioBloqueado === true) {
    return { ok: false, kind: "blocked", msg: "Usuario bloqueado. Este usuario no puede registrar movimientos." };
  }

  if (!usuario.entrada) {
    return { ok: false, kind: "warn", msg: "Salida no permitida: no tiene entrada activa (entrada: true)." };
  }

  const yaHoy = await alreadyTipoToday({ terceroId: usuario.id, tipo: "SALIDA", tenantId, company });
  if (yaHoy) return { ok: true, kind: "warn", msg: `Ya fue registrado hoy: ${String(usuario.nombre ?? "").trim()}` };

  const ref = doc(db, "usuariosTerceros", usuario.id);
  await updateDoc(ref, { entrada: false, salidaAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await registrarEvento({ usuario, tipo: "SALIDA", tenantId, company, bodegaId, bodegaNombre });

  return { ok: true, kind: "ok", msg: `✅ Salida: ${String(usuario.nombre ?? "").trim()}` };
}