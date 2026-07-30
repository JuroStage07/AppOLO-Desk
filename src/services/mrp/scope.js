// MRP Tarimas — scope runtime de tenant/company.
//
// El módulo opera bajo el tenant/company del usuario logeado (profiles/{uid}).
// `useMrpWorkspace` fija este scope desde AuthCtx; los servicios lo leen al
// momento de cada consulta/mutación. MRP_TENANT_ID/MRP_COMPANY quedan como
// valores por defecto si el perfil no los trae.
import { MRP_TENANT_ID, MRP_COMPANY } from "./constants";

let _scope = {
  tenantId: MRP_TENANT_ID,
  company: MRP_COMPANY,
  bodegaId: null,
  bodegaNombre: null,
};

export function setMrpScope({ tenantId, company, bodegaId, bodegaNombre } = {}) {
  _scope = {
    tenantId: tenantId || _scope.tenantId,
    company: company || _scope.company,
    // bodega es opcional; se puede limpiar pasando null explícito.
    bodegaId: bodegaId !== undefined ? bodegaId : _scope.bodegaId,
    bodegaNombre: bodegaNombre !== undefined ? bodegaNombre : _scope.bodegaNombre,
  };
}

export function getMrpScope() {
  return _scope;
}

// Identidad del usuario logeado, fijada por useMrpWorkspace. La usan los
// servicios para sellar el autor en el registro de eventos (mrp_eventos).
let _user = { userId: null, userEmail: null };

export function setMrpUser({ userId, userEmail } = {}) {
  _user = { userId: userId || null, userEmail: userEmail || null };
}

export function getMrpUser() {
  return _user;
}
