#!/bin/bash
# Run the NITians app on iOS Simulator
echo "$(pwd)/.env.nitians" > /tmp/envfile
yarn react-native run-ios --scheme NITians --simulator "iPhone 17"
