# Fitting-room load measurement after Sprint 3.6 merge

Measured on 2026-11-20 against port 3100, 1440 x 900, a fresh headless Chromium profile using SwiftShader (software WebGL), neutral avatar, promoted v5.3 / pants-v3.1 defaults. One fresh browser visit followed by one reload in the same profile; both servers were running and base asset compression caches were warm. These are single local observations, not representative hardware or network benchmarks.

The measurement uses `performance.now()` when the preview canvas exists, the avatar and enabled garments report ready, and the stage opacity exceeds 0.98. The sampling interval is 250 ms, and includes the fade-in. Development had already compiled the route before the measurement; first visit means a fresh browser profile, not a cold server.

| Build | First browser visit | Reload |
| --- | ---: | ---: |
| Development | 10.49 s | 5.56 s |
| Production | 11.34 s | 9.05 s |

## What blocks the stage

Production size GLB requests began at 1.95 s and finished at 3.88 and 3.91 s on the first visit; on reload they ran from about 1.12 s to 2.61 s. The neutral size endpoint calls `compressGlb` for each GLB request rather than reusing the disk cache, accounting for roughly 1.5–2 seconds of those requests in this observation. Base demo garments are also fetched in parallel even when size-specific garments will be used.

The stage became visible roughly 7.4 seconds after the last size GLB response on the first visit and 6.4 seconds after it on reload. Readiness waits for the avatar and garments to load and bind, and this test uses software WebGL; browser decoding, scene setup, rendering and the fade all contribute within that interval. No profiler was captured, so the relative share of these client-side steps is not established. Assets use `no-store`, so the reload is not an HTTP-cached asset measurement.

The initial production measurement could not reach a visible stage: the server stripped the `Content-Encoding` header from a pre-gzipped GLB response, and its compression middleware could also wrap that body again. Three.js received gzip bytes instead of a GLB. The response now serves meshopt-compressed GLB bytes with `no-transform`, and the build warms that cache. The production smoke check verified decoded GLB signatures for the neutral avatar and both default base garments. The measured times above are after the fix.

`tests/fitting-room-load.mjs` repeats the fresh-profile/reload measurement. `tests/production-asset-smoke.mjs` checks production asset decoding and the dev-only legacy size restriction. The local ignored JSON outputs contain only neutral resource timing and byte counts.
