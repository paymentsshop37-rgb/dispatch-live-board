// Only explicitly supported in-app destinations may survive authentication.
// Never pass an arbitrary query value to history or window.location.
export function postLoginDestination(search = "") {
  return new URLSearchParams(search).get("next") === "/intelligence"
    ? "/intelligence"
    : "/dispatch-board";
}

export function loginDestination(pathname, search = "") {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  const wantsIntelligence = path === "/intelligence"
    || (path === "/login" && postLoginDestination(search) === "/intelligence");
  return wantsIntelligence ? "/login?next=%2Fintelligence" : "/login";
}
