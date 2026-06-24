// MRP Tarimas — modal de traslado de tarimas entre ubicaciones.
//
// Opera sobre el almacén de trabajo seleccionado (useMrpWorkspace).
// Valida origen/destino, stock suficiente (en la RPC) y tienda obligatoria
// cuando la ubicación es `tienda`. Crea task_id + movimiento.
import React, { useEffect, useState } from "react";
import {
  Sheet,
  Field,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/ui";
import {
  usePalletTransfers,
  usePalletBrands,
  usePalletStores,
  useMrpWorkspace,
} from "../../../hooks/mrp";
import {
  PALLET_TYPES,
  PALLET_TYPE_LABELS,
  PALLET_LOCATIONS,
  PALLET_LOCATION_LABELS,
} from "../../../services/mrp";

function initialForm(prefillArg) {
  const prefill = prefillArg || {};
  return {
    originLocation: prefill.originLocation || "",
    originStoreId: prefill.originStoreId || "",
    destinationLocation: prefill.destinationLocation || "",
    destinationStoreId: prefill.destinationStoreId || "",
    brandId: prefill.brandId || "",
    palletType: prefill.palletType || "",
    quantity: "",
    reason: "",
  };
}

export default function TrasladoModal({ open, onClose, prefill }) {
  const { warehouse, warehouseId } = useMrpWorkspace();
  const { transfer, loading } = usePalletTransfers();
  const { brands } = usePalletBrands({ warehouseId });
  const { stores } = usePalletStores({ warehouseId });

  const [form, setForm] = useState(initialForm(prefill));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initialForm(prefill));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const originIsStore = form.originLocation === "tienda";
  const destIsStore = form.destinationLocation === "tienda";

  const validate = () => {
    const e = {};
    if (!warehouseId) e.originLocation = "Selecciona un almacén de trabajo primero.";
    if (!form.originLocation) e.originLocation = "Seleccione el origen.";
    if (!form.destinationLocation) e.destinationLocation = "Seleccione el destino.";
    if (originIsStore && !form.originStoreId)
      e.originStoreId = "Seleccione la tienda origen.";
    if (destIsStore && !form.destinationStoreId)
      e.destinationStoreId = "Seleccione la tienda destino.";
    if (
      form.originLocation &&
      form.originLocation === form.destinationLocation &&
      (form.originStoreId || "") === (form.destinationStoreId || "")
    )
      e.destinationLocation = "El origen y el destino no pueden ser iguales.";
    if (!form.brandId) e.brandId = "Seleccione una marca.";
    if (!form.palletType) e.palletType = "Seleccione el tipo.";
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) e.quantity = "Debe ser mayor a 0.";
    else if (!Number.isInteger(qty)) e.quantity = "Debe ser un número entero.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await transfer({
        warehouseId,
        originLocation: form.originLocation,
        destinationLocation: form.destinationLocation,
        originStoreId: originIsStore ? form.originStoreId : null,
        destinationStoreId: destIsStore ? form.destinationStoreId : null,
        brandId: form.brandId,
        palletType: form.palletType,
        quantity: Number(form.quantity),
        reason: form.reason.trim() || null,
      });
      onClose?.();
    } catch {
      // toast de error ya mostrado por el hook (incluye "stock insuficiente")
    }
  };

  const locationOptions = (
    <>
      <option value="">— Seleccionar —</option>
      {PALLET_LOCATIONS.map((l) => (
        <option key={l} value={l}>
          {PALLET_LOCATION_LABELS[l]}
        </option>
      ))}
    </>
  );

  const storeOptions = (
    <>
      <option value="">— Seleccionar tienda —</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.store_number} · {s.name}
        </option>
      ))}
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Traslado de tarimas" maxWidth={620}>
      <Sheet.Body>
        <Sheet.Hint>
          Almacén de trabajo: <b>{warehouse?.name || "— sin seleccionar —"}</b>
        </Sheet.Hint>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Ubicación origen" required error={errors.originLocation}>
            <Field.Select
              value={form.originLocation}
              onChange={(e) => set("originLocation", e.target.value)}
            >
              {locationOptions}
            </Field.Select>
          </Field>
          <Field label="Ubicación destino" required error={errors.destinationLocation}>
            <Field.Select
              value={form.destinationLocation}
              onChange={(e) => set("destinationLocation", e.target.value)}
            >
              {locationOptions}
            </Field.Select>
          </Field>

          {originIsStore && (
            <Field label="Tienda origen" required error={errors.originStoreId}>
              <Field.Select
                value={form.originStoreId}
                onChange={(e) => set("originStoreId", e.target.value)}
              >
                {storeOptions}
              </Field.Select>
            </Field>
          )}
          {destIsStore && (
            <Field label="Tienda destino" required error={errors.destinationStoreId}>
              <Field.Select
                value={form.destinationStoreId}
                onChange={(e) => set("destinationStoreId", e.target.value)}
              >
                {storeOptions}
              </Field.Select>
            </Field>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Marca" required error={errors.brandId}>
            <Field.Select
              value={form.brandId}
              disabled={!warehouseId}
              onChange={(e) => set("brandId", e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Field.Select>
          </Field>
          <Field label="Tipo de tarima" required error={errors.palletType}>
            <Field.Select
              value={form.palletType}
              onChange={(e) => set("palletType", e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {PALLET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PALLET_TYPE_LABELS[t]}
                </option>
              ))}
            </Field.Select>
          </Field>
        </div>

        <Field label="Cantidad" required error={errors.quantity}>
          <Field.Input
            type="number"
            min={1}
            step={1}
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label="Motivo (opcional)">
          <Field.Input
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="Ej: reubicación a patio"
          />
        </Field>
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={onClose} disabled={loading}>
          Cancelar
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} loading={loading} disabled={!warehouseId}>
          Registrar traslado
        </PrimaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}
