import path from "node:path";

// Allows an isolated local test server to use disposable data, without touching
// the wardrobe belonging to another development server.
export function localOutputs() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_WARDROBE_OUTPUTS_DIR || path.resolve(process.cwd(), "../../outputs"));
}
