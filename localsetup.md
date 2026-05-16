# Local Development Setup

This repo builds three white-label apps — **Navodians**, **NITians**, and **APEX** — from a single React Native codebase. Each app is controlled by its own `.env` file and maps to an iOS scheme + Android product flavor.

| App | `.env` file | iOS scheme | Android flavor | Android App ID | iOS Bundle ID |
|---|---|---|---|---|---|
| Navodians | `.env.navodians` | `Navodians` | `navodians` | `com.navodians.app` | `com.navodians.app` |
| NITians | `.env.nitians` | `NITians` | `nitians` | `in.nitians.app` | `in.nitians.app` |
| APEX | `.env.iitians` | `APEX` | `iitians` | `in.iitians.app` | `in.iitians.app` |

---

## Prerequisites

### All platforms
- **Node.js** ≥ 18 — [nodejs.org](https://nodejs.org) or via `nvm`
- **Yarn** — `npm install -g yarn`
- **React Native CLI** — `npm install -g @react-native-community/cli`

### macOS / iOS
- **Xcode** (tested with 26.5) — install from Mac App Store
- **CocoaPods** — `sudo gem install cocoapods` (see `Gemfile` for version constraints)
- **Ruby** ≥ 2.6 (system Ruby works; rbenv recommended for version management)

### Android
- **Android Studio** with:
  - Android SDK Platform 35
  - Android SDK Build-Tools 35.0.0
  - NDK 27.1.12297006
- **Java 17** (JDK) — Android Studio bundles this; or install via `brew install --cask temurin@17`
- Set `ANDROID_HOME` in your shell profile:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

---

## First-time Setup

```bash
# 1. Install JS dependencies
yarn install

# 2. Install iOS CocoaPods
yarn pod
# equivalent to: pod install --project-directory=ios
```

---

## Running Locally

### iOS (Simulator)

Each script writes the correct `.env` path to `/tmp/envfile` before launching so `react-native-config` picks up the right variables.

```bash
./run-ios-navodians.sh   # Navodians on iPhone 17 Simulator
./run-ios-nitians.sh     # NITians on iPhone 17 Simulator
./run-ios-apex.sh        # APEX on iPhone 17 Simulator
```

To run on a different simulator, edit the `--simulator` flag inside the script, e.g. `--simulator "iPhone 15 Pro"`.  
To run on a physical device, replace `--simulator "..."` with `--device`.

### Android (Device or Emulator)

Connect a device via USB (with USB debugging enabled) or start an emulator in Android Studio first.

```bash
./run-android-navodians.sh   # Navodians
./run-android-nitians.sh     # NITians
./run-android-apex.sh        # APEX
```

These scripts add `$HOME/Library/Android/sdk/platform-tools` to `PATH` automatically.

### Metro bundler (manual)

The run scripts start Metro automatically. If you need to start it separately (e.g. with cache reset):

```bash
yarn start                  # start Metro
yarn start --reset-cache    # start Metro with clean cache
```

---

## Environment Variables

Each app's configuration lives in its `.env.*` file:

```
APP_NAME            Display name of the app
APP_VARIANT         Internal variant key (navodians / nitians / iitians)
APP_SITE_URL        Discourse site URL the app points to
APP_URL_SCHEME      Custom URL scheme for auth redirect
APP_PRIMARY_COLOR   Hex accent color (buttons, links, tab bar)
APP_DEVICE_PREFIX   Prefix used in device registration name
APP_LOGIN_MESSAGE   Message shown on the login screen
```

These are injected at build time via `react-native-config`. **iOS** reads them via Xcode build configuration; **Android** reads them via Gradle. Changing a value requires a rebuild — a Metro restart alone is not enough.

---

## Project Structure

```
js/               React Native source code
  screens/        Screen components (SingleSiteWebView, etc.)
  AppConfig.js    Reads env vars via react-native-config
  ThemeContext.js Theme derived from AppConfig.primaryColor

ios/
  Discourse.xcworkspace   Open this in Xcode (not .xcodeproj)
  navodians/              Per-app assets (icons, Info.plist, GoogleService-Info.plist)
  nitians/
  iitians/

android/
  app/src/main/           Shared Android source
  app/src/navodians/      Per-flavor assets (google-services.json)
  app/src/nitians/
  app/src/iitians/

.env.navodians    Navodians config
.env.nitians      NITians config
.env.iitians      APEX config

run-ios-*.sh      iOS launch scripts (one per app)
run-android-*.sh  Android launch scripts (one per app)
```

---

## Common Issues

**`pod install` fails**  
Run `yarn pod` from the project root (not from inside `ios/`). If it still fails, try:
```bash
cd ios && pod deintegrate && cd .. && yarn pod
```

**Metro can't find module after switching apps**  
Always reset the Metro cache when switching between apps:
```bash
yarn start --reset-cache
```

**Android: `adb: command not found`**  
Ensure `ANDROID_HOME` is set and `platform-tools` is on your `PATH` (see Prerequisites above).

**Android: `installXxxDebug` task ambiguous**  
Use the `--mode` flag exactly as written in the run scripts (`navodiansDebug`, `nitiansDebug`, `iitiansDebug`).

**iOS build fails after `yarn install`**  
Re-run `yarn pod` — JS dependency changes often require a Pod reinstall.

**Xcode: "No signing certificate"**  
Open `ios/Discourse.xcworkspace` → select the target → Signing & Capabilities → choose your Apple ID team. For local debug builds, "Automatically manage signing" is fine.
