export const internalControlColors = [
  { value: "none", label: "None", color: "#64748b", tint: "transparent" },
  { value: "yellow", label: "Pending Estimate", color: "#FACC15", tint: "rgba(250, 204, 21, 0.50)", selectedTint: "rgba(250, 204, 21, 0.62)" },
  { value: "orange", label: "Pending Customer Approval", color: "#FB923C", tint: "rgba(251, 146, 60, 0.50)", selectedTint: "rgba(251, 146, 60, 0.62)" },
  { value: "blue", label: "Pending Technician Invoice", color: "#3B82F6", tint: "rgba(59, 130, 246, 0.50)", selectedTint: "rgba(59, 130, 246, 0.62)" },
  { value: "purple", label: "Internal Review", color: "#A855F7", tint: "rgba(168, 85, 247, 0.50)", selectedTint: "rgba(168, 85, 247, 0.62)" },
  { value: "green", label: "Ready to Invoice", color: "#22C55E", tint: "rgba(34, 197, 94, 0.50)", selectedTint: "rgba(34, 197, 94, 0.62)" },
  { value: "red", label: "Urgent Follow-up", color: "#EF4444", tint: "rgba(239, 68, 68, 0.50)", selectedTint: "rgba(239, 68, 68, 0.62)" },
  { value: "brown", label: "Pending Payment", color: "#A16207", tint: "rgba(161, 98, 7, 0.50)", selectedTint: "rgba(161, 98, 7, 0.62)" },
  { value: "gray", label: "Pending Documents", color: "#6B7280", tint: "rgba(107, 114, 128, 0.50)", selectedTint: "rgba(107, 114, 128, 0.62)" },
];

export function internalControlColor(value) {
  return internalControlColors.find((option) => option.value === String(value || "none").toLowerCase())
    || internalControlColors[0];
}
