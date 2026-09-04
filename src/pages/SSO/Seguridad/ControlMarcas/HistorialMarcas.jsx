import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { ArrowLeft, FileSpreadsheet, History, Search } from "lucide-react";
import { db } from "../../../../firebase";
import { AuthCtx } from "../../../../auth/AuthProvider";
import { filterByUserScope } from "../../../../utils/dataScope";
import { downloadHistorialMarcasReport } from "../../../../utils/historialMarcasExcel";
import {
  Brand,
  GhostButton,
  PrimaryButton,
  Topbar,
  useToast,
} from "../../../../components/ui";
import { ACCENT } from "../../../../styles/theme";

const DANGER = "#DC2626";

/** Tope de días por consulta: cada día es una subcolección independiente. */
const MAX_RANGE_DAYS = 370;
/** Lecturas de días en paralelo (evita abrir cientos de requests a la vez). */
const FETCH_CONCURRENCY = 6;

const FECHA_MODOS = [
  { key: "dia", label: "Día", hint: "Una fecha" },
  { key: "rango", label: "Rango", hint: "Desde / hasta" },
];

const USUARIO_MODOS = [
  { key: "usuario", label: "Usuario", hint: "Una persona" },
  { key: "todos", label: "Todos los usuarios", hint: "Sin filtro" },
  { key: "empresa", label: "Por compañía", hint: "usuariosTerceros" },
];

/* ───────────────────────── helpers de fecha ───────────────────────── */

function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayId() {
  return ymd(new Date());
}

