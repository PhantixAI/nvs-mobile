#!/bin/bash
# Install + launch an exported iOS archive (.ipa) on Desh's physical iPhone,
# without going through the App Store / TestFlight.
#
# A Release .xcarchive is signed for App Store distribution and can't be
# sideloaded directly (devicectl error 0xe800801f, "Beta profile without the
# proper entitlement"). It must first be re-exported from Xcode Organizer via
# Distribute App -> Development (labeled "Debugging" in recent Xcode), which
# re-signs it with your Apple Development profile. This script installs and
# launches that exported .ipa.
#
# Usage:
#   ./run-ios-archieve-on-ph-device.sh [path/to/App.ipa] [device-udid]
#
# If no .ipa path is given, picks the most recently exported .ipa under
# ~/home/code/apps/iOS-Archieve (where Organizer's export defaults to).
# If no device UDID is given, defaults to Desh's iPhone.
set -e

DEFAULT_DEVICE_UDID="00008120-000A02A40A87A01E"
ARCHIVE_EXPORT_DIR="$HOME/home/code/apps/iOS-Archieve"

IPA_PATH="$1"
DEVICE_UDID="${2:-$DEFAULT_DEVICE_UDID}"

if [ -z "$IPA_PATH" ]; then
  IPA_PATH=$(find "$ARCHIVE_EXPORT_DIR" -name "*.ipa" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
  if [ -z "$IPA_PATH" ]; then
    echo "No .ipa given and none found under $ARCHIVE_EXPORT_DIR." >&2
    echo "Export one first: Xcode -> Organizer -> Distribute App -> Development." >&2
    exit 1
  fi
  echo "No .ipa path given, using most recent export: $IPA_PATH"
fi

if [ ! -f "$IPA_PATH" ]; then
  echo "Could not find .ipa at: $IPA_PATH" >&2
  exit 1
fi

if ! xcrun devicectl list devices 2>/dev/null | grep -q "$DEVICE_UDID"; then
  echo "Device $DEVICE_UDID not found/connected. Plug in the iPhone and unlock it." >&2
  echo "To find a device's UDID: xcrun xctrace list devices" >&2
  exit 1
fi

# Read the bundle ID out of the ipa itself instead of hardcoding it, so this
# script works for NITians/APEX/Navodians exports interchangeably.
UNZIP_DIR=$(mktemp -d)
trap 'rm -rf "$UNZIP_DIR"' EXIT
unzip -q "$IPA_PATH" -d "$UNZIP_DIR"
APP_PATH=$(find "$UNZIP_DIR/Payload" -maxdepth 1 -name "*.app" | head -1)
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP_PATH/Info.plist")

echo "Installing $(basename "$IPA_PATH") ($BUNDLE_ID) on device $DEVICE_UDID..."
xcrun devicectl device install app --device "$DEVICE_UDID" "$IPA_PATH"

echo "Launching $BUNDLE_ID..."
xcrun devicectl device process launch --device "$DEVICE_UDID" --console "$BUNDLE_ID"
