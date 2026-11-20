# Local development servers

Several checkouts of this repository run `next dev` side by side. They differ in branch and in the data folder they read
and write, so a piece saved on one server can be missing, or saved in an older format, on another. Check before testing.

## Which server is which

Recorded 2026-11-20. Checkouts move between branches, so the header badge (below) is the live answer; this table is the
convention.

| Port | Checkout (folder next to `virtual-wardrobe/`) | Branch | Data folder | Use it for |
| --- | --- | --- | --- | --- |
| 3000 | `vw-codex` (Codex's worktree) | whatever Codex has checked out (at the time of writing `sprint-6f-stylist-quality`, which starts at `main`) | Codex's choice: a disposable folder through `LOCAL_WARDROBE_OUTPUTS_DIR` when testing, otherwise the real `outputs/` | Codex's own work. Pieces saved here may land in a throwaway folder. |
| 3001 | `vw-knee` (Claude's worktree), detached at `main` | `main` | the real `outputs/` (`vw-knee/outputs` is a junction to `virtual-wardrobe/outputs`) | Checking what `main` ships, on your real wardrobe and avatars. |
| 3002 | `virtual-wardrobe` (the main checkout) | `sprint-4a` until it merges | the real `outputs/` | The Sprint 4A real-photo check: alignment version 2 captures and the "Create texture from photos" button exist only here until the merge. |

Port 3002 is not kept running; start it when needed:

```powershell
cd D:\Projects\outfitplannerapp\virtual-wardrobe\apps\web
npx next dev -p 3002
```

## What differs between them

- **Photo captures.** `sprint-4a` saves alignment version 2 (photo pixel size and the template outline). `main` saves
  version 1 until 4A merges, which the producer reads only as a rough placement. Capture photos for the texture check on
  the `sprint-4a` server.
- **Texture button.** "Create texture from photos" (development only) exists on `sprint-4a` only.
- **Data.** `LOCAL_WARDROBE_OUTPUTS_DIR` (`apps/web/lib/localOutputs.ts`) replaces the whole data folder: wardrobe,
  photos, textures, avatars, garments. Wardrobe changes made on a server that uses it never reach the real `outputs/`.
- **Two servers, one data folder.** 3001 and 3002 both write the real `outputs/wardrobe/wardrobe.json`. Each server
  serializes its own writes, not the other's, so don't edit the wardrobe on both at the same time.

## The header badge

In development every page shows a small badge at the right of the header: the branch and the data folder, for example
`sprint-4a · real outputs`. Hover or focus it for the commit and the full path. The badge turns amber with
`test data: <folder>` when the server uses `LOCAL_WARDROBE_OUTPUTS_DIR`. It reads `/api/dev-info` (development and
localhost only) and refreshes when the window regains focus, so a checkout switch under a running server shows up. A
server shows the badge only once its branch contains it (Sprint 4A onwards); production builds never render it.
