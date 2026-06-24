// MRP Tarimas — scope runtime de tenant/company.
//
// El módulo opera bajo el tenant/company del usuario logeado (profiles/{uid}).
// `useMrpWorkspace` fija este scope desde AuthCtx; los servicios lo leen al
// momento de cada consulta/mutación. MRP_TENANT_ID/MRP_COMPANY quedan como
// valores por defecto si el perfil no los trae.
import { MRP_TENANT_ID, MRP_COMPANY } from "./constants";

let _scope = { tenantId: MRP_TENANT_ID, company: MRP_COMPANY };

export function setMrpScope({ tenantId, company } = {}) {
  _scope = {
    tenantId: tenantId || _scope.tenantId,
    company: company || _scope.company,
  };
}

export function getMrpScope() {
  return _scope;
}
