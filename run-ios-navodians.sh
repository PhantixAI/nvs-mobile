#!/bin/bash
# Run the Navodians app on iOS Simulator
echo "$(pwd)/.env.navodians" > /tmp/envfile
yarn react-native run-ios --scheme Navodians --simulator "iPhone 17"
