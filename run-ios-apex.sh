#!/bin/bash
# Run the APEX app on iOS Simulator
echo "$(pwd)/.env.iitians" > /tmp/envfile
#yarn react-native run-ios --scheme APEX --simulator "iPhone 17"
yarn react-native run-ios --scheme APEX --device "Desh iPhone"
