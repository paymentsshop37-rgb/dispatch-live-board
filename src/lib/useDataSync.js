import { useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { subscribeDataSync } from "./dataSync.js";

export function useDataSync(refresh, tables, enabled = true, intervalMs = 30000) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const tableKey = [...new Set(tables)].sort().join(",");
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeDataSync(supabase, tableKey.split(","), () => latest.current(), { intervalMs });
  }, [tableKey, enabled, intervalMs]);
}
