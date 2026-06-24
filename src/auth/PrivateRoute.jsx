import React from "react";
import RequireAuth from "./RequireAuth";
import RequireTenant from "./RequireTenant";
import EpaAdminRouteGuard from "./EpaAdminRouteGuard";
import RequireRouteAccess from "./RequireRouteAccess";

export default function PrivateRoute({ children }) {
  return (
    <RequireAuth>
      <RequireTenant>
        <EpaAdminRouteGuard>
          <RequireRouteAccess>{children}</RequireRouteAccess>
        </EpaAdminRouteGuard>
      </RequireTenant>
    </RequireAuth>
  );
}
