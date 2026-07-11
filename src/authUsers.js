export const AUTH_USERS = {
  admin: { password: "Admin#2026", role: "admin", name: "Owner Admin" },
  dispatcher01: { password: "Dsp#1001", role: "dispatcher", name: "Daniel" },
  dispatcher02: { password: "Dsp#1002", role: "dispatcher", name: "Gonzalo" },
  dispatcher03: { password: "Dsp#1003", role: "dispatcher", name: "Janeth" },
  dispatcher04: { password: "Dsp#1004", role: "dispatcher", name: "Victor" },
  dispatcher05: { password: "Dsp#1005", role: "dispatcher", name: "Cris" },
  dispatcher06: { password: "Dsp#1006", role: "dispatcher", name: "Mike" },
  dispatcher07: { password: "Dsp#1007", role: "dispatcher", name: "Dispatcher 07" },
  dispatcher08: { password: "Dsp#1008", role: "dispatcher", name: "Dispatcher 08" },
  dispatcher09: { password: "Dsp#1009", role: "dispatcher", name: "Dispatcher 09" },
  dispatcher10: { password: "Dsp#1010", role: "dispatcher", name: "Dispatcher 10" },
};

export function clearAuthSession() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("currentUserName");
  localStorage.removeItem("currentUserRole");
  window.dispatchEvent(new Event("nttr-auth-changed"));
}
