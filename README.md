# esp

Fabric client for Minecraft 1.21.11. This repo is what the esp launcher downloads from, and it also hosts the website.

**[Download the launcher](https://github.com/betterplayer1234f-boop/espclient/raw/main/launcher/esp-launcher.exe)** (Windows, 4.3 MB) ·
[jar only](https://github.com/betterplayer1234f-boop/espclient/raw/main/launcher/mods/esp-1.0.0.jar) ·
[website](https://betterplayer1234f-boop.github.io/espclient/)

## What's where

| Path | What it is |
| --- | --- |
| `launcher/manifest.json` | The file list the launcher reads on every start: versions, download URLs, SHA-256 hashes, news. |
| `launcher/mods/` | The esp jar the launcher downloads. Fabric API comes straight from maven.fabricmc.net. |
| `launcher/esp-launcher.exe` | The launcher itself. |
| `launcher-src/` | Launcher source (Neutralinojs + plain HTML/CSS/JS). |
| `docs/` | The website. Turn on GitHub Pages for `main` / `docs` to publish it. |
| `tools/release.mjs` | Pushes a new esp build to everyone's launcher. |

## How the launcher works

It doesn't sign in or start Minecraft by itself. When you press Play it:

1. reads `launcher/manifest.json` from this repo
2. installs the Fabric loader version entry into `.minecraft/versions`
3. downloads esp and Fabric API into `%appdata%\.esp\mods` and checks every SHA-256
4. adds an **esp** profile to `launcher_profiles.json`, backing the file up once first
5. opens the official Minecraft Launcher, where you pick the esp profile and press Play

## Shipping an update

```
node tools/release.mjs path/to/esp-1.0.1.jar "1.0.1" "What changed, in one line."
git add -A && git commit -m "esp 1.0.1" && git push
```

Launchers pick it up the next time they're opened. GitHub's raw CDN can take a few minutes to refresh.

## Building the launcher

```
cd launcher-src
npm i -D @neutralinojs/neu rcedit
npx neu update
npx neu build --release --embed-resources
npx rcedit dist/esp-launcher/esp-launcher-win_x64.exe --set-icon icon.ico
```

For testing there are three flags: `--manifest=<url>`, `--mcdir=<folder>` (use a fake .minecraft) and `--dry` (don't open the Minecraft Launcher).

Not affiliated with Mojang or Microsoft.
