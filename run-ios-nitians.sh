#!/bin/bash
# Run the NITians app on iOS Simulator
echo "$(pwd)/.env.nitians" > /tmp/envfile
trap 'rm -f /tmp/envfile' EXIT
yarn react-native run-ios --scheme NITians --simulator "iPad Air 11-inch"
#yarn react-native run-ios --scheme NITians --simulator "iPhone 17"
#yarn react-native run-ios --scheme NITians --device "Desh iPhone"
