#!/bin/bash
# Run the APEX app on Android device
export PATH=$PATH:$HOME/Library/Android/sdk/platform-tools
yarn react-native run-android --mode iitiansDebug --appId in.iitians.app
