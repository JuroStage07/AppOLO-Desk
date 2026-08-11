import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileOutput, FilePlus2, Inbox, Lock, Truck } from "lucide-react";
import {
  Shell,
  Topbar,
  Brand,
  Main,
  Container,
  Hero,
  Badge,
  GhostButton,
  PrimaryButton,
  SearchInput,
  Chip,
  ChipsRow,
  RowCard,
  StatusPill,
  EmptyState,
  ErrorState,
  Skeleton,
  theme,
} from "../../../components/ui";
import { AuthCtx } from "../../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../../config/permissions";
import {
  ESTADO_BOLETA_LABELS,
  ESTADO_BOLETA_TONE,
  TIPO_VEHICULO_LABELS,
} from "../../../services/despachoDev/constants";
import { listarBoletas } from "../../../services/despachoDev/boletasDev";
import GenerarBoletaModal from "./GenerarBoletaModal";
import DetalleBoletaSheet from "./DetalleBoletaSheet";
import ValidarBoletaSheet from "./ValidarBoletaSheet";
import BoletaQRModal from "./BoletaQRModal";

const ESTADO_FILTERS = [
  { key: "", label: "Todas" },
  { key: "pendiente_validacion", label: "Pendientes" },
  { key: "despachado", label: "Despachadas" },
  { key: "rechazado", label: "Rechazadas" },
];

export default function BoletasSalidaHome() {
  const nav = useNavigate();
  const { user, role, permisos, profile, tenantId, company, bodegaId, loading: authLoading } =
    useContext(AuthCtx) || {};

  const scope = useMemo(
    () => ({ tenantId, company, bodegaId }),
    [tenantId, company, bodegaId]
  );
  const actor = user?.email || user?.uid || null;

  const hasPermission = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["boletasSalida"] }
  );
  const hasScope = Boolean(tenantId && company && bodegaId);
  const hasAccess = hasPermission && hasScope;

  const [boletas, setBoletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [estado, setEstado] = useState("");
  const [texto, setTexto] = useState("");

  const [generarOpen, setGenerarOpen] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [validar, setValidar] = useState(null);
  const [qr, setQr] = useState(null);

  const load = useCallback(async () => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listarBoletas(scope, { estado: estado || undefined, texto });
      setBoletas(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, scope, estado, texto]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const pendientes = useMemo(
    () => boletas.filter((b) => b.estado === "pendiente_validacion").length,
    [boletas]
  );

  function handleCreated(res) {
    setGenerarOpen(false);
    load();
    if (res?.boletaId) {
      // Mostrar el QR de la boleta recién generada.
      setQr({ numero_formateado: res.numeroFormateado });
    }
  }

  function handleOpenValidar(boleta) {
    setDetalle(null);
    setValidar(boleta);
  }

  function handleValidado() {
    setValidar(null);
    load();
  }

  function handleDetalleChanged() {
    setDetalle(null);
    load();
  }

  let body;
  if (authLoading || (loading && boletas.length === 0 && !error)) {
    body = (
      <div style={styles.stack}>
        <Skeleton height={44} radius={theme.RADIUS_MD} />
        <Skeleton.Cards count={5} height={92} />
      </div>
    );
  } else if (!hasAccess) {
    body = (
      <EmptyState
        center
        icon={Lock}
        title="Acceso no disponible"
        description="No tenés el permiso de Boletas de salida o tu perfil no tiene una bodega activa asignada. Contactá al administrador."
      />
    );
  } else if (error) {
    body = (
      <ErrorState
        title="No se pudieron cargar las boletas"
        description="Revisá tu conexión e intentá nuevamente."
        onRetry={load}
      />
    );
  } else {
    body = (
      <div style={styles.stack}>
        <div style={styles.toolbar}>
          <SearchInput
            value={texto}
            onChange={setTexto}
            placeholder="Buscar por número, chofer, cédula o placa…"
          />
          <ChipsRow>
            {ESTADO_FILTERS.map((f) => (
              <Chip
                key={f.key || "all"}
                active={estado === f.key}
                onClick={() => setEstado(f.key)}
              >
                {f.label}
              </Chip>
            ))}
          </ChipsRow>
        </div>

        {boletas.length === 0 ? (
          <EmptyState
            center
            icon={Inbox}
            title="Sin boletas"
            description="Todavía no hay boletas para los filtros actuales. Generá una nueva boleta de salida."
          />
        ) : (
          <div style={styles.list}>
            {boletas.map((b) => (
              <RowCard
                key={b.id}
                title={`${b.numero_formateado} · ${b.chofer_nombre || "Sin chofer"}`}
                desc={`${TIPO_VEHICULO_LABELS[b.tipo_vehiculo] || b.tipo_vehiculo || ""} · ${
                  b.placa_camion || "—"
                }${b.cargado ? ` · ${b.destino || "cargado"}` : " · sin carga"}`}
                meta={b.created_at ? new Date(b.created_at).toLocaleString("es-CR") : ""}
                extra={
                  <StatusPill tone={ESTADO_BOLETA_TONE[b.estado] || "neutral"} icon={null}>
                    {ESTADO_BOLETA_LABELS[b.estado] || b.estado}
                  </StatusPill>
                }
                onClick={() => setDetalle(b)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={FileOutput}
          title="Boletas de salida"
          subtitle="Servicios Generales"
          onClick={() => nav("/servicios-generales")}
        />
        <Topbar.Right>
          {hasAccess ? (
            <PrimaryButton icon={FilePlus2} onClick={() => setGenerarOpen(true)}>
              Generar boleta
            </PrimaryButton>
          ) : null}
          <GhostButton icon={ArrowLeft} onClick={() => nav("/servicios-generales")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Registro de salida"
            title="Boletas de salida"
            subtitle="Generá boletas de salida de vehículos, validalas con checklist y firma, y consultá su historial."
            badge={
              hasAccess && pendientes > 0 ? (
                <Badge icon={Truck}>{pendientes} pendiente(s)</Badge>
              ) : (
                <Badge icon={Lock}>Servicios Generales</Badge>
              )
            }
          />
          {body}
        </Container>
      </Main>

      <GenerarBoletaModal
        open={generarOpen}
        onClose={() => setGenerarOpen(false)}
        scope={scope}
        createdBy={actor}
        onCreated={handleCreated}
      />

      <DetalleBoletaSheet
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        boleta={detalle}
        scope={scope}
        rejectedBy={actor}
        onValidar={handleOpenValidar}
        onQR={(b) => setQr(b)}
        onChanged={handleDetalleChanged}
      />

      <ValidarBoletaSheet
        open={Boolean(validar)}
        onClose={() => setValidar(null)}
        boleta={validar}
        scope={scope}
        validatedBy={actor}
        onDone={handleValidado}
      />

      <BoletaQRModal open={Boolean(qr)} onClose={() => setQr(null)} boleta={qr} />
    </Shell>
  );
}

const styles = {
  stack: { display: "grid", gap: theme.SPACE_4 },
  toolbar: { display: "grid", gap: theme.SPACE_3 },
  list: { display: "grid", gap: theme.SPACE_3 },
};
