/* @flow */
'use strict';

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
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

  const webviewRef = useRef(null);
  const canGoBackRef = useRef(false);

  // Subscribe to siteManager so login / logout / load events update state
  // NOTE: site is always read fresh from siteManager inside effects/callbacks
  //       to avoid stale closure bugs when sites load asynchronously.
  useEffect(() => {
    const onChange = () => {
      setLoadingSites(siteManager.isLoading());
      setAuthToken(siteManager?.sites?.[0]?.authToken ?? null);
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

    // Prefer an OTP Discourse already embedded in the auth_redirect payload
    // (see Discourse.js's setPendingOtp) — a follow-up POST to
    // /user-api-key/otp can be rejected (403) depending on how the key was
    // granted. Only fetch our own when none was supplied (e.g. password login).
    const pendingOtp = siteManager.takePendingOtp?.();
    if (pendingOtp) {
      setOtpPending(true);
      setWebUrl(`${site.url}/session/otp/${pendingOtp}`);
      return;
    }

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
      // Open in the real system browser rather than an embedded WebView/
      // ASWebAuthenticationSession — those isolate cookies during the OAuth
      // round-trip through Apple/Google, which drops the CSRF state cookie
      // and breaks Sign in with Apple/Google. The root-level Linking listener
      // in Discourse.js catches the app's return via auth_redirect and calls
      // handleAuthPayload, which flows into the onChange subscription above.
      await Linking.openURL(authUrl);
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
              <Text style={styles.loginBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
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
        // Auto-submits Discourse's OTP "Finish Login" confirmation form (a plain
        // HTML form at /session/otp/:token — see app/views/session/one_time_password.html.erb)
        // so the user lands straight in the logged-in forum instead of needing an extra tap.
        // Guarded by pathname so it's a no-op on every other page this WebView loads.
        injectedJavaScript={`
          (function() {
            if (window.location.pathname.startsWith('/session/otp/')) {
              var form = document.querySelector('form');
              if (form) { form.submit(); }
            }
            true;
          })();
        `}
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
          // Detect the web session getting logged out (e.g. via Discourse's own
          // in-page menu) and clear the app's stored token so the auth gate
          // shows again, instead of leaving the site's logged-out page visible.
          if (!navState.loading && navState.url.startsWith(`${site.url}/login`)) {
            siteManager.logOut(site);
          }
        }}
        onShouldStartLoadWithRequest={request => {
          if (request.url.startsWith(site.url)) { return true; }
          if (request.url.startsWith('about:')) { return true; }
          return false;
        }}
      />
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
});

export default SingleSiteWebView;
