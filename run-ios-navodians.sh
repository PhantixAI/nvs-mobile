#!/bin/bash
# Run the Navodians app on iOS Simulator
echo "$(pwd)/.env.navodians" > /tmp/envfile
trap 'rm -f /tmp/envfile' EXIT
yarn react-native run-ios --scheme Navodians --simulator "iPad Air 11-inch"
#yarn react-native run-ios --scheme Navodians --simulator "iPhone 17"
#yarn react-native run-ios --scheme Navodians --device "Desh iPhone"
