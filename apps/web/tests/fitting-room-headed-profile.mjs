import { browserSession } from "./browser-session.mjs";
const b = await browserSession({ headed: true }), rounds = [];
try {
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const stats = window.__vwGpuProfile = { firstGeometryMs: null, textureUploadMs: 0, textureCalls: 0 };
    for (const klass of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!klass) continue;
      for (const name of ["texImage2D", "texSubImage2D", "compressedTexImage2D"]) {
        const original = klass.prototype[name]; if (!original) continue;
        klass.prototype[name] = function (...args) { const t = performance.now(); try { return original.apply(this, args); } finally { stats.textureUploadMs += performance.now() - t; stats.textureCalls++; } };
      }
      const draw = klass.prototype.drawElements;
      if (draw) klass.prototype.drawElements = function (...args) { if (stats.firstGeometryMs === null && args[1] > 3000) stats.firstGeometryMs = performance.now(); return draw.apply(this, args); };
    }
  })();` });
  const gpu = await b.evaluate(`(() => { const gl = document.createElement("canvas").getContext("webgl2"); const ext = gl?.getExtension("WEBGL_debug_renderer_info"); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null }; })()`);
  console.log("GPU", JSON.stringify(gpu));
  await b.send("Profiler.enable");
  for (const phase of ["first", "reload"]) {
    await b.send("Profiler.start");
    if (phase === "first") await b.send("Page.navigate", { url: "http://localhost:3100/try-on" });
    else await b.send("Page.reload", { ignoreCache: false });
    try { await b.waitFor('document.querySelector(".try-viewport.ready canvas") && Number(getComputedStyle(document.querySelector(".try-viewport")).opacity) > 0.98', "stage visible"); } catch (error) { console.log("stage-timeout", JSON.stringify(await b.evaluate(`({state:document.readyState, canvas:!!document.querySelector(".try-viewport canvas"), viewport:document.querySelector(".try-viewport")?.className, webgl:!!document.createElement("canvas").getContext("webgl2")})`))); throw error; }
    const stage = await b.evaluate("Math.round(performance.now())");
    await b.waitFor('!Array.from(document.querySelectorAll(".try-stage [role=status]")).some(e => e.textContent.includes("Fitting your garments"))', "outfit ready");
    const timing = await b.evaluate(`(() => {
      const canvas = document.querySelector(".try-viewport canvas"), gl = canvas.getContext("webgl2") || canvas.getContext("webgl"), ext = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
      const resources = performance.getEntriesByType("resource").filter(e => /\\/api\\/(demo-avatar|demo-garment|size-garment|personal-size-garment|compressed-demo)/.test(e.name)).map(e => ({ kind: new URL(e.name).pathname.split("/").pop(), slot: new URL(e.name).searchParams.get("slot"), asset: new URL(e.name).searchParams.get("asset") || "base", start: Math.round(e.startTime), end: Math.round(e.responseEnd), bytes: e.transferSize }));
      return { stage_ms: Math.round(performance.now()), renderer, gpuProfile: window.__vwGpuProfile, resources };
    })()`);
    const { profile } = await b.send("Profiler.stop");
    const byId = new Map(profile.nodes.map(node => [node.id, node]));
    const parents = new Map();
    for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
    let meshoptCpuUs = 0, samples = 0;
    for (let i = 0; i < (profile.samples ?? []).length; i++) {
      let id = profile.samples[i], matched = false;
      while (id) { const node = byId.get(id); if (/meshopt|decodeGltfBuffer/i.test(`${node?.callFrame.functionName} ${node?.callFrame.url}`)) { matched = true; break; } id = parents.get(id); }
      if (matched) { meshoptCpuUs += profile.timeDeltas?.[i] ?? 0; samples++; }
    }
    rounds.push({ phase, ...timing, stage_ms: stage, outfit_ms: timing.stage_ms, meshopt_sampled_cpu_ms: meshoptCpuUs / 1000, meshopt_samples: samples });
  }
  console.log(JSON.stringify(rounds, null, 2));
} finally { await b.close(); }
