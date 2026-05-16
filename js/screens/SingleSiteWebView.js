/* @flow */
'use strict';

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext } from '../ThemeContext';
import AppConfig from '../AppConfig';
import appLogo from '../appLogo';

const SingleSiteWebView = ({ screenProps }) => {
  const theme = useContext(ThemeContext);
  const siteManager = screenProps.siteManager;

  // Track authToken and loading state so login/logout/load events trigger re-renders
  const [loadingSites, setLoadingSites] = useState(() => siteManager.isLoading());
  const [authToken, setAuthToken] = useState(() => siteManager?.sites?.[0]?.authToken ?? null);
  const [webUrl, setWebUrl] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [authWebViewUrl, setAuthWebViewUrl] = useState(null);

  const webviewRef = useRef(null);
  const canGoBackRef = useRef(false);

  // Subscribe to siteManager so login / logout / load events update state
  // NOTE: site is always read fresh from siteManager inside effects/callbacks
  //       to avoid stale closure bugs when sites load asynchronously.
  useEffect(() => {
    const onChange = () => {
      const newToken = siteManager?.sites?.[0]?.authToken ?? null;
      setLoadingSites(siteManager.isLoading());
      setAuthToken(newToken);
      // Close the Android auth WebView overlay as soon as the token arrives,
      // regardless of whether it came via onShouldStartLoadWithRequest or Linking.
      if (newToken) { setAuthWebViewUrl(null); }
    };
    siteManager.subscribe(onChange);
    return () => siteManager.unsubscribe(onChange);
  }, []);

  // Build the authenticated WebView URL whenever authToken or site URL changes
  useEffect(() => {
    const site = siteManager?.sites?.[0];

    if (!authToken || !site) {
      setNeedsLogin(true);
      setWebUrl(null);
      setOtpPending(false);
      return;
    }

    setNeedsLogin(false);

    // OTP flow for both iOS and Android.
    // generateURLParams returns auth_redirect=appscheme://... which Discourse redirects to after
    // creating the session — onShouldStartLoadWithRequest blocks that scheme URL → WebView stuck.
    // OTP redirects to site.url/ instead, which is always allowed.
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = false;
    xhr.open('POST', `${site.url}/user-api-key/otp`, true);
    xhr.setRequestHeader('User-Api-Key', authToken);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 15000;
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (json.key) {
          setOtpPending(true);
          setWebUrl(`${site.url}/session/otp/${json.key}`);
        } else {
          setWebUrl(site.url);
        }
      } catch (_) {
        setWebUrl(site.url);
      }
    };
    xhr.onerror = () => setWebUrl(site.url);
    xhr.ontimeout = () => setWebUrl(site.url);
    xhr.send();
  }, [authToken]);

  // Android hardware back button — navigate within WebView before leaving
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current && webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const handleLogin = useCallback(async () => {
    const site = siteManager?.sites?.[0];
    if (!site) { return; }
    siteManager.setActiveSite(site);
    try {
      const authUrl = await siteManager.generateAuthURL(site);
      if (Platform.OS === 'ios') {
        // ASWebAuthenticationSession — handleAuthPayload fires inside → _onChange → setAuthToken → useEffect builds URL
        await siteManager.requestAuth(authUrl);
      } else {
        // Android: in-app WebView modal — no Chrome Custom Tabs, nothing to close manually
        setAuthWebViewUrl(authUrl);
      }
    } catch (_) {}
  }, []);

  // ── Loading (siteManager reading AsyncStorage) ─────────────────────────────

  if (loadingSites) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.grayUI} />
      </SafeAreaView>
    );
  }

  // ── Auth WebView overlay (Android) — shown on top of whatever is beneath ──────

  const authWebViewOverlay = Platform.OS === 'android' && authWebViewUrl ? (
    <View style={[StyleSheet.absoluteFill, styles.authWebViewOverlay, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={['top']}>
        <View style={[styles.authWebViewHeader, { borderBottomColor: theme.grayBorder }]}>
          <TouchableOpacity
            onPress={() => setAuthWebViewUrl(null)}
            style={styles.authWebViewSide}
          >
            <Text style={{ color: theme.blueCallToAction, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.authWebViewTitle, { color: theme.grayTitle }]}>Log In</Text>
          <View style={styles.authWebViewSide} />
        </View>
      </SafeAreaView>
      <WebView
        source={{ uri: authWebViewUrl }}
        originWhitelist={['https://*', 'http://*', `${AppConfig.urlScheme}://*`]}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={theme.grayUI} />
        )}
        onShouldStartLoadWithRequest={request => {
          if (request.url.startsWith(AppConfig.urlScheme + '://')) {
            const urlParams = siteManager.parseURLparameters(request.url);
            if (urlParams.payload) {
              siteManager.handleAuthPayload(urlParams.payload);
            }
            setAuthWebViewUrl(null);
            return false;
          }
          return true;
        }}
      />
    </View>
  ) : null;

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (!authToken || needsLogin) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.authGate}>
            <Image
              source={appLogo}
              style={{ width: 72, height: 72 }}
              resizeMode="contain"
            />
            <Text style={[styles.authTitle, { color: theme.grayTitle }]}>
              {AppConfig.loginMessage}
            </Text>
            <TouchableOpacity
              style={[styles.loginBtn, { backgroundColor: theme.blueCallToAction }]}
              onPress={handleLogin}
            >
              <Text style={styles.loginBtnText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        {authWebViewOverlay}
      </View>
    );
  }

  // ── Building auth URL ──────────────────────────────────────────────────────

  if (!webUrl) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.grayUI} />
      </SafeAreaView>
    );
  }

  // ── Full-screen Discourse WebView ──────────────────────────────────────────

  const site = siteManager?.sites?.[0];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top', 'left', 'right']}
    >
      <WebView
        ref={webviewRef}
        source={{ uri: webUrl }}
        applicationNameForUserAgent="DiscourseHub"
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        style={{ flex: 1, backgroundColor: theme.background }}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator
            style={StyleSheet.absoluteFill}
            size="large"
            color={theme.grayUI}
          />
        )}
        onNavigationStateChange={navState => {
          canGoBackRef.current = navState.canGoBack;
          // Detect when OTP redirect has completed (landed on home) — applies to both platforms
          if (otpPending && !navState.loading) {
            if (
              navState.url.startsWith(site.url) &&
              !navState.url.includes('/session/otp/')
            ) {
              setOtpPending(false);
            }
          }
        }}
        onShouldStartLoadWithRequest={request => {
          if (request.url.startsWith(site.url)) { return true; }
          if (request.url.startsWith('about:')) { return true; }
          return false;
        }}
      />
      {authWebViewOverlay}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  authGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 26,
  },
  loginBtn: {
    marginTop: 28,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  authWebViewOverlay: {
    zIndex: 10,
  },
  authWebViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  authWebViewSide: { width: 70 },
  authWebViewTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SingleSiteWebView;
