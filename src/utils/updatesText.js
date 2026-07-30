export function uppercaseUpdates(value) {
  return typeof value === "string" ? value.toLocaleUpperCase() : value;
}
