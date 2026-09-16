#!/bin/bash
# Run the Navodians app on iOS Simulator
set -e

echo "$(pwd)/.env.navodians" > /tmp/envfile
trap 'rm -f /tmp/envfile' EXIT

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
