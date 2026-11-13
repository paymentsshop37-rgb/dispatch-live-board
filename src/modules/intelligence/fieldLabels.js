const labels = {
  id: "Record ID", tech: "Technician", tech_labor: "Technician Labor", tech_payment_status: "Technician Payment Status",
  tech_payment_method: "Technician Payment Method", tech_payment_paid_at: "Technician Paid At", tech_payment_paid_by: "Technician Paid By",
  job_city: "Service City", job_state: "Service State", total_bill: "Total Billed", parts: "Parts Cost", dispatch: "Dispatcher",
  invoice_number: "Invoice Number", reference_number: "Reference Number", received: "Payment Received By", updates: "Job Updates",
};
export function fieldLabel(name) {
  return labels[name] || String(name).split("_").map(word => ["id", "zip", "eta", "url"].includes(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
