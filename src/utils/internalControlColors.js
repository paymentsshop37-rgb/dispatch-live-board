export const internalControlColors = [
  { value: "none", label: "None", color: "#64748b", tint: "transparent" },
  { value: "yellow", label: "Pending Estimate", color: "#FFD700", tint: "rgba(255, 215, 0, 0.75)", selectedTint: "rgba(255, 215, 0, 0.88)" },
  { value: "orange", label: "Pending Customer Approval", color: "#FF6600", tint: "rgba(255, 102, 0, 0.75)", selectedTint: "rgba(255, 102, 0, 0.88)" },
  { value: "blue", label: "Pending Technician Invoice", color: "#0066FF", tint: "rgba(0, 102, 255, 0.75)", selectedTint: "rgba(0, 102, 255, 0.88)" },
  { value: "purple", label: "Internal Review", color: "#9933FF", tint: "rgba(153, 51, 255, 0.75)", selectedTint: "rgba(153, 51, 255, 0.88)" },
  { value: "green", label: "Ready to Invoice", color: "#00C853", tint: "rgba(0, 200, 83, 0.75)", selectedTint: "rgba(0, 200, 83, 0.88)" },
  { value: "red", label: "Urgent Follow-up", color: "#FF0000", tint: "rgba(255, 0, 0, 0.75)", selectedTint: "rgba(255, 0, 0, 0.88)" },
  { value: "brown", label: "Pending Payment", color: "#8B4513", tint: "rgba(139, 69, 19, 0.75)", selectedTint: "rgba(139, 69, 19, 0.88)" },
  { value: "gray", label: "Pending Documents", color: "#606060", tint: "rgba(96, 96, 96, 0.75)", selectedTint: "rgba(96, 96, 96, 0.88)" },
];

export function internalControlColor(value) {
  return internalControlColors.find((option) => option.value === String(value || "none").toLowerCase())
    || internalControlColors[0];
}
