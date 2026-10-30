# Architecture overview

This is an experiment, not a deployed service. The intended flow is local photo → preprocessing → SAM 3D Body parameters and mesh → MHR-based reconstruction → investigate rigged GLB export → React Three Fiber viewer. Each arrow remains unverified; in particular, a mesh result does not establish a valid rigged GLB export.

The Next.js frontend and Python reconstruction workspace are separate. The `/lab` viewer reads only the fixed local neutral MHR GLB through `/api/demo-avatar`; this development endpoint is unauthenticated and must not be exposed to untrusted networks or used to serve private avatars. `packages/contracts` contains a provisional metadata type, not an API or a validated interchange protocol. No reconstruction backend transport is selected yet. Research repositories and artifacts live in ignored directories; no code, models, or personal photos are bundled.
