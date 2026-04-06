import React from "react";
import RequireAuth from "./RequireAuth";
import RequireTenant from "./RequireTenant";

export default function PrivateRoute({ children }) {
  return (
    <RequireAuth>
      <RequireTenant>{children}</RequireTenant>
    </RequireAuth>
  );
}