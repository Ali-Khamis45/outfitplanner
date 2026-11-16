# Virtual Wardrobe — Avatar Reconstruction Lab

Sprint 0 investigates single-photo body reconstruction with SAM 3D Body and MHR, rigged GLB export, and React Three Fiber display. This foundation does not implement or demonstrate those capabilities.

## Setup

Run `npm ci` (or `npm install`) in `apps/web` before building or testing. The web app's asset-compression sub-package (`apps/web/asset-compression`, which uses glTF-Transform and meshoptimizer) has its own lockfile. It is installed by `apps/web`'s `postinstall` script, so a checkout that never ran an install in `apps/web` fails `npm run build` and `npm run test` with `Cannot find package '@gltf-transform/core'`.

```powershell
cd apps/web
npm.cmd ci
# if postinstall did not run, install the sub-package directly from its lockfile:
npm.cmd ci --prefix ./asset-compression --workspaces=false --no-audit --no-fund
```

## Frontend

Requires Node.js and npm. In PowerShell, `npm.cmd` avoids a blocked `npm.ps1` execution policy.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. Checks: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test`, and `npm.cmd run build`.

The avatar studio is at http://localhost:3000/lab. It reads the generated `outputs/avatars/mhr-neutral.glb` through a fixed local endpoint; generate that asset first using [MHR setup](docs/setup/mhr.md). The loader test also requires the asset. This is an unauthenticated local proof of concept: do not expose the development server to an untrusted network or use it for private avatars.

## Long-running jobs

Garment generation can run for an hour or more (for example `services/garments/generate_sizes.py`). Launch it detached, so that closing the terminal or restarting an agent session does not kill it, and then follow its log:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name sizes-neutral `
    -Arguments "generate_sizes.py --bodies neutral --report ../../outputs/garment-tests/sizes-sprint-3a-neutral.json"
Get-Content outputs\logs\sizes-neutral.out.log -Tail 5     # progress (stderr: sizes-neutral.err.log)
Stop-Process -Id (Get-Content outputs\logs\sizes-neutral.pid)
```

Defaults:
- the script path in `-Arguments` is relative to `services/garments`; override with `-WorkDir`;
- Python is `external/mhr-venv`; override with `-Python`;
- logs and the pid file go to `outputs/logs/`, which is git-ignored.

A second launch with the same `-Name` is refused while the first is still running. `generate_sizes.py` is resumable: after a crash, launch the same command again, and it skips every size whose outputs already exist and validate. `outputs/garment-tests/sizes-crash.log` records each stage with its peak memory, plus a faulthandler traceback on a fatal error.

## Layout

- `apps/web`: Next.js App Router frontend; R3F and Drei are installed for a later viewer.
- `services/reconstruction`: reserved Python research pipeline and tests.
- `packages/contracts`: shared TypeScript avatar metadata contract; provisional, no runtime validation yet.
- `docs`: architecture, audit, setup, plan, and experiment notes.
- `tools`: the collision checker (`tools/collision`) and `launch_detached.ps1` for long-running jobs.
- `samples/input`, `outputs`, `external`: local-only inputs, generated artifacts, and upstream repositories.

Read [environment setup](docs/setup/environment.md), [audit](docs/setup/environment-audit.md), and [licenses](docs/architecture/research-licenses.md) before starting experiments. Never commit personal photos, credentials, model assets, or private avatars; review staged files even with `.gitignore` in place.

### Development size fixtures

From `apps/web`, run `npm run fixtures:build` once, then `npm run dev` and open `/try-on?fixtures=1`. This uses neutral demo garment GLBs and sidecars from `outputs/` to generate synthetic S/M/L/XL fit maps and `_EASE_MM` attributes under `.codex-garment-check/sprint3-fixtures/`. These values and the heatmap are illustrative, not measured fit. Fixture mode is unavailable in production; personal size assets retain the local-only development restriction.
