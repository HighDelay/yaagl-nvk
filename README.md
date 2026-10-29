# YAAGL NVK

This fork adds an **NVIDIA NVK + DXVK** backend for ZZZ, Genshin Impact
and Honkai: Star Rail using [HighDelay's NVIDIA driver](https://github.com/HighDelay/nvidia-macos-driver).
It keeps separate game prefixes and bypasses MoltenVK/NVMTL shader translation for
D3D11 rendering. It adds optional ZZZ D3D12/vkd3d, DLSS support and a native HUD
when a matching driver provider is installed. [Setup and test status](docs/NVK.md).
It uses NVK and the patched DXVK pair from `/Library/GPUBundles/nvmtl/wine`.
The launcher archive contains no runtime; compatible Wine downloads on first setup.
ZZZ and HSR Global gameplay, world rendering, characters and UI were confirmed on
RTX 2060 SUPER / Tahoe 26.7.1. GI/CN gameplay and long-session stability still need testing. The
existing YAAGL backends remain available. ZZZ D3D12 and DLSS SR Quality/HUD
were also confirmed. Settings has separate D3D12, DLSS and HUD controls; DLSSG
uses normal GPU checks and is not verified. The new driver build is currently
held, so older providers support D3D11 only until that driver update is installed.

Based on [Yet another anime game launcher](https://github.com/yaagl/yet-another-anime-game-launcher).

## Current Supported Game Version:
### GI: 5.3.0+ OS/CN **
### HSR: 4.3.0+ OS/CN
### ZZZ: 3.0.0+ OS/CN

#### **: Starting from release 0.3.12 using DXMT 0.74, you need to update to Sequoia or later. Sonoma is getting old and is lacking technical features to improve the translation.

## For Linux users
[Anime Games Launcher](https://github.com/an-anime-team/anime-games-launcher) is a universal linux launcher for anime games

<!-- ## Policy

Please don't link to this repository. If you really want to share it with people, just tell the project name __Yaagl__ and where to find (Github!) but __don't share/disclose the link__ unless it's a private message.

Do __not__ provide any forms of tutorial for _how to use Yaagl_ on public channels. (If you really want to do that, ask the project owner for permission first.)

Do __not__ mention the real name of the game or the game company, in code commits, issues, pr or dicussions. Use _The Anime Game_ or _The Anime Company_ instead.

Just follow these, or share and ruin this project for all other macOS (including Linux as well) players. -->

<!-- ### Hall of Shame

This is a list of people/organization violating Yaagl policies -->

## Is it safe?

Use it at your own risk. Or enjoying it with a new f2p account.

## Support

[Our Discord server](https://discord.gg/HrV52MgSC2) is the **ONLY** place providing support if you have any issue just using this application.

**DON'T FILE AN ISSUE** unless it's a technical problem coming with a clear root cause.

> Simply put _My game doesn't launch_ or _I can't login_ without telling any technical detail is not acceptable, please go to the Discord server instead of abusing Github Issues

**DON'T ASK FOR SUPPORT IN OTHER COMMUNITY**, especially the official one.

## Install

- Download the launcher archive from [Releases](https://github.com/HighDelay/yaagl-nvk/releases/latest).

- Extract the whole folder, open `ZZZ/`, `GI/` or `HSR/`, then open **Start YAAGL NVK.command**. Keep its app and `launcher-data` folder together; the app is not a standalone bundle.

- Follow the [setup instructions](docs/NVK.md). Each game's prefix and settings stay inside its launcher folder; game files can be stored separately.
<!--
## Development (Outdated)

### Setup
```sh
git clone https://github.com/3Shain/yet-another-anime-game-launcher
cd yet-another-anime-game-launcher
pnpm install
./configure.sh
pnpm exec neu update
```


### Run
```sh
# CN
pnpm start
# Oversea
pnpm run start-hk4eos
```

### Build
```sh
node ./build-app.js
``` -->

## Uninstall (completely)
1. Drag app to the bin
2. Open Terminal and run:
   ```sh
   open ~/Library/Application\ Support/
   ```
   From there, locate and delete the `Yaagl` folder (or `Yaagl OS` if you are using overseas/global version). (For HSR and ZZZ the name of folder is slightly different)

## Related projects

* Custom `neutralinojs` binary from [3Shain/neutralinojs](https://github.com/3Shain/neutralinojs)
* [DXMT](https://github.com/3Shain/dxmt)
* Custom Wine from [anime-game-wine](https://github.com/yaagl/anime-game-wine)

## Special thanks
* An Anime Team
* Krock, the game running on macOS can not come true without his patch (you can find the link to his work in this repository, while you have to make a little effort ;) )

* mkrsym1, tackled IMO the most challenging AC component. It's a really remarkable and mind-blowing achievement.
