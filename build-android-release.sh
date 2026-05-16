#!/bin/bash
set -e

export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

cd "$(dirname "$0")/android"

echo "Building release AABs for all 3 apps..."
# Each flavor must run in its own Gradle invocation — react-native-config's
# dotenv.gradle picks the active .env file once per invocation from the first
# matching task name on the command line, so combining multiple flavors' tasks
# into one `gradlew` call causes them to all inherit the first flavor's .env values.
./gradlew bundleNavodiansRelease
./gradlew bundleNitiansRelease
./gradlew bundleIitiansRelease

echo ""
echo "Build complete. AAB files:"
echo "  Navodians: app/build/outputs/bundle/navodiansRelease/app-navodians-release.aab"
echo "  NITians:   app/build/outputs/bundle/nitiansRelease/app-nitians-release.aab"
echo "  APEX:      app/build/outputs/bundle/iitiansRelease/app-iitians-release.aab"
