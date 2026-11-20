"use client";
import { useEffect, useState } from "react";
import type { DevInfo } from "../../lib/devInfo";

/** Development only: the branch this server runs and the data folder it uses, so two local servers are not confused
 *  (docs/setup/dev-servers.md). Re-read when the window regains focus, since the checkout can change under a running server. */
export function DevBadge() {
  const [info, setInfo] = useState<DevInfo | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/dev-info", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<DevInfo> : null).then(next => { if (active) setInfo(next); }).catch(() => {});
    load(); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, []);
  if (!info) return null;
  const folder = info.data.path.split(/[\\/]/).filter(Boolean).pop() ?? info.data.path;
  const data = info.data.override ? `test data: ${folder}` : "real outputs";
  const full = `Development server: branch ${info.branch}${info.commit ? ` (${info.commit})` : ""}; data folder ${info.data.path}${info.data.override ? " (LOCAL_WARDROBE_OUTPUTS_DIR)" : ""}`;
  return <span className="dev-badge" data-override={info.data.override || undefined} title={full} aria-label={full}>{info.branch} · {data}</span>;
}
