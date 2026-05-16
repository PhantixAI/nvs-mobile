#!/bin/bash
# Run the NITians app on Android device
export PATH=$PATH:$HOME/Library/Android/sdk/platform-tools
yarn react-native run-android --mode nitiansDebug --appId in.nitians.app