/** Parseo estricto de `YYYY-MM-DD` en hora local (igual que en Recepción). */
function parseYMD(value) {
  if (!value || !String(value).trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(dt.getTime()) ? null : dt;
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

/** Ids de documento (`controlMarcas/{YYYY-MM-DD}`) que cubre el filtro activo. */
function buildDayKeys(modo, dia, rango) {
  if (modo === "rango") {
    const desde = parseYMD(rango?.desde);
    const hasta = parseYMD(rango?.hasta);
    if (!desde || !hasta || hasta < desde) return [];
    const out = [];
    const cur = new Date(desde);
    while (cur <= hasta && out.length < MAX_RANGE_DAYS) {
      out.push(ymd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
  const single = parseYMD(dia);
  return single ? [ymd(single)] : [];
}

function validarFechas(modo, dia, rango) {
  if (modo === "dia") {
    return parseYMD(dia) ? "" : "Selecciona una fecha válida.";
  }
  if (!rango?.desde || !rango?.hasta) {
    return "Selecciona la fecha de inicio y la fecha final del rango.";
  }
  const desde = parseYMD(rango.desde);
  const hasta = parseYMD(rango.hasta);
  if (!desde || !hasta) return "Las fechas del rango no son válidas.";
  if (hasta < desde) {
    return "La fecha final no puede ser anterior a la fecha de inicio.";
  }
  if (daysBetween(desde, hasta) > MAX_RANGE_DAYS) {
    return `El rango no puede superar ${MAX_RANGE_DAYS} días.`;
  }
  return "";
}

/* ───────────────────────── helpers de marca ───────────────────────── */

function getMarcaMs(marca) {
  const ts = marca?.createdAt;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  const parsed = parseYMD(marca?.fecha || marca?.diaKey);
  return parsed ? parsed.getTime() : 0;
}

function getMarcaDate(marca) {
  const ts = marca?.createdAt;
  if (ts && typeof ts.toDate === "function") return ts.toDate();
  return parseYMD(marca?.fecha || marca?.diaKey);
}

function formatDateTime(marca) {
  const d = getMarcaDate(marca);
  if (d && marca?.createdAt?.toDate) {
    return d.toLocaleString("es-CR", { dateStyle: "short", timeStyle: "medium" });
  }
  const fecha = marca?.fecha || marca?.diaKey || "";
  const hora = marca?.horaTexto || "Sin hora";
  return fecha ? `${fecha} ${hora}` : hora;
}

function formatHoraTexto(marca) {
  const ts = marca?.createdAt;
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate().toLocaleTimeString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return marca?.horaTexto || "";
}

function empresaLabel(marca) {
  return String(marca?.empresa || marca?.company || "").trim();
}

/** Clave comparable de empresa (sin acentos, minúsculas, espacios colapsados). */
function normKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildUsuariosConMarcas(marcas) {
  const byUser = new Map();
  for (const marca of marcas) {
    const usuarioId = String(marca.usuarioId || "").trim();
    if (!usuarioId) continue;

    const current = byUser.get(usuarioId);
    if (current) {
      current.count += 1;
      if (!current.cedula && marca.cedula) current.cedula = marca.cedula;
      if (!current.empresa) current.empresa = empresaLabel(marca);
      continue;
    }

    byUser.set(usuarioId, {
      id: usuarioId,
      nombre: marca.nombre || "Sin nombre",
      cedula: marca.cedula || "",
      empresa: empresaLabel(marca),
      count: 1,
    });
  }

  return [...byUser.values()].sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre), "es")
  );
}

/** Agrupa las marcas por usuario, ordenadas cronológicamente dentro del grupo. */
function agruparPorUsuario(marcas) {
  const byUser = new Map();
  for (const marca of marcas) {
    const uid = String(marca.usuarioId || "").trim();
    const cedula = String(marca.cedula || "").trim();
    const key = uid || (cedula ? `cedula:${cedula}` : "sin-usuario");

    let grupo = byUser.get(key);
    if (!grupo) {
      grupo = {
        id: key,
        nombre: marca.nombre || "Sin nombre",
        cedula: marca.cedula || "",
        empresa: empresaLabel(marca),
        marcas: [],
      };
      byUser.set(key, grupo);
    }
    if (!grupo.cedula && marca.cedula) grupo.cedula = marca.cedula;
    if (!grupo.empresa) grupo.empresa = empresaLabel(marca);
    grupo.marcas.push(marca);
  }

  const grupos = [...byUser.values()];
  for (const grupo of grupos) {
    grupo.marcas.sort((a, b) => getMarcaMs(a) - getMarcaMs(b));
  }
  grupos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return grupos;
}

/** Lee `controlMarcas/{dia}/marcas` para cada día, en tandas. */
async function fetchMarcasDeDias(dayKeys) {
  const out = [];
  for (let i = 0; i < dayKeys.length; i += FETCH_CONCURRENCY) {
    const chunk = dayKeys.slice(i, i + FETCH_CONCURRENCY);
    const snaps = await Promise.all(
      chunk.map((dayKey) =>
        getDocs(
          query(
            collection(db, "controlMarcas", dayKey, "marcas"),
            orderBy("createdAt", "asc")
          )
        )
      )
    );
    snaps.forEach((snap, idx) => {
      snap.docs.forEach((d) => {
        out.push({ id: `${chunk[idx]}/${d.id}`, ...d.data(), diaKey: chunk[idx] });
      });
    });
  }
  return out;
}

/* ───────────────────────── componente ───────────────────────── */

export default function HistorialMarcas() {
  const nav = useNavigate();
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  const tenantId = String(profile?.tenantId || "").trim();
  const company = String(profile?.company || "").trim();
  const bodegaId = String(profile?.bodegaId || "").trim();

  // Filtro de fecha (borrador editable por el usuario).
  const [fechaModo, setFechaModo] = useState("dia");
  const [dia, setDia] = useState(getTodayId);
  const [rango, setRango] = useState(() => ({
    desde: getTodayId(),
    hasta: getTodayId(),
  }));

  // Filtro aplicado: es lo que realmente se consultó a Firestore.
  const [aplicado, setAplicado] = useState(() => ({
    modo: "dia",
    dia: getTodayId(),
    rango: { desde: "", hasta: "" },
  }));

  // Filtro de usuario.
  const [usuarioModo, setUsuarioModo] = useState("usuario");
  const [usuarioId, setUsuarioId] = useState("");
  const [empresaKey, setEmpresaKey] = useState("");

  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Exportar solo se habilita después de presionar Buscar; cualquier cambio de
  // filtro lo vuelve a bloquear para no descargar algo distinto a lo buscado.
  const [busquedaHecha, setBusquedaHecha] = useState(false);

  // Catálogo de compañías: se toma de usuariosTerceros.empresa (carga perezosa).
  const [terceros, setTerceros] = useState([]);
  const [tercerosLoading, setTercerosLoading] = useState(false);
  const [tercerosLoaded, setTercerosLoaded] = useState(false);
  const [tercerosError, setTercerosError] = useState("");

  const reqRef = useRef(0);

  /* ── carga de marcas según el filtro aplicado ── */
  useEffect(() => {
    if (authLoading) return;

    const dayKeys = buildDayKeys(aplicado.modo, aplicado.dia, aplicado.rango);
    if (!dayKeys.length) {
      setMarcas([]);
      setLoading(false);
      return;
    }

    const token = ++reqRef.current;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await fetchMarcasDeDias(dayKeys);
        if (cancelled || token !== reqRef.current) return;
        setMarcas(filterByUserScope(rows, tenantId, company, bodegaId));
      } catch (err) {
        console.error("Error cargando historial de marcas:", err);
        if (cancelled || token !== reqRef.current) return;
        setMarcas([]);
        setError(
          aplicado.modo === "rango"
            ? "No se pudo cargar el historial de marcas para ese rango."
            : "No se pudo cargar el historial de marcas para ese día."
        );
      } finally {
        if (!cancelled && token === reqRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, aplicado, tenantId, company, bodegaId]);

  /* ── catálogo de compañías (usuariosTerceros) ── */
  const cargarTerceros = useCallback(async () => {
    if (!tenantId || !company) {
      setTercerosError(
        "El perfil no tiene tenantId o company: no se pueden listar las compañías."
      );
      return;
    }
    setTercerosLoading(true);
    setTercerosError("");
    try {
      // Las reglas (sameTenantScopeData) exigen filtrar por tenantId + company.
      // La bodega se aplica en memoria para no excluir documentos legacy.
      const qTerceros = query(
        collection(db, "usuariosTerceros"),
        where("tenantId", "==", tenantId),
        where("company", "==", company)
      );
      const snap = await getDocs(qTerceros);
      const rows = filterByUserScope(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        tenantId,
        company,
        bodegaId
      );
      setTerceros(rows);
      setTercerosLoaded(true);
    } catch (err) {
      console.error("Error cargando compañías (usuariosTerceros):", err);
      setTercerosError("No se pudieron cargar las compañías de usuariosTerceros.");
    } finally {
      setTercerosLoading(false);
    }
  }, [tenantId, company, bodegaId]);

  // El scope cambió (bodega/compañía): el catálogo cacheado ya no aplica y hay
  // que volver a buscar antes de exportar.
  useEffect(() => {
    setTerceros([]);
    setTercerosLoaded(false);
    setTercerosError("");
    setEmpresaKey("");
    setBusquedaHecha(false);
  }, [tenantId, company, bodegaId]);

  useEffect(() => {
    if (authLoading) return;
    if (usuarioModo !== "empresa") return;
    if (tercerosLoaded || tercerosLoading) return;
    cargarTerceros();
  }, [authLoading, usuarioModo, tercerosLoaded, tercerosLoading, cargarTerceros]);

  /* ── derivados ── */
  const usuariosConMarcas = useMemo(
    () => buildUsuariosConMarcas(marcas),
    [marcas]
  );

  // Si el usuario seleccionado ya no tiene marcas en el período, se limpia.
  useEffect(() => {
    if (loading || !usuarioId) return;
    if (!usuariosConMarcas.some((u) => u.id === usuarioId)) setUsuarioId("");
  }, [loading, usuarioId, usuariosConMarcas]);

  const empresasOpciones = useMemo(() => {
    const byKey = new Map();
    for (const t of terceros) {
      const label = String(t?.empresa || "").trim();
      if (!label) continue;
      const key = normKey(label);
      const current = byKey.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      byKey.set(key, { key, label, count: 1 });
    }
    return [...byKey.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "es")
    );
  }, [terceros]);

  const empresaPorUsuarioId = useMemo(() => {
    const map = new Map();
    for (const t of terceros) {
      const key = normKey(t?.empresa);
      if (key) map.set(t.id, key);
    }
    return map;
  }, [terceros]);

  const empresaPorCedula = useMemo(() => {
    const map = new Map();
    for (const t of terceros) {
      const key = normKey(t?.empresa);
      const cedula = String(t?.cedula || "").trim();
      if (key && cedula && !map.has(cedula)) map.set(cedula, key);
    }
    return map;
  }, [terceros]);

  const empresaSeleccionada = useMemo(
    () => empresasOpciones.find((e) => e.key === empresaKey) || null,
    [empresasOpciones, empresaKey]
  );

  /**
   * La marca guarda `empresa` desnormalizada, pero el catálogo viene de
   * usuariosTerceros: se acepta la coincidencia por cualquiera de las dos vías
   * para no perder marcas cuyo dato quedó desactualizado.
   */
  const marcaEsDeEmpresa = useCallback(
    (marca, key) => {
      if (!key) return false;
      if (normKey(empresaLabel(marca)) === key) return true;
      const porId = empresaPorUsuarioId.get(String(marca.usuarioId || "").trim());
      if (porId && porId === key) return true;
      const porCedula = empresaPorCedula.get(String(marca.cedula || "").trim());
      return Boolean(porCedula && porCedula === key);
    },
    [empresaPorUsuarioId, empresaPorCedula]
  );

  const marcasFiltradas = useMemo(() => {
    if (usuarioModo === "usuario") {
      if (!usuarioId) return [];
      return marcas.filter((m) => m.usuarioId === usuarioId);
    }
    if (usuarioModo === "empresa") {
      if (!empresaKey) return [];
      return marcas.filter((m) => marcaEsDeEmpresa(m, empresaKey));
    }
    return marcas;
  }, [marcas, usuarioModo, usuarioId, empresaKey, marcaEsDeEmpresa]);

  const grupos = useMemo(() => agruparPorUsuario(marcasFiltradas), [marcasFiltradas]);

  const selectedUser = useMemo(
    () => usuariosConMarcas.find((u) => u.id === usuarioId) || null,
    [usuariosConMarcas, usuarioId]
  );

  /* ── validación ── */
  const fechaError = useMemo(
    () => validarFechas(fechaModo, dia, rango),
    [fechaModo, dia, rango]
  );

  const usuarioError = useMemo(() => {
    if (usuarioModo === "usuario" && !usuarioId) {
      return "Selecciona un usuario para ver sus marcas.";
    }
    if (usuarioModo === "empresa" && !empresaKey) {
      return "Selecciona una compañía para ver sus marcas.";
    }
    return "";
  }, [usuarioModo, usuarioId, empresaKey]);

  const filtroPendiente = useMemo(() => {
    if (fechaError) return false;
    if (fechaModo === "dia") {
      return aplicado.modo !== "dia" || aplicado.dia !== dia;
    }
    return (
      aplicado.modo !== "rango" ||
      aplicado.rango.desde !== rango.desde ||
      aplicado.rango.hasta !== rango.hasta
    );
  }, [fechaError, fechaModo, dia, rango, aplicado]);

  /* ── acciones de filtro ── */
  const aplicarFecha = useCallback(
    (modo, valorDia, valorRango) => {
      setAplicado(
        modo === "rango"
          ? { modo: "rango", dia: "", rango: { ...valorRango } }
          : { modo: "dia", dia: valorDia, rango: { desde: "", hasta: "" } }
      );
    },
    []
  );

  /** Cualquier cambio de filtro obliga a volver a presionar Buscar. */
  const invalidarBusqueda = () => setBusquedaHecha(false);

  const seleccionarFechaModo = (modo) => {
    if (modo === fechaModo) return;
    setError("");
    invalidarBusqueda();
    if (modo === "rango") {
      // Arranca el rango en el día que ya se estaba viendo.
      const base = parseYMD(dia) ? dia : getTodayId();
      const nextRango = { desde: base, hasta: base };
      setRango(nextRango);
      setFechaModo("rango");
      aplicarFecha("rango", "", nextRango);
    } else {
      // Vuelve a día único: se ignora el rango y se conserva la fecha inicial.
      const base = parseYMD(rango.desde) ? rango.desde : getTodayId();
      setDia(base);
      setRango({ desde: "", hasta: "" });
      setFechaModo("dia");
      aplicarFecha("dia", base, null);
    }
  };

  const onDiaChange = (value) => {
    const next = value || getTodayId();
    invalidarBusqueda();
    setDia(next);
    if (parseYMD(next)) aplicarFecha("dia", next, null);
  };

  const onRangoChange = (campo, value) => {
    invalidarBusqueda();
    setRango((prev) => ({ ...prev, [campo]: value }));
  };

  const seleccionarUsuarioModo = (modo) => {
    if (modo === usuarioModo) return;
    invalidarBusqueda();
    // Cada modo ignora los valores del otro para que no queden filtros fantasma.
    if (modo !== "usuario") setUsuarioId("");
    if (modo !== "empresa") setEmpresaKey("");
    setUsuarioModo(modo);
  };

  const onUsuarioChange = (value) => {
    invalidarBusqueda();
    setUsuarioId(value);
  };

  const onEmpresaChange = (value) => {
    invalidarBusqueda();
    setEmpresaKey(value);
  };

  const buscar = () => {
    if (fechaError) {
      toast.warning(fechaError);
      return;
    }
    if (usuarioError) toast.warning(usuarioError);
    // `aplicarFecha` siempre crea un objeto nuevo, así que el efecto de carga
    // se vuelve a disparar aunque el filtro no haya cambiado (recarga manual).
    if (fechaModo === "rango") aplicarFecha("rango", "", rango);
    else aplicarFecha("dia", dia, null);
    setBusquedaHecha(true);
  };

  /* ── etiquetas ── */
  const periodoLabel = useMemo(() => {
    if (aplicado.modo === "rango") {
      const { desde, hasta } = aplicado.rango;
      if (!desde || !hasta) return "Rango sin definir";
      return `${desde} → ${hasta}`;
    }
    return aplicado.dia || "Sin fecha";
  }, [aplicado]);

  const usuarioModoLabel = useMemo(() => {
    if (usuarioModo === "todos") return "Todos los usuarios";
    if (usuarioModo === "empresa") {
      return `Por compañía${empresaSeleccionada ? `: ${empresaSeleccionada.label}` : ""}`;
    }
    return `Usuario${selectedUser ? `: ${selectedUser.nombre}` : ""}`;
  }, [usuarioModo, empresaSeleccionada, selectedUser]);

  const resultsTitle = useMemo(() => {
    if (usuarioModo === "usuario") {
      return selectedUser
        ? `${selectedUser.nombre} · ${marcasFiltradas.length} marcas`
        : "Marcas del usuario seleccionado";
    }
    if (usuarioModo === "empresa") {
      return empresaSeleccionada
        ? `${empresaSeleccionada.label} · ${grupos.length} usuarios · ${marcasFiltradas.length} marcas`
        : "Marcas de la compañía seleccionada";
    }
    return `${grupos.length} usuarios · ${marcasFiltradas.length} marcas`;
  }, [usuarioModo, selectedUser, empresaSeleccionada, grupos.length, marcasFiltradas.length]);

  /* ── exportación ── */
  const exportar = async () => {
    if (fechaError) {
      toast.warning(fechaError);
      return;
    }
    if (usuarioError) {
      toast.warning(usuarioError);
      return;
    }
    if (!busquedaHecha || filtroPendiente) {
      toast.warning("Presiona Buscar antes de exportar.");
      return;
    }
    if (!grupos.length) {
      toast.warning("No hay marcas para exportar con los filtros actuales.");
      return;
    }

    setExporting(true);
    try {
      const filtrosTexto = [
        aplicado.modo === "rango"
          ? `Rango: ${aplicado.rango.desde} a ${aplicado.rango.hasta}`
          : `Día: ${aplicado.dia}`,
        usuarioModoLabel,
      ].join(" · ");

      await downloadHistorialMarcasReport({
        title: "Historial de marcas",
        subtitle:
          aplicado.modo === "rango"
            ? `Rango ${aplicado.rango.desde} a ${aplicado.rango.hasta}`
            : `Día ${aplicado.dia}`,
        filtersText: filtrosTexto,
        fileName: "historial-marcas",
        meta: [
          ["Compañía (scope)", company || "—"],
          ["Bodega", profile?.bodegaNombre || bodegaId || "—"],
          ["Filtro de fecha", aplicado.modo === "rango" ? "Rango" : "Día"],
          ["Filtro de usuario", usuarioModoLabel],
        ],
        grupos: grupos.map((grupo) => ({
          id: grupo.id,
          nombre: grupo.nombre,
          cedula: grupo.cedula,
          empresa: grupo.empresa,
          marcas: grupo.marcas.map((m) => {
            const d = getMarcaDate(m);
            return {
              fecha: d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null,
              fechaTexto: m.fecha || m.diaKey || "",
              hora: formatHoraTexto(m),
              tipo: m.tipo === "entrada" ? "Entrada" : "Salida",
              empresa: empresaLabel(m) || "Sin empresa",
              motivo: m.motivo || "",
              bodega: m.bodegaNombre || m.bodegaId || "",
            };
          }),
        })),
      });

      toast.success(
        grupos.length === 1
          ? "Reporte exportado."
          : `Reporte exportado con ${grupos.length} usuarios.`
      );
    } catch (err) {
      console.error("HistorialMarcas export excel:", err);
      toast.error("No se pudo exportar el reporte de marcas.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-cm", "historial-marcas");
    style.innerHTML = `
      @keyframes hm-spin { to { transform: rotate(360deg); } }
      .hm-input:focus {
        border-color: rgba(8, 159, 138, 0.45) !important;
        box-shadow: 0 0 0 4px rgba(8, 159, 138, 0.12);
      }
      .hm-check {
        appearance: none;
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        margin: 0;
        flex: 0 0 auto;
        border-radius: 6px;
        border: 1.5px solid #CBD5E1;
        background: #fff;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease;
      }
      .hm-check:checked {
        background: ${ACCENT};
        border-color: ${ACCENT};
      }
      .hm-check:checked::after {
        content: "";
        width: 10px;
        height: 5px;
        border-left: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(-45deg) translate(1px, -1px);
      }
      .hm-check:disabled { opacity: 0.55; cursor: not-allowed; }
      .hm-check:focus-visible { box-shadow: 0 0 0 4px rgba(8, 159, 138, 0.18); }
      .hm-opt {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid #E7E9F2;
        border-radius: 14px;
        background: #fff;
        cursor: pointer;
        user-select: none;
        transition: border-color 140ms ease, background 140ms ease;
      }
      .hm-opt[data-active="true"] {
        border-color: rgba(8, 159, 138, 0.45);
        background: rgba(8, 159, 138, 0.06);
      }
      @media (max-width: 860px) {
        .hm-dates { grid-template-columns: 1fr !important; }
        .hm-opts { grid-template-columns: 1fr !important; }
        .hm-actions { flex-direction: column !important; align-items: stretch !important; }
        .hm-topbar { align-items: flex-start !important; flex-direction: column !important; height: auto !important; }
        .hm-topbar-actions { width: 100%; justify-content: flex-start !important; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const busy = loading || exporting;
  const showGroupHeaders = usuarioModo !== "usuario";
  const puedeExportar =
    busquedaHecha && !loading && !exporting && !fechaError && !filtroPendiente;

  const renderMarcas = () => {
    if (loading) return null;

    if (fechaError) {
      return <div style={ui.empty}>{fechaError}</div>;
    }
    if (marcas.length === 0) {
      return (
        <div style={ui.empty}>
          {aplicado.modo === "rango"
            ? "No hay marcas registradas en el rango seleccionado."
            : "No hay marcas registradas para el día seleccionado."}
        </div>
      );
    }
    if (usuarioError) {
      return <div style={ui.empty}>{usuarioError}</div>;
    }
    if (grupos.length === 0) {
      return (
        <div style={ui.empty}>
          No hay marcas que coincidan con el filtro seleccionado.
        </div>
      );
    }

    return grupos.map((grupo) => (
      <React.Fragment key={grupo.id}>
        {showGroupHeaders && (
          <div style={ui.groupHead}>
            <div style={ui.groupName}>{grupo.nombre}</div>
            <div style={ui.groupMeta}>
              Cédula: {grupo.cedula || "Sin cédula"} · Empresa:{" "}
              {grupo.empresa || "Sin empresa"} · {grupo.marcas.length} marcas
            </div>
          </div>
        )}
        {grupo.marcas.map((marca, index) => {
          const esEntrada = marca.tipo === "entrada";
          return (
            <article key={marca.id} style={ui.row}>
              <div style={ui.rowIndex}>{index + 1}</div>
              <div style={ui.rowMain}>
                <div style={ui.rowTop}>
                  <div style={ui.rowName}>
                    {marca.nombre || grupo.nombre || "Sin nombre"}
                  </div>
                  <span
                    style={{
                      ...ui.badge,
                      ...(esEntrada ? ui.badgeEntrada : ui.badgeSalida),
                    }}
                  >
                    {esEntrada ? "ENTRADA" : "SALIDA"}
                  </span>
                </div>
                <div style={ui.meta}>
                  Cédula: {marca.cedula || "Sin cédula"} · Empresa:{" "}
                  {empresaLabel(marca) || "Sin empresa"}
                </div>
                <div style={ui.meta}>Hora: {formatDateTime(marca)}</div>
              </div>
            </article>
          );
        })}
      </React.Fragment>
    ));
  };

  return (
    <div style={ui.shell}>
      <Topbar>
        <Brand
          icon={History}
          title="Historial de marcas"
          subtitle="Control de marcas"
          onClick={() => nav("/seguridad/control-marcas")}
        />
        <Topbar.Right>
          <GhostButton
            icon={ArrowLeft}
            onClick={() => nav("/seguridad/control-marcas")}
          >
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <main style={ui.main}>
        <section style={ui.card}>
          <div style={ui.topAccent} />
          <div style={ui.cardHead}>
            <div>
              <div style={ui.kicker}>Historial de marcas</div>
              <h1 style={ui.title}>Consultar marcas por fecha y usuario</h1>
              <p style={ui.desc}>
                Elige un día o un rango de fechas y después el alcance: un
                usuario, todos los usuarios o una compañía. Puedes exportar a
                Excel exactamente lo que estás viendo.
              </p>
            </div>
            <div style={ui.counts}>
              <div style={ui.countBox}>
                <span style={ui.countValue}>{marcas.length}</span>
                <span style={ui.countLabel}>
                  {aplicado.modo === "rango" ? "marcas del rango" : "marcas del día"}
                </span>
              </div>
              <div style={ui.countBox}>
                <span style={ui.countValue}>{marcasFiltradas.length}</span>
                <span style={ui.countLabel}>en el filtro</span>
              </div>
            </div>
          </div>

          <div style={ui.filters}>
            {/* ── 1. Fecha ── */}
            <div style={ui.filterBlock}>
              <span style={ui.label}>1. Fecha</span>
              <div
                className="hm-opts"
                style={{ ...ui.opts, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
                role="radiogroup"
                aria-label="Tipo de filtro de fecha"
              >
                {FECHA_MODOS.map((opt) => {
                  const active = fechaModo === opt.key;
                  return (
                    <label key={opt.key} className="hm-opt" data-active={active}>
                      <input
                        className="hm-check"
                        type="radio"
                        name="hm-fecha-modo"
                        checked={active}
                        onChange={() => seleccionarFechaModo(opt.key)}
                        disabled={busy}
                      />
                      <span style={ui.optText}>
                        <span style={ui.optLabel}>{opt.label}</span>
                        <span style={ui.optHint}>{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {fechaModo === "dia" ? (
                <div className="hm-dates" style={ui.dates}>
                  <label style={ui.field}>
                    <span style={ui.subLabel}>Fecha</span>
                    <input
                      className="hm-input"
                      type="date"
                      value={dia}
                      onChange={(e) => onDiaChange(e.target.value)}
                      style={ui.input}
                      disabled={busy}
                    />
                  </label>
                </div>
              ) : (
                <div className="hm-dates" style={ui.dates}>
                  <label style={ui.field}>
                    <span style={ui.subLabel}>Desde</span>
                    <input
                      className="hm-input"
                      type="date"
                      value={rango.desde}
                      max={rango.hasta || undefined}
                      onChange={(e) => onRangoChange("desde", e.target.value)}
                      style={ui.input}
                      disabled={busy}
                    />
                  </label>
                  <label style={ui.field}>
                    <span style={ui.subLabel}>Hasta</span>
                    <input
                      className="hm-input"
                      type="date"
                      value={rango.hasta}
                      min={rango.desde || undefined}
                      onChange={(e) => onRangoChange("hasta", e.target.value)}
                      style={ui.input}
                      disabled={busy}
                    />
                  </label>
                </div>
              )}

              {fechaError ? (
                <div style={ui.warnText}>{fechaError}</div>
              ) : filtroPendiente ? (
                <div style={ui.hintText}>
                  Presiona <b>Buscar</b> para aplicar el rango seleccionado.
                </div>
              ) : !busquedaHecha ? (
                <div style={ui.hintText}>
                  Presiona <b>Buscar</b> para habilitar la exportación.
                </div>
              ) : null}
            </div>

            {/* ── 2. Usuario ── */}
            <div style={ui.filterBlock}>
              <span style={ui.label}>2. Usuario</span>
              <div
                className="hm-opts"
                style={{ ...ui.opts, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
                role="radiogroup"
                aria-label="Alcance de usuarios"
              >
                {USUARIO_MODOS.map((opt) => {
                  const active = usuarioModo === opt.key;
                  return (
                    <label key={opt.key} className="hm-opt" data-active={active}>
                      <input
                        className="hm-check"
                        type="radio"
                        name="hm-usuario-modo"
                        checked={active}
                        onChange={() => seleccionarUsuarioModo(opt.key)}
                        disabled={busy}
                      />
                      <span style={ui.optText}>
                        <span style={ui.optLabel}>{opt.label}</span>
                        <span style={ui.optHint}>{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {usuarioModo === "usuario" && (
                <label style={ui.field}>
                  <span style={ui.subLabel}>Usuario con marcas en el período</span>
                  <select
                    className="hm-input"
                    value={usuarioId}
                    onChange={(e) => onUsuarioChange(e.target.value)}
                    style={ui.input}
                    disabled={busy || usuariosConMarcas.length === 0}
                  >
                    <option value="">
                      {usuariosConMarcas.length === 0
                        ? "Sin usuarios con marcas"
                        : "Seleccionar usuario"}
                    </option>
                    {usuariosConMarcas.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} - {u.cedula || "Sin cédula"} ({u.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {usuarioModo === "empresa" && (
                <label style={ui.field}>
                  <span style={ui.subLabel}>Compañía (usuariosTerceros)</span>
                  <select
                    className="hm-input"
                    value={empresaKey}
                    onChange={(e) => onEmpresaChange(e.target.value)}
                    style={ui.input}
                    disabled={busy || tercerosLoading || empresasOpciones.length === 0}
                  >
                    <option value="">
                      {tercerosLoading
                        ? "Cargando compañías…"
                        : empresasOpciones.length === 0
                        ? "Sin compañías registradas"
                        : "Seleccionar compañía"}
                    </option>
                    {empresasOpciones.map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label} — {e.count} usuario{e.count === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {usuarioModo === "todos" && (
                <div style={ui.hintText}>
                  Se incluyen todas las personas con marcas en el período
                  seleccionado.
                </div>
              )}

              {tercerosError && usuarioModo === "empresa" && (
                <div style={ui.warnText}>{tercerosError}</div>
              )}

              {!tercerosError && usuarioError && (
                <div style={ui.hintText}>{usuarioError}</div>
              )}
            </div>

            <div className="hm-actions" style={ui.actions}>
              <div style={ui.actionsInfo}>
                Filtro activo: <b>{periodoLabel}</b> · {usuarioModoLabel}
              </div>
              <div style={ui.actionsBtns}>
                <GhostButton
                  icon={Search}
                  onClick={buscar}
                  disabled={busy || Boolean(fechaError)}
                  title="Aplicar el filtro y recargar las marcas"
                >
                  Buscar
                </GhostButton>
                <PrimaryButton
                  icon={FileSpreadsheet}
                  onClick={exportar}
                  loading={exporting}
                  disabled={!puedeExportar}
                  title={
                    puedeExportar
                      ? "Exportar a Excel exactamente lo filtrado"
                      : "Presiona Buscar para habilitar la exportación"
                  }
                >
                  Exportar
                </PrimaryButton>
              </div>
            </div>
          </div>

          {error && <div style={ui.errorBox}>{error}</div>}

          <div style={ui.resultsHead}>
            <div>
              <div style={ui.resultsKicker}>{periodoLabel}</div>
              <div style={ui.resultsTitle}>{resultsTitle}</div>
            </div>
            {loading && (
              <div style={ui.loadingPill}>
                <span style={ui.spinner} />
                Cargando
              </div>
            )}
          </div>

          <div style={ui.list}>{renderMarcas()}</div>
        </section>
      </main>
    </div>
  );
}

const ui = {
  shell: {
    minHeight: "100vh",
    height: "100dvh",
    width: "100%",
    boxSizing: "border-box",
    background: "#F6F7FB",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#0F172A",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflow: "hidden",
  },
  main: {
    minHeight: 0,
    padding: 16,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    width: "min(1100px, 100%)",
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E7E9F2",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
    overflow: "hidden",
    position: "relative",
  },
  topAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    width: "100%",
    background: `linear-gradient(90deg, ${ACCENT} 0%, rgba(8,159,138,0.25) 60%, rgba(8,159,138,0) 100%)`,
  },
  cardHead: {
    padding: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    borderBottom: "1px solid #EEF1F7",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFF 100%)",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 6,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 980,
    letterSpacing: -0.4,
  },
  desc: {
    margin: "8px 0 0",
    color: "#64748B",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.45,
    maxWidth: 620,
  },
  counts: { display: "flex", gap: 10, flexWrap: "wrap" },
  countBox: {
    borderRadius: 18,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "12px 16px",
    display: "grid",
    gap: 2,
    minWidth: 150,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  countValue: {
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 980,
    color: "#0F172A",
  },
  countLabel: {
    fontWeight: 900,
    color: "#64748B",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filters: {
    padding: 18,
    display: "grid",
    gap: 16,
    borderBottom: "1px solid #EEF1F7",
    background: "#FBFCFF",
  },
  filterBlock: { display: "grid", gap: 10 },
  opts: { display: "grid", gap: 10 },
  optText: { display: "grid", gap: 2, minWidth: 0 },
  optLabel: { fontWeight: 950, fontSize: 13, color: "#0F172A" },
  optHint: { fontWeight: 850, fontSize: 11, color: "#64748B" },
  dates: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  field: { display: "grid", gap: 8 },
  label: {
    fontWeight: 980,
    fontSize: 12,
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  subLabel: {
    fontWeight: 900,
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    height: 44,
    borderRadius: 14,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "0 12px",
    outline: "none",
    color: "#0F172A",
    fontWeight: 850,
    boxSizing: "border-box",
    width: "100%",
  },
  hintText: {
    fontSize: 12,
    fontWeight: 850,
    color: "#64748B",
    lineHeight: 1.4,
  },
  warnText: {
    fontSize: 12,
    fontWeight: 900,
    color: DANGER,
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    borderTop: "1px dashed #E7E9F2",
    paddingTop: 14,
  },
  actionsInfo: {
    fontSize: 12,
    fontWeight: 850,
    color: "#64748B",
    minWidth: 0,
  },
  actionsBtns: { display: "flex", gap: 10, flexWrap: "wrap" },
  errorBox: {
    margin: "14px 18px 0",
    borderRadius: 16,
    border: "1px solid rgba(220,38,38,0.22)",
    background: "rgba(220,38,38,0.06)",
    padding: 12,
    color: DANGER,
    fontWeight: 900,
  },
  resultsHead: {
    padding: "14px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  resultsKicker: {
    color: "#64748B",
    fontWeight: 950,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  resultsTitle: {
    marginTop: 4,
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },
  loadingPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    border: "1px solid #E7E9F2",
    background: "#fff",
    padding: "8px 12px",
    fontWeight: 950,
    color: "#64748B",
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: 999,
    border: "2px solid rgba(8,159,138,0.25)",
    borderTopColor: ACCENT,
    animation: "hm-spin 900ms linear infinite",
  },
  list: {
    padding: "0 18px 18px",
    display: "grid",
    gap: 10,
  },
  empty: {
    padding: 18,
    borderRadius: 16,
    border: "1px dashed #E7E9F2",
    background: "#FBFCFF",
    color: "#64748B",
    fontWeight: 850,
    textAlign: "center",
  },
  groupHead: {
    marginTop: 6,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(8,159,138,0.22)",
    background: "rgba(8,159,138,0.06)",
    display: "grid",
    gap: 3,
  },
  groupName: { fontWeight: 980, fontSize: 15, color: "#0F172A" },
  groupMeta: { fontWeight: 850, fontSize: 12, color: "#64748B" },
  row: {
    border: "1px solid #E7E9F2",
    borderRadius: 18,
    padding: 14,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    display: "grid",
    gridTemplateColumns: "42px 1fr",
    gap: 12,
    alignItems: "start",
  },
  rowIndex: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "rgba(8,159,138,0.10)",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    fontWeight: 980,
  },
  rowMain: { display: "grid", gap: 7, minWidth: 0 },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  rowName: {
    fontWeight: 980,
    fontSize: 16,
    color: "#0F172A",
  },
  meta: {
    fontSize: 13,
    fontWeight: 850,
    color: "#64748B",
    lineHeight: 1.35,
  },
  badge: {
    fontSize: 11,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  badgeEntrada: {
    backgroundColor: "rgba(8,159,138,0.12)",
    color: ACCENT,
  },
  badgeSalida: {
    backgroundColor: "rgba(220,38,38,0.12)",
    color: DANGER,
  },
};
