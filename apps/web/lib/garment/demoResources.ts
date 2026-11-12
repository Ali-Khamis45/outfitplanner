import { parseSidecar, type Sidecar } from "./correctives.ts";

export const DEFAULT_DEMO_VARIANT = "v5";
export function sidecarUrlForSelection(selection: { kind: string; url: string; variant?: string }): string | null {
  return selection.kind === "demo" && selection.variant === "v5" ? selection.url : null;
}

/** Keep the request for a selection across React effect cleanup/replay. */
export function createSidecarLoader(fetcher: typeof fetch = fetch) {
  let selected: string | null = null;
  let pending: Promise<Sidecar | null> = Promise.resolve(null);
  return (url: string | null): Promise<Sidecar | null> => {
    if (url === selected) return pending;
    selected = url;
    pending = url ? fetcher(`${url}&sidecar=1`).then(response => response.ok ? response.json() : null)
      .then(value => value ? parseSidecar(value) : null)
      .catch(error => { console.warn("Corrective sidecar unavailable:", error); return null; }) : Promise.resolve(null);
    return pending;
  };
}

export type PantsAvailability = "available" | "missing" | "error";
export function createPantsChecker(url: string, fetcher: typeof fetch = fetch) {
  let pending: Promise<PantsAvailability> | null = null;
  return (refresh = false): Promise<PantsAvailability> => {
    if (!pending || refresh) pending = fetcher(url, { cache: "no-store" })
      .then(response => response.ok ? "available" : response.status === 404 ? "missing" : "error")
      .catch(() => "error");
    return pending;
  };
}
