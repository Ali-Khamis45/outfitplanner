import { parseSidecar, type Sidecar } from "./correctives.ts";

export const DEFAULT_DEMO_VARIANT = "v5";
export function sidecarUrlForSelection(selection: { kind: string; url: string; variant?: string }): string | null {
  return selection.kind === "demo" && selection.variant === "v5" ? selection.url : null;
}
export function sidecarIsPending(url: string | null, loaded: { url: string } | null): boolean {
  return url !== null && loaded?.url !== url;
}

/** Cache in-flight and completed requests outside the React component lifecycle. */
export function createSidecarCache(fetcher: typeof fetch = fetch) {
  const requests = new Map<string, Promise<Sidecar | null>>();
  return {
    get(url: string): Promise<Sidecar | null> {
      let pending = requests.get(url);
      if (!pending) {
        pending = fetcher(`${url}&sidecar=1`).then(response => response.ok ? response.json() : null)
          .then(value => value ? parseSidecar(value) : null)
          .catch(error => { console.warn("Corrective sidecar unavailable:", error); return null; });
        requests.set(url, pending);
      }
      return pending;
    },
    clear(url: string) { requests.delete(url); },
  };
}
const sharedSidecars = createSidecarCache();

/** Keep a request across effect replay; a changed selection starts a new request. */
export function createSidecarLoader(fetcher?: typeof fetch, cache = fetcher ? createSidecarCache(fetcher) : sharedSidecars) {
  let selected: string | null = null;
  let pending: Promise<Sidecar | null> = Promise.resolve(null);
  return (url: string | null): Promise<Sidecar | null> => {
    if (url === selected) return pending;
    if (selected) cache.clear(selected);
    selected = url;
    pending = url ? cache.get(url) : Promise.resolve(null);
    return pending;
  };
}

export type PantsAvailability = "available" | "missing" | "error";
export function createPantsChecker(url: string, fetcher: typeof fetch = fetch) {
  let pending: Promise<PantsAvailability> | null = null;
  return (refresh = false): Promise<PantsAvailability> => {
    if (!pending || refresh) pending = fetcher(url, { method: "HEAD", cache: "no-store" })
      .then(response => response.ok ? "available" : response.status === 404 ? "missing" : "error")
      .catch(() => "error");
    return pending;
  };
}
