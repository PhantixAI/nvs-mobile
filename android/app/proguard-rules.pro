# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep file/line info so Play Console and Sentry stack traces stay readable
# once R8 obfuscates class and method names.
-keepattributes SourceFile,LineNumberTable,*Annotation*
-renamesourcefileattribute SourceFile

# Reflection/JNI-driven native modules (see the libraries' setup docs).
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-config finds <build_config_package>.BuildConfig with
# Class.forName and reads its fields reflectively; without this R8 removes the
# class and every .env value (site URL, app name, Sentry DSN) comes back empty.
-keep class com.discourse.BuildConfig { *; }
