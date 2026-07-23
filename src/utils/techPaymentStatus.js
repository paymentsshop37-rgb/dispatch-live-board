export const techPaymentStatusOptions = ["Pending", "Reviewing", "Approved", "Paid", "Cancelled", "Hold"];

export const techPaymentStatusVisuals = {
  Pending: { icon: "🟠", backgroundColor: "#FFF3CD", color: "#B45309" },
  Reviewing: { icon: "🟡", backgroundColor: "#FEF9C3", color: "#A16207" },
  Approved: { icon: "🔵", backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  Paid: { icon: "🟢", backgroundColor: "#DCFCE7", color: "#15803D" },
  Cancelled: { icon: "🔴", backgroundColor: "#FEE2E2", color: "#B91C1C" },
  Hold: { icon: "🔴", backgroundColor: "#FEE2E2", color: "#B91C1C" },
};

export function techPaymentVisual(status) {
  return techPaymentStatusVisuals[status] || techPaymentStatusVisuals.Pending;
}

export function techPaymentLabel(status) {
  const value = status || "Pending";
  return `${techPaymentVisual(value).icon} ${value}`;
}

export function techPaymentControlStyle(status) {
  const visual = techPaymentVisual(status);
  return {
    backgroundColor: visual.backgroundColor,
    color: visual.color,
    borderColor: visual.color,
  };
}
