# Virtual Wardrobe — Avatar Reconstruction Lab

Sprint 0 investigates single-photo body reconstruction with SAM 3D Body and MHR, rigged GLB export, and React Three Fiber display. This foundation does not implement or demonstrate those capabilities.

## Frontend

Requires Node.js and npm. In PowerShell, `npm.cmd` avoids a blocked `npm.ps1` execution policy.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. Checks: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test`, and `npm.cmd run build`. The test command only runs available workspace tests; none are defined yet.

## Layout

- `apps/web`: Next.js App Router frontend; R3F and Drei are installed for a later viewer.
- `services/reconstruction`: reserved Python research pipeline and tests.
- `packages/contracts`: shared TypeScript avatar metadata contract; provisional, no runtime validation yet.
- `docs`: architecture, audit, setup, plan, and experiment notes.
- `samples/input`, `outputs`, `external`: local-only inputs, generated artifacts, and upstream repositories.

Read [environment setup](docs/setup/environment.md), [audit](docs/setup/environment-audit.md), and [licenses](docs/architecture/research-licenses.md) before starting experiments. Never commit personal photos, credentials, model assets, or private avatars; review staged files even with `.gitignore` in place.
