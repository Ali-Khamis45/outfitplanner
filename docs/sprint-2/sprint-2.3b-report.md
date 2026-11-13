# Sprint 2.3B: try-on loading

| Measurement | Before | After | Result |
| --- | ---: | ---: | --- |
| Total transfer, desktop / 4G | 24,739,088 B | 2,475,567 B | PASS: under 3 MB |
| First visible avatar, desktop | 1.48 s | 2.97 s | PASS: measured |
| First visible avatar, 4G | 4.55 s | 7.13 s | FAIL: under 4 s |
| Complete outfit, desktop | 2.22 s | 2.97 s | PASS: measured |
| Complete outfit, 4G | 51.40 s | 7.13 s | FAIL: under 4 s |

Cold browser, 1440×900, headless Chrome with SwiftShader, production Next server, cache disabled; 4G is 4 Mbps down, 1 Mbps up, 80 ms latency, no CPU slowdown. Each cell is one run; timings include WebGL decoding and visible drawing. The new loading state deliberately reveals the avatar only when the complete outfit is ready, accounting for the slower first avatar. Measurements use a prewarmed server cache, created by `npm run build`; a cold server cache was not timed. Baseline is the unmodified `afa733d` production build. Commands, from `apps/web`: `npm run build`, `npm exec -- next start -p 3013`, then `node tests/try-on-performance.mjs desktop http://localhost:3013/try-on` and the same command with `4g` instead of `desktop`.

- PASS: meshopt GLBs are cached by source SHA-256 under `apps/web/.asset-cache`; sidecars and `outputs/` are unchanged. Position/morph data and skin weights are quantized (14-bit positions, 12-bit weights). Tests compare names, joints, sampled skin weights and morph deltas, binding with compressed and uncompressed counterparts, and corrective weights at both-90 and walk.
- PASS: progress indicator, fade-in, stable stage dimensions and resize sequence in headless Chrome (`npm run test:try-on-browser`).
- PASS: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`. The test suite ran against an isolated copy of neutral assets because its existing binding test writes test results; personal fixtures were not accessed.
- NOT TESTED: manual visual inspection of compressed clothing and a fresh collision/penetration evaluation after quantization. Headless browser checks do not establish visual equivalence.
