import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileOutput,
  FilePlus2,
  Inbox,
  KeyRound,
  Lock,
  Truck,
} from "lucide-react";
import {
  Shell,
  Topbar,
  Brand,
  Main,
  Container,
  Hero,
  Badge,
  Card,
  GhostButton,
  PrimaryButton,
  SearchInput,
  Chip,
  ChipsRow,
  RowCard,
  StatusPill,
  SectionTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  theme,
} from "../../../components/ui";
import { AuthCtx } from "../../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../../config/permissions";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
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

// Cantidad de boletas en la vista de solo lectura (sin permiso de validar).
const LECTURA_LIMIT = 20;

function BoletaRow({ boleta, onClick }) {
  return (
    <RowCard
      title={`${boleta.numero_formateado} · ${boleta.chofer_nombre || "Sin chofer"}`}
      desc={`${TIPO_VEHICULO_LABELS[boleta.tipo_vehiculo] || boleta.tipo_vehiculo || ""} · ${
        boleta.placa_camion || "—"
      }${boleta.cargado ? ` · ${boleta.destino || "cargado"}` : " · sin carga"}`}
      meta={boleta.created_at ? new Date(boleta.created_at).toLocaleString("es-CR") : ""}
      extra={
        <StatusPill tone={ESTADO_BOLETA_TONE[boleta.estado] || "neutral"} icon={null}>
          {ESTADO_BOLETA_LABELS[boleta.estado] || boleta.estado}
        </StatusPill>
      }
      onClick={onClick}
    />
  );
}

