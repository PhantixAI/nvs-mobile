#!/bin/bash
# Run the NITians app on Desh's iPhone (physical device)
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

SCHEME="NITians"
BUNDLE_ID="in.nitians.app"
DEVICE_NAME="Desh iPhone"

# Physical devices aren't simulators -- xcrun simctl can't see them, so this
# uses devicectl's device list/install/launch instead of simctl, with
# -allowProvisioningUpdates so Xcode can auto-generate a development
# provisioning profile matching whatever signing identity is in the keychain
# (see run-ios-nitians.sh for the simulator equivalent).
UDID=$(xcrun devicectl list devices 2>/dev/null | grep "$DEVICE_NAME" | grep -oE '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}' | head -1)
if [ -z "$UDID" ]; then
  echo "Could not find a connected/paired device named \"$DEVICE_NAME\"." >&2
  echo "Run 'xcrun devicectl list devices' to see what's available." >&2
  exit 1
fi

echo "Building for $DEVICE_NAME ($UDID)..."
echo "Make sure the device is unlocked -- devicectl can't install/launch on a locked device."

xcodebuild \
  -workspace ios/Discourse.xcworkspace \
  -configuration Debug \
  -scheme "$SCHEME" \
  -destination "id=$UDID" \
  -derivedDataPath ios/build \
  -allowProvisioningUpdates \
  build

APP_PATH="ios/build/Build/Products/Debug-iphoneos/$SCHEME.app"
xcrun devicectl device install app --device "$UDID" "$APP_PATH"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID"
