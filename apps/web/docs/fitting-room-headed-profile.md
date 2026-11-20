# Fitting-room headed GPU profile

Single local samples on 2026-11-20 in visible Chrome using ANGLE on AMD Radeon graphics (Direct3D 11), viewport 1440 x 900, reduced motion, port 3100. First visit uses a fresh browser profile; reload uses that profile's browser cache. The server-side compressed cache was warm. The before development sample had a warm dev server; the after development sample included cold route compilation. The after sample used the CPU sampler and WebGL call instrumentation, so figures are indicative, not controlled benchmarks.

| Mode | Visit | Before: full outfit | After: body stage | After: full outfit |
| --- | --- | ---: | ---: | ---: |
| Development | First | 2.27 s | 2.65 s | 3.59 s |
| Development | Reload | 2.96 s | 0.83 s | 0.84 s |
| Production | First | 2.81 s | 0.86 s | 1.81 s |
| Production | Reload | 1.72 s | 0.37 s | 0.63 s |

Before, the stage was hidden until the outfit was ready; after, the body appears first. Production therefore met the requested first-visit and reload targets in this warm-disk-cache sample; a cold first compression may take longer. The before and after columns have different visibility semantics, so use the full-outfit columns for the closest comparison. Figures have 250 ms polling granularity and are not repeated-run percentiles.

Production after: body resource 402?511 ms first, 102?140 ms reload; top and bottom GLB resource fetches 624?656 and 625?655 ms first, 263?274 and 263?275 ms reload (zero transferred bytes for both on reload). Size discovery precedes garment requests; both garment requests overlap each other. In this sample the body fetch completed before size discovery, so the three network transfers did not overlap; garment requests are not gated on body readiness. The first WebGL draw with over 3,000 indices occurred at 683 ms first and 246 ms reload; this measures a draw call, not presentation on screen. The CPU sampler attributed approximately 15 ms first and 13 ms reload to stacks containing meshopt decoder symbols, with only 9 and 8 samples; it is an estimate, not decoder wall time. WebGL texture upload calls consumed approximately 1.4 ms and 0.6 ms of CPU time; this is not GPU completion time. Actual production HTTP checks confirmed gzip encoding, content length, strong ETags and conditional 304 for the body and sized garment. Public versioned neutral sizes have immutable cache headers; personal files remain private and local-only, with compressed copies stored in the ignored local disk cache.
