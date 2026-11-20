# Size discovery: withheld state

The size discovery endpoint returns `{ "size": "L", "withheld": true }` for a size held back by the Sprint 3.6 gates. A withheld entry has no fit map or asset URLs; the picker also accepts `{ "size": "L", "status": "withheld" }`. Available entries retain `size`, `fit`, `glb`, and `sidecar`.

Withheld buttons cannot be selected but remain keyboard-focusable with `aria-disabled` and a tooltip. Duplicate entries resolve conservatively: withheld wins. The server is responsible for gating and refuses direct requests for withheld assets.
