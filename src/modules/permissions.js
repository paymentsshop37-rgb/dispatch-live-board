export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function getPermissions(role) {
  const normalizedRole = normalizeRole(role);

  const permissions = {
    canViewTechnicianCenter: false,
    canApproveTechnicians: false,
    canViewPrivateTechnicianData: false,
    canAssignTechnicians: false,
    canViewCustomers: false,
    canViewBilling: false,
    canManageUsers: false,
    canViewExecutiveDashboard: false,
    canViewCustomerPortal: false,
  };

  if (normalizedRole === "admin") {
    return Object.fromEntries(Object.keys(permissions).map((key) => [key, true]));
  }

  if (normalizedRole === "dispatcher") {
    return {
      ...permissions,
      canViewTechnicianCenter: true,
      canAssignTechnicians: true,
      canViewCustomers: true,
    };
  }

  if (normalizedRole === "technician") {
    return permissions;
  }

  if (normalizedRole === "customer") {
    return {
      ...permissions,
      canViewCustomerPortal: true,
    };
  }

  return permissions;
}
