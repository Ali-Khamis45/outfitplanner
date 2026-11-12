# Sprint 1.2 quality comparison

Same Three.js binding and rigid test poses as `deformation-analysis.md`. Percentiles use the largest edge ratio per triangle. Self-intersections are triangle pairs above the respective rest count; body penetration is approximate nearest-vertex signed distance, not an exact collision test. v2 values are from the recorded Sprint 1.1 run, v1 and v3 from the current run.

| Pose / measure | Original v1 | v2 | v3-close1 |
| --- | ---: | ---: | ---: |
| both +90 p99 / max stretch | 3.025 / 17.571 | 2.71 / 10.94 | 2.664 / 10.872 |
| both +90 flips | 20 | 3 | 3 |
| both +90 self pairs above rest | 14 | 5 | 9 |
| both +120 p99 / max stretch | 3.409 / 21.348 | 3.01 / 13.06 | 2.971 / 12.987 |
| both +120 flips | 123 | 497 | 497 |
| both +120 self pairs above rest | 186 | 1,888 | 1,892 |
| rest self pairs | 174 | 115 | 129 |
| penetration >3 mm, all recorded poses | 0 | 0 | 0 |

v3 at both +90 reduces maximum stretch by 38.1%, below the required 50%. Its +120 flips are about four times the original and self-intersections increase roughly tenfold. It therefore **FAILS** irrespective of visual evaluation. The explicit +120 gate rejects increases over the original in flips and self-intersection pairs and still checks degeneracy and penetration. The pre-existing pose-by-pose stretch gate is unchanged.

All v3 poses have zero reported degenerate triangles and zero approximate penetrations beyond 3 mm. At left +30/+60/+90, v3 p95/p99/max is 1.049/1.362/4.627, 1.100/1.723/8.019, 1.148/1.980/10.872; at torso twist 1.160/1.274/1.990; asymmetric combined 1.203/1.777/6.514. Other poses and IDs are in the ignored JSON. Rest clearance and posed penetration use different approximate methods and do not prove absence of collisions.
