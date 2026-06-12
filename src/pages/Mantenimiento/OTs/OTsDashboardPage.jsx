import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  LayoutGrid,
  Wrench,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { db } from "../../../firebase";
import { AuthCtx } from "../../../auth/AuthProvider";
import { isSolicitudOtInScope } from "../../../utils/dataScope";
import { PERIOD, formatYMD } from "./dashboard/periodUtils";
import { useOTsDashboardMetrics } from "./dashboard/useOTsDashboardMetrics";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Main,
  Shell,
  TableScroll,
  Topbar,
  useToast,
} from "../../../components/ui";
import "./OTsDashboardPage.css";

function defaultCustomRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { from: formatYMD(start), to: formatYMD(end) };
}

export default function OTsDashboardPage() {
  const nav = useNavigate();
  const toast = useToast();
  const authCtx = useContext(AuthCtx);
  const { permisos } = authCtx || {};
  const profile = authCtx?.profile || {};
  const authLoading = authCtx?.loading;

  useEffect(() => {
    if (authLoading) return;
    if (!permisos?.mantenimiento) {
      toast.error("No tenés permisos para acceder a este módulo.");
      nav(-1);
    }
  }, [authLoading, permisos, nav, toast]);

  const defaults = useMemo(() => defaultCustomRange(), []);
  const [period, setPeriod] = useState(PERIOD.MONTH);
  const [customFrom, setCustomFrom] = useState(defaults.from);
  const [customTo, setCustomTo] = useState(defaults.to);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setErr("");

    const q = query(collection(db, "solicitudesOT"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          if (!isSolicitudOtInScope(data, profile?.tenantId, profile?.company)) return;
          list.push({
            id: d.id,
            createdAt: data.createdAt || null,
            OTState: data.OTState || "Solicitada",
            solicitanteNombre: data.solicitanteNombre || "",
            solicitanteFicha: data.solicitanteFicha || "",
            responsableNombre: data.responsableNombre || "",
            departamento: data.departamento || data.departamentoBase || "",
            lugarProblema: data.lugarProblema === "Otro"
              ? (data.lugarProblemaOtro || "Otro")
              : (data.lugarProblema || ""),
            tipoProblema: data.tipoProblema === "Otro"
              ? (data.tipoProblemaOtro || "Otro")
              : (data.tipoProblema || ""),
          });
        });
        setRows(list);
        console.log("[OTsDashboard] sample fields:", list.slice(0, 5).map(r => ({ id: r.id, departamento: r.departamento, lugarProblema: r.lugarProblema, tipoProblema: r.tipoProblema })));
        setLoading(false);
      },
      (e) => {
        console.error("OTsDashboard solicitudesOT:", e);
        setErr("No se pudieron cargar las solicitudesOT.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [authLoading, profile?.tenantId, profile?.company]);

  const metrics = useOTsDashboardMetrics(rows, period, customFrom, customTo);

  const rangeLabel = `${metrics.range.start.toLocaleDateString("es-CR")} — ${metrics.range.end.toLocaleDateString(
    "es-CR"
  )}`;

  return (
    <Shell lockBodyScroll={false}>
      <Topbar>
        <Brand
          icon={Wrench}
          title="Mantenimiento"
          subtitle="Dashboard · Órdenes de trabajo"
          onClick={() => nav("/mantenimiento/ots")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mantenimiento/ots")}>
            Órdenes de trabajo
          </GhostButton>
          <GhostButton icon={LayoutGrid} onClick={() => nav("/mantenimiento/OTsPage")}>
            Tablero
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container max={1280}>
          <header className="otsDashboard__header">
            <h1 className="otsDashboard__title">Dashboard</h1>
            <p className="otsDashboard__subtitle">
              Métricas por solicitudesOT. Rango activo: {rangeLabel}
            </p>
            <span className="otsDashboard__badge">
              {loading ? "Cargando…" : `${rows.length} solicitud(es) en ámbito`}
            </span>
          </header>

      <div className="otsDashboard__toolbar">
        <div className="otsDashboard__field">
          <label>Período</label>
          <div className="otsDashboard__period-btns">
            <button
              type="button"
              className={period === PERIOD.DAY ? "is-active" : ""}
              onClick={() => setPeriod(PERIOD.DAY)}
            >
              Día
            </button>
            <button
              type="button"
              className={period === PERIOD.WEEK ? "is-active" : ""}
              onClick={() => setPeriod(PERIOD.WEEK)}
            >
              Semana
            </button>
            <button
              type="button"
              className={period === PERIOD.MONTH ? "is-active" : ""}
              onClick={() => setPeriod(PERIOD.MONTH)}
            >
              Mes
            </button>
            <button
              type="button"
              className={period === PERIOD.CUSTOM ? "is-active" : ""}
              onClick={() => setPeriod(PERIOD.CUSTOM)}
            >
              Personalizado
            </button>
          </div>
        </div>

        {period === PERIOD.CUSTOM ? (
          <>
            <div className="otsDashboard__field">
              <label>Desde</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="otsDashboard__field">
              <label>Hasta</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      {err ? <p className="otsDashboard__muted">{err}</p> : null}

      <section className="otsDashboard__kpis">
        <div className="otsDashboard__kpi">
          <div className="otsDashboard__kpi-label">Solicitudes en período</div>
          <div className="otsDashboard__kpi-value">{metrics.summary.total}</div>
        </div>
        <div className="otsDashboard__kpi">
          <div className="otsDashboard__kpi-label">Solicitadas</div>
          <div className="otsDashboard__kpi-value">{metrics.summary.solicitada}</div>
        </div>
        <div className="otsDashboard__kpi">
          <div className="otsDashboard__kpi-label">En proceso</div>
          <div className="otsDashboard__kpi-value">{metrics.summary.proceso}</div>
        </div>
        <div className="otsDashboard__kpi">
          <div className="otsDashboard__kpi-label">En revisión</div>
          <div className="otsDashboard__kpi-value">{metrics.summary.revision}</div>
        </div>
        <div className="otsDashboard__kpi">
          <div className="otsDashboard__kpi-label">Finalizadas</div>
          <div className="otsDashboard__kpi-value">{metrics.summary.finalizada}</div>
        </div>
      </section>



      <div className="otsDashboard__grid">
        <div className="otsDashboard__card otsDashboard__card--half">
          <h2 className="otsDashboard__card-title">Solicitudes por día de la semana</h2>
          <p className="otsDashboard__card-hint">Distribución en el período seleccionado</p>
          <div className="otsDashboard__chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.byWeekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Solicitudes" fill="#00DDB5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="otsDashboard__card otsDashboard__card--half">
          <h2 className="otsDashboard__card-title">Volumen por fecha</h2>
          <p className="otsDashboard__card-hint">Evolución de solicitudes en el rango</p>
          <div className="otsDashboard__chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.byCalendarDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="Solicitudes" stroke="#0f172a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="otsDashboard__card">
          <h2 className="otsDashboard__card-title">Solicitudes por Departamento</h2>
          <p className="otsDashboard__card-hint">Total de solicitudes por departamento en el período</p>
          {metrics.topDepartamentos.length === 0 ? (
            <p className="otsDashboard__muted">Sin datos de departamento.</p>
          ) : (
            <TableScroll minWidth={360} bordered={false}>
            <table className="otsDashboard__table">
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Solicitudes</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topDepartamentos.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </div>

        <div className="otsDashboard__card otsDashboard__card--half">
          <h2 className="otsDashboard__card-title">Áreas más impactadas</h2>
          <p className="otsDashboard__card-hint">Lugar del problema con más solicitudes en el período</p>
          {metrics.topLugaresProblema.length === 0 ? (
            <p className="otsDashboard__muted">Sin datos de lugar de problema.</p>
          ) : (
            <TableScroll minWidth={360} bordered={false}>
            <table className="otsDashboard__table">
              <thead>
                <tr>
                  <th>Lugar / Área</th>
                  <th>Solicitudes</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topLugaresProblema.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </div>

        <div className="otsDashboard__card otsDashboard__card--half">
          <h2 className="otsDashboard__card-title">Tipos de problemas recurrentes</h2>
          <p className="otsDashboard__card-hint">Clasificación por tipo de problema en el período</p>
          {metrics.topTiposProblema.length === 0 ? (
            <p className="otsDashboard__muted">Sin datos de tipo de problema.</p>
          ) : (
            <TableScroll minWidth={360} bordered={false}>
            <table className="otsDashboard__table">
              <thead>
                <tr>
                  <th>Tipo de problema</th>
                  <th>Solicitudes</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topTiposProblema.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </div>

        <div className="otsDashboard__card otsDashboard__card--third">
          <h2 className="otsDashboard__card-title">Solicitantes con más solicitudes</h2>
          <TableScroll minWidth={360} bordered={false}>
          <table className="otsDashboard__table">
            <thead>
              <tr>
                <th>Solicitante</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topSolicitantes.length === 0 ? (
                <tr>
                  <td colSpan={2} className="otsDashboard__muted">
                    Sin datos.
                  </td>
                </tr>
              ) : (
                metrics.topSolicitantes.map((u) => (
                  <tr key={u.key}>
                    <td>{u.name}</td>
                    <td>{u.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </TableScroll>
        </div>

        <div className="otsDashboard__card otsDashboard__card--third">
          <h2 className="otsDashboard__card-title">Responsables con más OTs</h2>
          <p className="otsDashboard__card-hint">Conteo por nombres en `responsableNombre`</p>
          <TableScroll minWidth={360} bordered={false}>
          <table className="otsDashboard__table">
            <thead>
              <tr>
                <th>Responsable</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topResponsables.length === 0 ? (
                <tr>
                  <td colSpan={2} className="otsDashboard__muted">
                    Sin responsables asignados en este período.
                  </td>
                </tr>
              ) : (
                metrics.topResponsables.map((u) => (
                  <tr key={u.name}>
                    <td>{u.name}</td>
                    <td>{u.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </TableScroll>
        </div>
      </div>
        </Container>
      </Main>
    </Shell>
  );
}



