# M10 packaging evidence

Native **game mode** + Windows packaging for the "double-click and skate with your
fingers" build. The native host (`host/SlackPad.Host`) now loads the built game
full-window in WebView2 and streams REAL trackpad ContactFrames into it.

## What ships

- `host/SlackPad.Host/Ui/GameForm.cs` — full-window WebView2 game window (game
  mode DEFAULT). Windowed by default, **F11** toggles fullscreen. Loads the game
  via `SetVirtualHostNameToFolderMapping("slackpad.game", <dist>, Allow)` →
  `https://slackpad.game/index.html`.
- Real input: reuses the M1 Raw Input adapter (primary; pointer is a degraded
  fallback) on the form handle (`RIDEV_INPUTSINK` keeps WM_INPUT flowing under the
  focused WebView2 child), batches ContactFrames on an 8 ms timer, and posts
  `contactBatch` envelopes (`source:"hardware"`).
- Truthful buttons: `GetAsyncKeyState(VK_LBUTTON/VK_RBUTTON)` sampled on the batch
  timer → `buttons.primary = LMB`, `buttons.secondary = RMB` (see
  `Core/HostButtonMerge.cs` for why the HID Button-1 bit is discarded, not OR-ed).
- Page side: `packages/game/src/input/HostInputSource.ts` subscribes to
  `window.chrome.webview`, validates with the shared `isHostToPageEnvelope`, pushes
  frames through the same InputHub the DEV PAD uses, posts `ready` once, and shows a
  "TRACKPAD LIVE" chip. The DEV PAD is hidden under the host unless `?devpad=1`.
- `play.bat` (native trackpad, game mode) + `play-browser.bat` (old mouse / DEV-PAD
  vite-preview flow).
- `scripts/package-win.mjs` (`npm run package:win`).

## Commands

```
npm run package:win          # build game → dotnet publish → stage GameDist → zip
dotnet test host/SlackPad.sln -c Release     # 55 host tests (38 baseline + 17 new)
npx vitest run                               # 131 passed / 7 skipped (+9 host-input)
npm run typecheck
npm run build -w @slackpad/game
```

`package:win` never fabricates success: missing Node / .NET 10 SDK, or any failed
step, writes `pause-packet.json` here and exits non-zero (no zip is produced).

## Artifact inventory (this machine, x64)

Produced by `npm run package:win` into `dist-release/` (git-ignored):

| Artifact | Size | Notes |
| --- | --- | --- |
| `SlackPad360-win-x64.zip` | ~14.5 MB | the shippable bundle |
| `SlackPad360-win-x64/` (staged) | ~18.4 MB | unzipped folder |
| `SlackPad360-win-x64/SlackPad.Host.exe` | ~162 KB | framework-dependent apphost |
| `SlackPad360-win-x64/WebView2Loader.dll` + `runtimes/win-x64/native/` | — | Evergreen loader |
| `SlackPad360-win-x64/Microsoft.Web.WebView2.*.dll` | — | WebView2 managed SDK |
| `SlackPad360-win-x64/GameDist/` | ~14 MB | game bundle (index.html, assets, env HDR, textures, staged GLBs) |
| `SlackPad360-win-x64/README.txt` | — | run instructions + WebView2/​.NET runtime notes |

Publish is **framework-dependent** (`--self-contained false -r win-x64`): the
target needs the .NET 10 Desktop Runtime and the WebView2 Evergreen runtime (both
free; WebView2 ships with Win11). This matches architecture §8 (WebView2 Evergreen
bootstrap; ship assets only from the built dist).

## Render proof

`first-run-render.png` — the built game running inside the native WebView2 host
(captured via the DevTools Protocol against the running exe): HDRI sky + concrete
plaza, the staged hero board, the DebugHud, and the green "TRACKPAD LIVE" chip
top-right (DEV PAD correctly hidden). Verified live: page origin
`https://slackpad.game/index.html`, one 1280x800 WebGL canvas, `hasWebGL: true`,
chip text `● TRACKPAD LIVE`. The board sits idle (`src none`, 0.00 m/s) because no
fingers are on the pad — the one step only the owner can perform.

## First-run checklist

1. Extract `SlackPad360-win-x64.zip`.
2. Double-click `SlackPad.Host.exe`.
3. A dark "SlackPad 360" window opens and the game renders (plaza + board).
4. Top-right shows a green **TRACKPAD LIVE** chip.
5. Plant TWO fingers on the trackpad → the board cruises; rotate/translate to steer.
6. Left-click = back-foot kick/ollie; right-click = front-foot kick/nollie.
7. **F11** toggles fullscreen; close the window to quit.

If the trackpad does nothing, see the diagnostics section of the M10 report:
`SlackPad.Host.exe --spike` (M1 diagnostic: confirms the pad emits contacts),
verify the window has focus (chip solid vs. dimmed), and confirm the WebView2
Evergreen runtime is installed.
