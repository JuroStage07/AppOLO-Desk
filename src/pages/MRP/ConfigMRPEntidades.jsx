// Configuración MRP Tarimas › Relación de entidades.
//
// Liga cada BODEGA del catálogo Firebase (src/config/bodegas.js) a UN almacén del
// MRP (pallet_warehouses en Supabase, columna bodega_id). Al cambiar de bodega el
// módulo resuelve solo el almacén ligado (ya no se selecciona a mano).
//
// El vínculo se guarda en Supabase (requiere supabase/mrp_pallets_bodega_link.sql).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Boxes, Warehouse, Link2, Link2Off } from "lucide-react";
import {
  Badge,
  Brand,
  Container,
  EmptyState,
  Field,
  GhostButton,
  Hero,
  Main,
  Shell,
  Spinner,
  Topbar,
  useToast,
} from "../../components/ui";
import { BODEGA_OPTIONS, TENANT_OPTIONS } from "../../config/bodegas";
import {
  listAllPalletWarehouses,
  setWarehouseBodega,
  unlinkBodega,
} from "../../services/mrp";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, TEXT } from "../../styles/theme";

const HUB_PATH = "/dev/config-modulos/mrp-tarimas";

export default function ConfigMRPEntidades() {
  const nav = useNavigate();
  const toast = useToast();

  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingBodega, setSavingBodega] = useState(null); // bodegaId en curso

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAllPalletWarehouses({ includeInactive: true });
      setWarehouses(data);
    } catch (e) {
      console.error("Error cargando almacenes del MRP:", e);
      setError(
        e?.message ||
          "No se pudieron cargar los almacenes. Verificá la migración de Supabase (bodega_id + RLS)."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // { [bodegaId]: warehouse } — vínculo actual derivado de warehouses.bodega_id.
  const linkByBodega = useMemo(() => {
    const map = {};
    warehouses.forEach((w) => {
      if (w.bodega_id) map[w.bodega_id] = w;
    });
    return map;
  }, [warehouses]);

  // Bodegas agrupadas por tenant (país).
  const groups = useMemo(
    () =>
      TENANT_OPTIONS.map((t) => ({
        tenant: t,
        bodegas: BODEGA_OPTIONS.filter((b) => b.tenantId === t.id),
      })).filter((g) => g.bodegas.length > 0),
    []
  );

  const linkedCount = useMemo(
    () => BODEGA_OPTIONS.filter((b) => linkByBodega[b.id]).length,
    [linkByBodega]
  );

  const warehousesForBodega = useCallback(
    (bodega) =>
      warehouses.filter(
        (w) => w.tenant_id === bodega.tenantId && w.company === bodega.company
      ),
    [warehouses]
  );

  const handleChange = async (bodega, warehouseId) => {
    setSavingBodega(bodega.id);
    try {
      if (warehouseId) {
        await setWarehouseBodega(warehouseId, bodega.id);
        toast.success(`Bodega “${bodega.label}” ligada al almacén.`);
      } else {
        await unlinkBodega(bodega.id);
        toast.success(`Bodega “${bodega.label}” desligada.`);
      }
      await load();
    } catch (e) {
      console.error("Error ligando bodega:", e);
      toast.error(e?.message || "No se pudo actualizar el vínculo.");
    } finally {
      setSavingBodega(null);
    }
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Link2}
          title="Relación de entidades"
          subtitle="Configuración MRP Tarimas"
          onClick={() => nav(HUB_PATH)}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav(HUB_PATH)}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Relación de entidades"
            title="Bodegas ↔ Almacenes del MRP"
            subtitle="Ligá cada bodega a un almacén del MRP. Al seleccionar una bodega para trabajar, el módulo carga automáticamente los datos del almacén ligado."
            badge={<Badge icon={Boxes}>Módulo MRP Tarimas</Badge>}
          />

          {loading ? (
            <Spinner label="Cargando almacenes…" />
          ) : error ? (
            <EmptyState
              icon={Warehouse}
              title="No se pudieron cargar los almacenes"
              description={error}
              action={<GhostButton onClick={load}>Reintentar</GhostButton>}
            />
          ) : (
            <div style={styles.wrap}>
              <div style={styles.summary}>
                <Badge tone="accent" icon={Link2}>
                  {linkedCount}/{BODEGA_OPTIONS.length} bodegas ligadas
                </Badge>
              </div>

              {groups.map((g) => (
                <section key={g.tenant.id} style={styles.section}>
                  <h3 style={styles.sectionTitle}>{g.tenant.label}</h3>
                  <div style={styles.list}>
                    {g.bodegas.map((bodega) => {
                      const opts = warehousesForBodega(bodega);
                      const linked = linkByBodega[bodega.id] || null;
                      const busy = savingBodega === bodega.id;
                      return (
                        <div key={bodega.id} style={styles.row}>
                          <div style={styles.bodegaInfo}>
                            <div style={styles.iconBox}>
                              <Warehouse size={17} strokeWidth={2.2} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={styles.bodegaName}>{bodega.label}</div>
                              <div style={styles.bodegaId}>{bodega.id}</div>
                            </div>
                          </div>

                          <div style={styles.control}>
                            {opts.length === 0 ? (
                              <span style={styles.noWh}>
                                <Link2Off size={13} strokeWidth={2.3} />
                                Sin almacenes en este tenant
                              </span>
                            ) : (
                              <Field.Select
                                value={linked?.id || ""}
                                disabled={busy}
                                onChange={(e) => handleChange(bodega, e.target.value)}
                                style={{
                                  fontWeight: 800,
                                  ...(linked
                                    ? { borderColor: ACCENT, background: ACCENT_SOFT }
                                    : {}),
                                }}
                              >
                                <option value="">— Sin ligar —</option>
                                {opts.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                    {w.code ? ` (${w.code})` : ""}
                                    {w.active ? "" : " · inactivo"}
                                  </option>
                                ))}
                              </Field.Select>
                            )}
                            {busy ? <Spinner inline /> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <p style={styles.note}>
                Los almacenes se crean en el MRP (Catálogos › Almacenes). Cada bodega
                puede ligarse a un solo almacén y cada almacén a una sola bodega.
              </p>
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const styles = {
  wrap: { display: "grid", gap: 20 },
  summary: { display: "flex", gap: 8, flexWrap: "wrap" },
  section: { display: "grid", gap: 10 },
  sectionTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 900,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: { display: "grid", gap: 10 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: "13px 16px",
  },
  bodegaInfo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flex: "1 1 220px",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    background: ACCENT_SOFT,
    color: ACCENT,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  bodegaName: {
    fontSize: 14,
    fontWeight: 850,
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  bodegaId: { fontSize: 11, fontWeight: 600, color: SLATE, marginTop: 1 },
  control: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: "0 1 320px",
    justifyContent: "flex-end",
  },
  noWh: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: SLATE,
  },
  note: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 650,
    color: SLATE,
    lineHeight: 1.5,
  },
};
