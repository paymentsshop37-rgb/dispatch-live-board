let sequence = 0;

// Realtime provides prompt updates; periodic and reconnect refreshes reconcile
// deletions and any events missed while the tab or connection was inactive.
export function subscribeDataSync(client, tables, refresh, {
  host = window, doc = document, timers = globalThis,
  intervalMs = 30000, debounceMs = 300,
  onError = () => console.warn("Automatic data refresh failed; retrying on the next sync."),
} = {}) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timeout;

  function schedule() {
    if (stopped) return;
    pending = true;
    if (doc.visibilityState === "hidden" || running) return;
    timers.clearTimeout(timeout);
    timeout = timers.setTimeout(run, debounceMs);
  }

  async function run() {
    if (stopped || running || doc.visibilityState === "hidden") return;
    pending = false;
    running = true;
    try { await refresh(); }
    catch (error) { if (!stopped) onError(error); }
    finally {
      running = false;
      if (pending && !stopped) schedule();
    }
  }

  const channel = client.channel(`data-sync-${++sequence}`);
  for (const table of new Set(tables)) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
  }
  channel.subscribe((status) => { if (status === "SUBSCRIBED") schedule(); });
  const interval = timers.setInterval(schedule, intervalMs);
  host.addEventListener("focus", schedule);
  host.addEventListener("online", schedule);
  doc.addEventListener("visibilitychange", schedule);

  return () => {
    if (stopped) return;
    stopped = true;
    timers.clearTimeout(timeout);
    timers.clearInterval(interval);
    host.removeEventListener("focus", schedule);
    host.removeEventListener("online", schedule);
    doc.removeEventListener("visibilitychange", schedule);
    client.removeChannel(channel);
  };
}
