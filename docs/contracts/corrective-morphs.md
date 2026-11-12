# Corrective morph sidecar, version 1

The neutral v5 garment is `outputs/garments/experiments/tshirt-v5-mhr-neutral.glb` and its sidecar is `outputs/garments/experiments/tshirt-v5-mhr-neutral.correctives.json`.

Each entry in `correctives` requires `target`, `joint`, `child`, `measure` and `ramp`. `child` names the exact direct child bone of `joint` that defines the direction. `measure` is `swing_deg`, the angle between rest and current joint-to-child directions in the joint parent's space; rotation about that direction (twist) is ignored. Weight is `clamp((swing_deg - a) / (b - a), 0, 1)` for `ramp: [a, b]`, where `b > a`. Python evaluation must use this same named child.

The web runtime accepts legacy entries without `child`: it warns and uses the first nonzero direct child bone. A named child that is missing, not a direct child, or has zero offset is warned and skipped; its target remains zero. Missing sidecar or target leaves weights zero without an error. Sidecar format:

```json
{"version":1,"correctives":[{"target":"corr_L_abd90","joint":"l_uparm","child":"named_direct_child","measure":"swing_deg","ramp":[90,120]}]}
```

The child name above is illustrative; the producer must write the actual joint name from its skeleton.
