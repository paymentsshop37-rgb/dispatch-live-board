export const internalControlColors = [
  { value: "none", label: "None", color: "#64748b", tint: "transparent" },
  { value: "yellow", label: "Pending Estimate", color: "#eab308", tint: "rgba(234, 179, 8, 0.10)" },
  { value: "orange", label: "Pending Customer Approval", color: "#f97316", tint: "rgba(249, 115, 22, 0.10)" },
  { value: "blue", label: "Pending Technician Invoice", color: "#3b82f6", tint: "rgba(59, 130, 246, 0.10)" },
  { value: "purple", label: "Internal Review", color: "#a855f7", tint: "rgba(168, 85, 247, 0.10)" },
  { value: "green", label: "Ready to Invoice", color: "#22c55e", tint: "rgba(34, 197, 94, 0.10)" },
  { value: "red", label: "Urgent Follow-up", color: "#ef4444", tint: "rgba(239, 68, 68, 0.10)" },
  { value: "brown", label: "Pending Payment", color: "#a16207", tint: "rgba(161, 98, 7, 0.12)" },
  { value: "gray", label: "Pending Documents", color: "#94a3b8", tint: "rgba(148, 163, 184, 0.10)" },
];

export function internalControlColor(value) {
  return internalControlColors.find((option) => option.value === String(value || "none").toLowerCase())
    || internalControlColors[0];
}
