// MRP Tarimas — Inventario de tarimas (acotado al almacén de trabajo).
import React, { useState } from "react";
import { Package, Plus, ArrowLeftRight } from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Hero,
  Badge,
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import {
  usePalletInventory,
  usePalletBrands,
  useMrpWorkspace,
} from "../../hooks/mrp";
import {
  PALLET_TYPES,
  PALLET_TYPE_LABELS,
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
} from "../../services/mrp";
import { th, td, filtersRow } from "./components/mrpFormat";
import { LocationBadge, TypeBadge } from "./components/mrpUi";
import WorkspaceBar, { NoWarehouse } from "./components/WorkspaceBar";
import AjusteModal from "./components/AjusteModal";
import TrasladoModal from "./components/TrasladoModal";

export default function MRPInventarioPage() {
  const { warehouseId } = useMrpWorkspace();
  const [filters, setFilters] = useState({
    location: "",
    brandId: "",
    palletType: "",
  });
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const { brands } = usePalletBrands({ warehouseId });
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    location: filters.location || null,
    brandId: filters.brandId || null,
    palletType: filters.palletType || null,
  });

  const [ajuste, setAjuste] = useState({ open: false, prefill: null });
  const [traslado, setTraslado] = useState({ open: false, prefill: null });

  const openAjuste = (prefill = null) => setAjuste({ open: true, prefill });
  const openTraslado = (prefill = null) => setTraslado({ open: true, prefill });

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          <Hero
            kicker="MRP Tarimas"
            title="Inventario de tarimas"
            subtitle="Stock por ubicación, marca y tipo en el almacén de trabajo."
            badge={<Badge tone="accent">Inventario</Badge>}
            aside={
              warehouseId ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
                    Ajuste
                  </PrimaryButton>
                  <SecondaryButton
                    icon={ArrowLeftRight}
                    onClick={() => openTraslado()}
                  >
                    Traslado
                  </SecondaryButton>
                </div>
              ) : null
            }
          />

          <WorkspaceBar />

          {!warehouseId ? (
            <NoWarehouse />
          ) : (
            <>
              {/* Filtros */}
              <Card>
                <div style={filtersRow}>
                  <Field label="Ubicación">
                    <Field.Select
                      value={filters.location}
                      onChange={(e) => set("location", e.target.value)}
                    >
                      <option value="">Todas</option>
                      {PALLET_LOCATIONS.map((l) => (
                        <option key={l} value={l}>
                          {PALLET_LOCATION_LABELS[l]}
                        </option>
                      ))}
                    </Field.Select>
                  </Field>
                  <Field label="Marca">
                    <Field.Select
                      value={filters.brandId}
                      onChange={(e) => set("brandId", e.target.value)}
                    >
                      <option value="">Todas</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Field.Select>
                  </Field>
                  <Field label="Tipo">
                    <Field.Select
                      value={filters.palletType}
                      onChange={(e) => set("palletType", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {PALLET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PALLET_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Field.Select>
                  </Field>
                </div>
              </Card>

              <SectionTitle
                title="Existencias"
                hint={!loading ? `${inventory.length} fila(s)` : undefined}
              />

              {loading ? (
                <Spinner label="Cargando inventario…" />
              ) : error ? (
                <ErrorState description={error.message} onRetry={refetch} />
              ) : inventory.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Sin existencias"
                  description="No hay tarimas con los filtros seleccionados."
                  action={
                    <PrimaryButton icon={Plus} onClick={() => openAjuste()}>
                      Registrar ajuste
                    </PrimaryButton>
                  }
                />
              ) : (
                <Card padding={0}>
                  <TableScroll minWidth={720}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Ubicación</th>
                          <th style={th}>Tienda</th>
                          <th style={th}>Marca</th>
                          <th style={th}>Tipo</th>
                          <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                          <th style={{ ...th, textAlign: "right" }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.map((r) => (
                          <tr key={r.id}>
                            <td style={td}>
                              <LocationBadge value={r.location} />
                            </td>
                            <td style={td}>
                              {r.store
                                ? `${r.store.store_number} · ${r.store.name}`
                                : "—"}
                            </td>
                            <td style={td}>{r.brand?.name || "—"}</td>
                            <td style={td}>
                              <TypeBadge value={r.pallet_type} />
                            </td>
                            <td
                              style={{ ...td, textAlign: "right", fontWeight: 950 }}
                            >
                              {r.quantity}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: 6,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <GhostButton
                                  size="sm"
                                  icon={ArrowLeftRight}
                                  onClick={() =>
                                    openTraslado({
                                      originLocation: r.location,
                                      originStoreId: r.store_id || "",
                                      brandId: r.brand_id,
                                      palletType: r.pallet_type,
                                    })
                                  }
                                >
                                  Trasladar
                                </GhostButton>
                                <GhostButton
                                  size="sm"
                                  icon={Plus}
                                  onClick={() =>
                                    openAjuste({
                                      brandId: r.brand_id,
                                      palletType: r.pallet_type,
                                      originLocation: r.location,
                                    })
                                  }
                                >
                                  Ajustar
                                </GhostButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                </Card>
              )}
            </>
          )}
        </Container>
      </Main>

      <AjusteModal
        open={ajuste.open}
        prefill={ajuste.prefill}
        onClose={() => setAjuste({ open: false, prefill: null })}
      />
      <TrasladoModal
        open={traslado.open}
        prefill={traslado.prefill}
        onClose={() => setTraslado({ open: false, prefill: null })}
      />
    </Shell>
  );
}
