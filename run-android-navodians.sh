#!/bin/bash
# Run the Navodians app on Android device
export PATH=$PATH:$HOME/Library/Android/sdk/platform-tools
yarn react-native run-android --mode navodiansDebug --appId com.navodians.app