export default function BoletasSalidaHome() {
  const nav = useNavigate();
  const { role, permisos, profile } = useContext(AuthCtx) || {};
  const { configurado, sessionReady, hasSession, scopeComplete, scope } =
    useSupabaseAuth();

  const hasAccess = configurado && hasSession && scopeComplete;

  // Permiso de validación (Firebase). Sin él: pantalla de solo lectura
  // (crear + rechazar), sin filtros ni flujo de validar.
  const puedeValidar = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["boletasValidar"] }
  );

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
      // Validadores: listado completo con filtros. Solo lectura: últimas N.
      const filtros = puedeValidar
        ? { estado: estado || undefined, texto }
        : { limit: LECTURA_LIMIT };
      const rows = await listarBoletas(filtros);
      setBoletas(rows);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, puedeValidar, estado, texto]);

  useEffect(() => {
    if (!sessionReady) return;
    load();
  }, [sessionReady, load]);

  const pendientes = useMemo(
    () => boletas.filter((b) => b.estado === "pendiente_validacion").length,
    [boletas]
  );

  function handleCreated(boleta) {
    setGenerarOpen(false);
    load();
    if (boleta?.numero_formateado) setQr(boleta);
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

  // Gating por sesión de Supabase (autoridad real del scope).
  function AccessNotice() {
    let title = "Acceso no disponible";
    let description = "No se pudo determinar el acceso a las boletas de salida.";
    if (!configurado) {
      title = "Supabase no está configurado";
      description =
        "Definí las variables de entorno de Supabase para habilitar el módulo.";
    } else if (!hasSession) {
      title = "Iniciá sesión en Supabase";
      description =
        "Las boletas de salida usan la sesión de Supabase del área de Desarrollo. Iniciá sesión para ver y generar boletas.";
    } else if (!scopeComplete) {
      title = "La sesión no trae scope";
      description =
        "Tu usuario de Supabase no tiene tenant/company/bodega asignados. Contactá al administrador.";
    }
    return (
      <EmptyState
        center
        icon={Lock}
        title={title}
        description={description}
        action={
          configurado && !hasSession ? (
            <PrimaryButton icon={KeyRound} onClick={() => nav("/dev/supabase")}>
              Ir al login de Supabase
            </PrimaryButton>
          ) : null
        }
      />
    );
  }

  // Vista completa (con permiso de validar): filtros + listado filtrable.
  function VistaValidador() {
    return (
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
              <BoletaRow key={b.id} boleta={b} onClick={() => setDetalle(b)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vista de solo lectura (sin permiso de validar): aviso para crear + últimas
  // boletas creadas. Sin filtros. Puede abrir el detalle para rechazar.
  function VistaLectura() {
    return (
      <div style={styles.stack}>
        <Card padding={theme.SPACE_5} style={styles.cta}>
          <div style={styles.ctaIcon}>
            <FileOutput size={22} strokeWidth={2.2} color={theme.ACCENT} aria-hidden="true" />
          </div>
          <div style={styles.ctaTitle}>Generá una boleta de salida</div>
          <div style={styles.ctaText}>
            Registrá la salida de un vehículo: chofer, placas, carga y destino. La
            boleta queda pendiente de validación.
          </div>
          <PrimaryButton icon={FilePlus2} onClick={() => setGenerarOpen(true)}>
            Generar boleta
          </PrimaryButton>
        </Card>

        <SectionTitle
          title="Últimas boletas"
          hint="Boletas creadas recientemente en tu bodega."
        />

        {boletas.length === 0 ? (
          <EmptyState
            center
            icon={Inbox}
            title="Sin boletas"
            description="Todavía no hay boletas. Generá la primera boleta de salida."
          />
        ) : (
          <div style={styles.list}>
            {boletas.map((b) => (
              <BoletaRow key={b.id} boleta={b} onClick={() => setDetalle(b)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  let body;
  if (!sessionReady) {
    body = (
      <div style={styles.center}>
        <Spinner />
      </div>
    );
  } else if (!hasAccess) {
    body = <AccessNotice />;
  } else if (loading && boletas.length === 0 && !error) {
    body = (
      <div style={styles.stack}>
        <Skeleton height={44} radius={theme.RADIUS_MD} />
        <Skeleton.Cards count={5} height={92} />
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        title="No se pudieron cargar las boletas"
        description="Revisá tu conexión e intentá nuevamente."
        onRetry={load}
      />
    );
  } else if (puedeValidar) {
    body = <VistaValidador />;
  } else {
    body = <VistaLectura />;
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
            subtitle={
              puedeValidar
                ? "Generá boletas de salida de vehículos, validalas con checklist y firma, y consultá su historial."
                : "Generá boletas de salida de vehículos y consultá las últimas registradas."
            }
            badge={
              hasAccess && puedeValidar && pendientes > 0 ? (
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
        onCreated={handleCreated}
      />

      <DetalleBoletaSheet
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        boleta={detalle}
        puedeValidar={puedeValidar}
        onValidar={handleOpenValidar}
        onQR={(b) => setQr(b)}
        onChanged={handleDetalleChanged}
      />

      {puedeValidar ? (
        <ValidarBoletaSheet
          open={Boolean(validar)}
          onClose={() => setValidar(null)}
          boleta={validar}
          scope={scope}
          onDone={handleValidado}
        />
      ) : null}

      <BoletaQRModal open={Boolean(qr)} onClose={() => setQr(null)} boleta={qr} />
    </Shell>
  );
}

const styles = {
  stack: { display: "grid", gap: theme.SPACE_4 },
  toolbar: { display: "grid", gap: theme.SPACE_3 },
  list: { display: "grid", gap: theme.SPACE_3 },
  center: { display: "grid", placeItems: "center", padding: 40 },
  cta: {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    gap: theme.SPACE_3,
  },
  ctaIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.RADIUS,
    background: theme.ACCENT_SOFT,
    border: `1px solid ${theme.ACCENT_BORDER}`,
    display: "grid",
    placeItems: "center",
  },
  ctaTitle: { color: theme.TEXT, fontWeight: theme.FW_EXTRABOLD, fontSize: theme.FS_LG },
  ctaText: {
    color: theme.SLATE,
    fontWeight: theme.FW_MEDIUM,
    fontSize: theme.FS_SM,
    lineHeight: theme.LH_NORMAL,
    maxWidth: 460,
  },
};
