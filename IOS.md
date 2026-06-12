# SKYRISE on iOS (Xcode) 📱

The iOS app is a thin Capacitor shell around the exact same game code.
The web files at the repo root stay the single source of truth — you never
edit anything inside the Xcode project to change the game.

## One-time setup (on your Mac)

Prerequisites:
- **Xcode 15+** (App Store), opened once so it installs its tools
- **Node 18+** (`brew install node` if needed)
- **CocoaPods** (`brew install cocoapods`) — Capacitor uses it to manage
  the native plugins

Then, from a clone of this repo:

```sh
npm install          # pulls Capacitor + plugins (haptics, preferences, status bar)
npm run ios:init     # stages www/, generates the ios/ Xcode project, syncs
npm run ios:open     # opens the project in Xcode
```

In Xcode:
1. Select the **App** target → *Signing & Capabilities* → choose your
   personal team (a free Apple ID works for running on your own phone).
2. Pick a simulator (or your plugged-in iPhone) in the device bar.
3. Press **Run** ▶.

That's it — SKYRISE launches fullscreen with native haptics on builds,
errors, star-ups, and level completions.

> Commit the generated `ios/` folder once it exists — it's part of the
> project from then on (Capacitor's own .gitignore inside it excludes
> Pods/ and build products).

## Day-to-day workflow

Game development continues on the web files (fast iteration, works in any
browser). When you want to see changes in the app:

```sh
npm run ios:sync     # re-stages www/ and syncs it into the Xcode project
```

then Run again in Xcode. No native code changes needed.

## What the native shell adds

| Capability | How it works here |
|---|---|
| Haptics | `js/native.js` bridges to the Capacitor Haptics plugin; calls are no-ops on the web |
| Durable saves | localStorage is mirrored to native Preferences and restored at boot (`SaveSystem.restoreFromNative`), so iOS storage eviction can't eat a tower |
| Status bar / notch | Status bar overlays the game; the existing safe-area CSS handles insets |
| App icon | `icons/icon-1024.png` is the App Store marketing icon; drop it (and sizes Xcode requests) into `ios/App/App/Assets.xcassets/AppIcon.appiconset` |

## Toward the App Store

- Set your real bundle id in `capacitor.config.json` (`appId`) **before**
  running `ios:init`, e.g. `com.yourname.skyrise`.
- You'll need the paid Apple Developer Program ($99/yr) to distribute.
- Archive via Xcode → *Product → Archive* → Distribute. TestFlight first.
- Good additions before submission: Game Center for campaign medals
  (`@capacitor-community` plugins or a small Swift bridge), iCloud key-value
  sync for saves, and a capture-based App Store screenshot set.
