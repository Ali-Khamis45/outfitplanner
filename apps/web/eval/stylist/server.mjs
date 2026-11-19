import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

export const BASE_URL = "http://127.0.0.1:3100";
export async function requireFreePort() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error("Port 3100 is occupied. Stop your own process or run the evaluation later; the harness will not reuse or stop it.")));
    probe.listen(3100, () => probe.close(resolve));
  });
}
export function startServer(app, env, log) {
  const child = spawn(process.execPath, [path.resolve(app, "../../node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100"],
    { cwd: app, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", bytes => log(String(bytes))); child.stderr.on("data", bytes => log(String(bytes)));
  let spawnError;
  child.on("error", error => { spawnError = error; });
  return {
    async ready(marker, signal) {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline && !signal.aborted) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null) throw new Error("Owned evaluation server exited during startup.");
        try {
          const response = await fetch(BASE_URL + "/api/wardrobe", { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
          const data = await response.json();
          if (data.outfits?.some(outfit => outfit.id === marker)) return;
        } catch { /* Only accept our unique disposable wardrobe marker. */ }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error(signal.aborted ? "Evaluation cancelled." : "Timed out starting the isolated evaluation server.");
    },
    async stop() {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (process.platform === "win32") {
          // Only the PID from our own spawn, plus its own descendants.
          await new Promise((resolve, reject) => {
            const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            killer.once("error", reject); killer.once("exit", code => code === 0 || child.exitCode !== null ? resolve() : reject(new Error("Could not stop owned evaluation server.")));
          });
        } else { try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
      } catch (error) {
        // A restricted host may refuse process termination. Report the exact
        // owned PID and exit with an error rather than hanging the runner.
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        throw new Error(`Could not stop owned evaluation server PID ${child.pid}: ${String(error)}`);
      }
    },
  };
}
