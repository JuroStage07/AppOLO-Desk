import React from "react";
import RequireAuth from "./RequireAuth";
import RequireTenant from "./RequireTenant";
import EpaAdminRouteGuard from "./EpaAdminRouteGuard";

export default function PrivateRoute({ children }) {
  return (
    <RequireAuth>
      <RequireTenant>
        <EpaAdminRouteGuard>{children}</EpaAdminRouteGuard>
      </RequireTenant>
    </RequireAuth>
  );
}