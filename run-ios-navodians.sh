#!/bin/bash
# Run the Navodians app on iOS Simulator
set -e

# NOTE: do NOT write /tmp/envfile here. react-native-config's iOS codegen
# (node_modules/react-native-config/ios/ReactNativeConfig/ReadDotEnv.rb)
# checks that single machine-wide file BEFORE the per-target ENVFILE Xcode
# build setting that's already correctly wired in project.pbxproj for this
# scheme -- and it's only cleaned up by a `trap ... EXIT` that never fires on
# a crash/kill/interrupted build. A stale leftover from one flavor silently
# hijacks every later iOS build on this machine, including production
# archives built outside these scripts entirely (confirmed root cause of the
# NITians-loads-APEX production bug, Oct 2026).

SCHEME="Navodians"
BUNDLE_ID="com.navodians.app"
SIMULATOR_NAME="iPad Air 11-inch"

# `react-native run-ios` unconditionally tries to open Simulator.app before
# building, but that app doesn't exist in this machine's Xcode install —
# build and launch directly via xcodebuild/simctl instead.
UDID=$(xcrun simctl list devices available | grep -E "^ *${SIMULATOR_NAME} \([0-9A-Fa-f-]+\) \(" | head -1 | sed -E 's/.*\(([0-9A-Fa-f-]+)\) \(.*/\1/')
if [ -z "$UDID" ]; then
  echo "Could not find an available simulator named \"$SIMULATOR_NAME\"." >&2
  exit 1
fi

if ! xcrun simctl list devices | grep -q "($UDID) (Booted)"; then
  echo "Booting $SIMULATOR_NAME ($UDID)..."
  xcrun simctl boot "$UDID"
fi

xcodebuild \
  -workspace ios/Discourse.xcworkspace \
  -configuration Debug \
  -scheme "$SCHEME" \
  -destination "id=$UDID" \
  -derivedDataPath ios/build \
  build

APP_PATH="ios/build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$BUNDLE_ID"
