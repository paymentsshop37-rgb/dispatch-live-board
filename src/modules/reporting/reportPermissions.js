export const reportCatalog = [
  { id: "executive-pdf", label: "Export Executive Report PDF", format: "pdf", financial: true },
  { id: "executive-excel", label: "Export Executive Excel", format: "xlsx", financial: true },
  { id: "financial", label: "Export Financial", format: "xlsx", financial: true },
  { id: "technician-payments", label: "Export Technician Payments", format: "xlsx", financial: true, techPayments: true },
  { id: "outstanding-invoices", label: "Export Outstanding Invoices", format: "xlsx", financial: true },
  { id: "internal-control", label: "Export Internal Control", format: "xlsx", financial: true },
  { id: "dispatcher-performance", label: "Export Dispatcher Performance", format: "xlsx", operational: true },
  { id: "city-performance", label: "Export City Performance", format: "xlsx", operational: true },
  { id: "database", label: "Export Database", format: "xlsx", financial: true },
];

export function getReportExportAccess(role, overrides = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const admin = normalizedRole === "admin";
  const operational = admin || ["dispatcher", "supervisor"].includes(normalizedRole);
  const explicitFinancial = Boolean(overrides.canExportFinancialReports);
  const techPaymentAccess = admin || (normalizedRole === "technician_manager" && Boolean(overrides.canViewTechPayments || explicitFinancial));
  return {
    canExportOperational: operational,
    canExportFinancial: admin || explicitFinancial,
    canExportTechPayments: techPaymentAccess,
  };
}

export function availableReports(role, overrides = {}) {
  const access = getReportExportAccess(role, overrides);
  return reportCatalog.filter((report) => {
    if (report.techPayments) return access.canExportTechPayments;
    if (report.financial) return access.canExportFinancial;
    return report.operational && access.canExportOperational;
  });
}
