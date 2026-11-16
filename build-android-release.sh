#!/bin/bash
set -e

export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

cd "$(dirname "$0")/android"

echo "Cleaning previous app build output..."
# NOTE: deliberately NOT using `./gradlew clean` here — on this project's New
# Architecture setup, `clean` wipes each native module's Codegen-generated JNI
# source dirs, but Gradle's own externalNativeBuildClean<Flavor><Variant> tasks
# then try to reconfigure CMake (via Android-autolinking.cmake), which references
# those same now-deleted directories and fails before cleaning can finish.
# Removing app/build directly purges the same stale generated resValues/JS
# bundles/packaged resources that caused cross-flavor contamination, without
# touching node_modules' native module build/.cxx caches or triggering CMake.
rm -rf app/build

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
