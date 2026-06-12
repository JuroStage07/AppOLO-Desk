import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Edit,
  Eye,
  Plus,
} from "lucide-react";
import {
  Badge,
  Brand,
  Chip,
  ChipsRow,
  Container,
  Field,
  GhostButton,
  Hero,
  KpiCard,
  KpiGrid,
  Main,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  SectionTitle,
  Sheet,
  Shell,
  StatusPill,
  TableScroll,
  Topbar,
} from "../../components/ui";
import { MATERIALES as INITIAL_MATERIALES } from "../../mocks/mockMRPTarimas";
import { ACCENT, BORDER, SLATE, TEXT } from "../../styles/theme";

function getEstadoStock(mat) {
  if (mat.stock === 0) return "agotado";
  if (mat.stock <= mat.stockMinimo) return "bajo";
  return "suficiente";
}

const ESTADO_TONE_MAT = {
  suficiente: "ok",
  bajo: "warn",
  agotado: "danger",
};

const ESTADO_LABEL_MAT = {
  suficiente: "Suficiente",
  bajo: "Bajo inventario",
  agotado: "Agotado",
};

export default function MRPMaterialesPage() {
  const nav = useNavigate();

  const [materiales, setMateriales] = useState(INITIAL_MATERIALES);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");

  // Add stock sheet
  const [addStockSheet, setAddStockSheet] = useState(false);
  const [selectedMat, setSelectedMat] = useState(null);
  const [addQty, setAddQty] = useState(0);

  // Detail sheet
  const [detailMat, setDetailMat] = useState(null);

  const filtered = useMemo(() => {
    return materiales.filter((m) => {
      const estado = getEstadoStock(m);
      if (filterEstado !== "todos" && estado !== filterEstado) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !m.nombre.toLowerCase().includes(q) &&
          !m.sku.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [materiales, search, filterEstado]);

  const totalMateriales = materiales.length;
  const bajoInv = materiales.filter((m) => m.stock <= m.stockMinimo && m.stock > 0).length;
  const agotados = materiales.filter((m) => m.stock === 0).length;
  const valorTotal = materiales.reduce((acc, m) => acc + m.stock * m.costoUnitario, 0);

  const openAddStock = (mat) => {
    setSelectedMat(mat);
    setAddQty(0);
    setAddStockSheet(true);
  };

  const submitAddStock = () => {
    if (!selectedMat || addQty <= 0) return;
    setMateriales((prev) =>
      prev.map((m) =>
        m.id === selectedMat.id ? { ...m, stock: m.stock + Number(addQty) } : m
      )
    );
    setAddStockSheet(false);
    setSelectedMat(null);
  };

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Box}
          title="Materiales"
          subtitle="Control de stock"
          onClick={() => nav("/mrp-tarimas/materiales")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/mrp-tarimas")}>
            MRP
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            layout="compact"
            kicker="MRP Tarimas"
            title="Materiales"
            badge={<Badge icon={Box}>Stock</Badge>}
          />

          <KpiGrid min={180}>
            <KpiCard
              label="Total materiales"
              value={totalMateriales}
              hint="SKUs registrados"
              icon={Box}
            />
            <KpiCard
              label="Bajo inventario"
              value={bajoInv}
              hint="Por debajo del mínimo"
              icon={AlertTriangle}
              accent
            />
            <KpiCard
              label="Agotados"
              value={agotados}
              hint="Sin stock disponible"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Valor en stock"
              value={`₡${valorTotal.toLocaleString()}`}
              hint="Costo × cantidad"
              icon={Box}
            />
          </KpiGrid>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o SKU..."
          />

          <ChipsRow>
            <Chip active={filterEstado === "todos"} onClick={() => setFilterEstado("todos")}>
              Todos
            </Chip>
            <Chip active={filterEstado === "suficiente"} onClick={() => setFilterEstado("suficiente")}>
              Suficiente
            </Chip>
            <Chip active={filterEstado === "bajo"} onClick={() => setFilterEstado("bajo")}>
              Bajo inventario
            </Chip>
            <Chip active={filterEstado === "agotado"} onClick={() => setFilterEstado("agotado")}>
              Agotado
            </Chip>
          </ChipsRow>

          <SectionTitle
            title="Inventario de materiales"
            hint={`${filtered.length} material${filtered.length !== 1 ? "es" : ""}`}
          />

          <div style={styles.tableWrap}>
            <TableScroll minWidth={880} bordered={false}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Material</th>
                  <th style={styles.th}>Unidad</th>
                  <th style={styles.th}>Stock</th>
                  <th style={styles.th}>Mínimo</th>
                  <th style={styles.th}>Costo unit.</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const estado = getEstadoStock(m);
                  return (
                    <tr key={m.id} style={styles.tr}>
                      <td style={styles.td}>
                        <span style={styles.tdAccent}>{m.sku}</span>
                      </td>
                      <td style={styles.td}>{m.nombre}</td>
                      <td style={styles.td}>{m.unidad}</td>
                      <td style={styles.td}>{m.stock}</td>
                      <td style={styles.td}>{m.stockMinimo}</td>
                      <td style={styles.td}>₡{m.costoUnitario.toLocaleString()}</td>
                      <td style={styles.td}>
                        <StatusPill tone={ESTADO_TONE_MAT[estado]}>
                          {ESTADO_LABEL_MAT[estado]}
                        </StatusPill>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button
                            type="button"
                            style={styles.actionBtn}
                            title="Ver detalle"
                            onClick={() => setDetailMat(m)}
                          >
                            <Eye size={14} strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.actionBtn, color: ACCENT }}
                            title="Agregar stock"
                            onClick={() => openAddStock(m)}
                          >
                            <Plus size={14} strokeWidth={2.2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </TableScroll>
          </div>
        </Container>
      </Main>

      {/* Detail sheet */}
      <Sheet
        open={!!detailMat}
        onClose={() => setDetailMat(null)}
        title={detailMat ? detailMat.nombre : ""}
        placement="center"
        maxWidth={480}
      >
        {detailMat && (
          <>
            <Sheet.Body>
              <div style={styles.detGrid}>
                <div><span style={styles.detLabel}>SKU:</span> {detailMat.sku}</div>
                <div><span style={styles.detLabel}>Unidad:</span> {detailMat.unidad}</div>
                <div><span style={styles.detLabel}>Stock actual:</span> {detailMat.stock}</div>
                <div><span style={styles.detLabel}>Stock mínimo:</span> {detailMat.stockMinimo}</div>
                <div><span style={styles.detLabel}>Costo unitario:</span> ₡{detailMat.costoUnitario.toLocaleString()}</div>
                <div>
                  <span style={styles.detLabel}>Estado:</span>{" "}
                  <StatusPill tone={ESTADO_TONE_MAT[getEstadoStock(detailMat)]}>
                    {ESTADO_LABEL_MAT[getEstadoStock(detailMat)]}
                  </StatusPill>
                </div>
              </div>
            </Sheet.Body>
            <Sheet.Actions>
              <SecondaryButton onClick={() => setDetailMat(null)}>
                Cerrar
              </SecondaryButton>
              <PrimaryButton
                icon={Plus}
                onClick={() => {
                  const mat = detailMat;
                  setDetailMat(null);
                  openAddStock(mat);
                }}
              >
                Agregar stock
              </PrimaryButton>
            </Sheet.Actions>
          </>
        )}
      </Sheet>

      {/* Add stock sheet */}
      <Sheet
        open={addStockSheet}
        onClose={() => setAddStockSheet(false)}
        title={selectedMat ? `Agregar stock — ${selectedMat.nombre}` : "Agregar stock"}
        placement="center"
        maxWidth={440}
      >
        <Sheet.Body>
          <Field label={`Cantidad a agregar (${selectedMat?.unidad || ""})`}>
            <Field.Input
              type="number"
              min={1}
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              autoFocus
            />
          </Field>
          {selectedMat && (
            <Sheet.Hint>
              Stock actual: {selectedMat.stock} → Nuevo: {selectedMat.stock + Number(addQty || 0)}
            </Sheet.Hint>
          )}
        </Sheet.Body>
        <Sheet.Actions>
          <SecondaryButton onClick={() => setAddStockSheet(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton icon={Plus} onClick={submitAddStock} disabled={addQty <= 0}>
            Confirmar
          </PrimaryButton>
        </Sheet.Actions>
      </Sheet>
    </Shell>
  );
}

const styles = {
  tableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    fontFamily: "inherit",
  },
  th: {
    textAlign: "left",
    padding: "12px 12px",
    fontWeight: 900,
    fontSize: 11,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: `1px solid ${BORDER}`,
  },
  td: {
    padding: "10px 12px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    color: TEXT,
    fontWeight: 700,
  },
  tdAccent: {
    fontWeight: 900,
    color: ACCENT,
  },
  actions: {
    display: "flex",
    gap: 6,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: TEXT,
    padding: 0,
    fontFamily: "inherit",
  },
  detGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
  },
  detLabel: {
    fontWeight: 900,
    color: SLATE,
    fontSize: 12,
    marginRight: 4,
  },
};
