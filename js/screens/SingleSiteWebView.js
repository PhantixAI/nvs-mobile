/* @flow */
'use strict';

import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CustomTabs } from 'react-native-custom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { ThemeContext } from '../ThemeContext';
import AppConfig from '../AppConfig';
import appLogo from '../appLogo';

// A load that never fires onLoadEnd/onError within this window is treated as
// a hang (e.g. a stalled connection on poor networks) and surfaced the same
// way as a hard failure, since otherwise the ActivityIndicator spins forever
// with no visibility into what's wrong.
const WEBVIEW_LOAD_TIMEOUT_MS = 20000;
// Above this, a load that did complete is still worth flagging as slow —
// this is the signal used to quantify degradation on low-bandwidth networks.
const WEBVIEW_SLOW_LOAD_THRESHOLD_MS = 8000;

const SingleSiteWebView = ({ screenProps }) => {
  const theme = useContext(ThemeContext);
  const siteManager = screenProps.siteManager;

  // Track authToken and loading state so login/logout/load events trigger re-renders
  const [loadingSites, setLoadingSites] = useState(() =>
    siteManager.isLoading(),
  );
  const [authToken, setAuthToken] = useState(
    () => siteManager?.sites?.[0]?.authToken ?? null,
  );
  const [webUrl, setWebUrl] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [webViewError, setWebViewError] = useState(null);
  // True from the moment Continue is tapped until the returned auth token
  // is actually processed — see handleLogin and the fallback effect below
  // for why this can't just track the in-flight promise directly.
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // A deep link (from a tapped push notification) waiting to be applied
  // once the WebView reaches a stable, authenticated, non-OTP state — see
  // the dedicated effect below for why this can't just be applied on
  // arrival.
  const [pendingDeepLink, setPendingDeepLink] = useState(null);

  const webviewRef = useRef(null);
  const canGoBackRef = useRef(false);
  // Guards the imperative OTP-form-submit fallback (see onNavigationStateChange
  // below) so it only fires once per OTP session, reset whenever a fresh one starts.
  const otpSubmittedRef = useRef(false);
  // Holds the grace-period timeout scheduled by the isAuthenticating
  // fallback effect below, so it can be cleared/replaced correctly.
  const authFallbackTimeoutRef = useRef(null);
  // Timestamp of the current load's onLoadStart, and the hang-detection
  // timer armed alongside it — see the WebView's onLoadStart/onLoadEnd below.
  const loadStartRef = useRef(null);
  const loadTimeoutRef = useRef(null);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  // The WebView's underlying connection can go stale after the app sits
  // backgrounded for a while (OS reclaims the content process / network
  // session); the next load then fails with e.g. NSURLErrorTimedOut and,
  // without a retry, leaves the raw native error page on screen
  // indefinitely. Auto-retry once when the app comes back to the
  // foreground after such a failure. Clearing webViewError alone is enough
  // to recover — it swaps the error view back out for <WebView>, which
  // mounts fresh (webviewRef is null while the error view is showing,
  // since the WebView itself is unmounted, so there's nothing to call
  // .reload() on here).
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && webViewError) {
        clearLoadTimeout();
        setWebViewError(null);
      }
    });
    return () => sub.remove();
  }, [webViewError, clearLoadTimeout]);

  // A stale hang-detection timer from a previous URL must not fire after a
  // later successful load — clear it whenever the target URL changes, and on
  // unmount.
  useEffect(() => {
    return () => clearLoadTimeout();
  }, [webUrl, clearLoadTimeout]);

  // Subscribe to siteManager so login / logout / load events update state
  // NOTE: site is always read fresh from siteManager inside effects/callbacks
  //       to avoid stale closure bugs when sites load asynchronously.
  useEffect(() => {
    const onChange = () => {
      setLoadingSites(siteManager.isLoading());
      setAuthToken(siteManager?.sites?.[0]?.authToken ?? null);

      const deepLink = siteManager.takePendingDeepLink?.();
      if (deepLink) {
        setPendingDeepLink(deepLink);
      }
    };
    siteManager.subscribe(onChange);
    return () => siteManager.unsubscribe(onChange);
  }, []);

  // Apply a pending deep link once (and only once) the WebView has reached a
  // stable, authenticated, fully-logged-in state. Re-evaluated on every
  // relevant change instead of applied immediately on arrival, because a
  // notification tapped from a killed app races the app's own startup: the
  // persisted session (siteManager.load() via AsyncStorage) and the OTP
  // auto-login redirect both complete asynchronously and can finish before
  // or after the deep link arrives. Applying too early — e.g. while
  // otpPending, before the OTP redirect has actually established the
  // session cookie — would strand the WebView on the deep link URL without
  // ever completing login.
  useEffect(() => {
    if (
      pendingDeepLink &&
      !loadingSites &&
      !needsLogin &&
      webUrl &&
      !otpPending
    ) {
      setWebUrl(pendingDeepLink);
      setPendingDeepLink(null);
    }
  }, [pendingDeepLink, loadingSites, needsLogin, webUrl, otpPending]);

  // Clears a stuck "authenticating" spinner if the user backs out of the
  // external auth flow without completing it, instead of leaving the
  // Continue button permanently replaced. Needed because neither platform's
  // success path is a reliable place to reset isAuthenticating: on iOS,
  // SiteManager.requestAuth swallows cancellation and never rejects; on
  // Android, CustomTabs.openURL resolves as soon as the tab opens, well
  // before auth actually completes or is cancelled. Instead, wait for the
  // app to return to the foreground and give the legitimate success path
  // (which lands via siteManager's onChange, independent of this effect) a
  // grace window to complete before falling back to re-showing the button.
  useEffect(() => {
    if (!isAuthenticating) {
      return;
    }

    const sub = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        clearTimeout(authFallbackTimeoutRef.current);
        authFallbackTimeoutRef.current = setTimeout(() => {
          setIsAuthenticating(false);
        }, 8000);
      }
    });

    return () => {
      sub.remove();
      clearTimeout(authFallbackTimeoutRef.current);
    };
  }, [isAuthenticating]);

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
      otpSubmittedRef.current = false;
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
          otpSubmittedRef.current = false;
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

  // Clearing webViewError swaps the error view back out for a freshly
  // mounted <WebView> (see the AppState effect above for why an explicit
  // .reload() call isn't needed/possible here).
  const handleRetry = useCallback(() => {
    setWebViewError(null);
  }, []);

  const handleLogin = useCallback(async () => {
    const site = siteManager?.sites?.[0];
    if (!site) {
      return;
    }
    siteManager.setActiveSite(site);
    setIsAuthenticating(true);
    try {
      const authUrl = await siteManager.generateAuthURL(site);
      if (Platform.OS === 'ios') {
        // ASWebAuthenticationSession presents sign-in as an in-app sheet rather
        // than switching to the system Safari app (Apple Guideline 4), while
        // still sharing the system cookie store so Sign in with Apple/Google
        // keep working. It resolves internally via handleAuthPayload, which
        // the authToken/OTP effects above already react to.
        await siteManager.requestAuth(authUrl);
      } else {
        // Chrome Custom Tabs presents sign-in as an overlay instead of fully
        // switching to the default browser app, while still using Chrome's
        // real cookie jar/login state — same Sign in with Google/Apple
        // benefit as ASWebAuthenticationSession above. Completion is still
        // signaled the same way as before: Discourse's auth_redirect lands
        // on the app's custom URL scheme, caught by _handleOpenUrl in
        // Discourse.js, regardless of which browser surface launched it.
        try {
          await CustomTabs.openURL(authUrl, {
            enableUrlBarHiding: true,
            showPageTitle: false,
          });
        } catch (_) {
          await Linking.openURL(authUrl);
        }
      }
    } catch (_) {}
  }, []);

  // ── Loading (siteManager reading AsyncStorage) ─────────────────────────────

  if (loadingSites) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator
          style={{ flex: 1 }}
          size="large"
          color={theme.grayUI}
        />
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
            {isAuthenticating ? (
              <View style={styles.loginBtn}>
                <ActivityIndicator size="small" color={theme.blueCallToAction} />
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.loginBtn,
                  { backgroundColor: theme.blueCallToAction },
                ]}
                onPress={handleLogin}
              >
                <Text style={styles.loginBtnText}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Building auth URL ──────────────────────────────────────────────────────

  if (!webUrl) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator
          style={{ flex: 1 }}
          size="large"
          color={theme.grayUI}
        />
      </SafeAreaView>
    );
  }

  // ── WebView failed to load ──────────────────────────────────────────────────

  if (webViewError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.authGate}>
            <Text style={[styles.authTitle, { color: theme.grayTitle }]}>
              {webViewError.description || 'Unable to load the page.'}
            </Text>
            <TouchableOpacity
              style={[
                styles.loginBtn,
                { backgroundColor: theme.blueCallToAction },
              ]}
              onPress={handleRetry}
            >
              <Text style={styles.loginBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
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
        // Prefers window.__otpAutoSubmit (the server page's own guarded submit
        // path, which prevents a double-POST of the one-time token if this
        // races a manual fallback tap) — falling back to a raw form.submit()
        // only against an older cached page that predates that guard.
        injectedJavaScript={`
          (function() {
            if (window.location.pathname.startsWith('/session/otp/')) {
              if (window.__otpAutoSubmit) {
                window.__otpAutoSubmit();
              } else {
                var form = document.querySelector('form');
                if (form) { form.submit(); }
              }
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
            } else if (
              Platform.OS === 'ios' &&
              navState.url.includes('/session/otp/') &&
              !otpSubmittedRef.current
            ) {
              // Reliable fallback for iOS only: the declarative
              // injectedJavaScript prop below can fire before the OTP form
              // is in the DOM (a WKWebView-only timing quirk). Android's
              // injectedJavaScript already auto-submits reliably on its
              // own — running this there too double-submits the one-time
              // password, and the second submit fails since it's already
              // been consumed.
              otpSubmittedRef.current = true;
              webviewRef.current?.injectJavaScript(`
                (function() {
                  if (window.__otpAutoSubmit) {
                    window.__otpAutoSubmit();
                  } else {
                    var form = document.querySelector('form');
                    if (form) { form.submit(); }
                  }
                  true;
                })();
              `);
            }
          }
          // Detect the web session getting logged out (e.g. via Discourse's own
          // in-page menu) and clear the app's stored token so the auth gate
          // shows again, instead of leaving the site's logged-out page visible.
          if (
            !navState.loading &&
            navState.url.startsWith(`${site.url}/login`)
          ) {
            siteManager.logOut(site);
          }
        }}
        onShouldStartLoadWithRequest={request => {
          if (request.url.startsWith(site.url)) {
            return true;
          }
          if (request.url.startsWith('about:')) {
            return true;
          }
          return false;
        }}
        onLoadStart={() => {
          loadStartRef.current = Date.now();
          clearLoadTimeout();
          loadTimeoutRef.current = setTimeout(() => {
            Sentry.captureMessage('webview_load_timeout', {
              level: 'error',
              tags: { app_variant: AppConfig.variant },
              extra: { url: webUrl, timeoutMs: WEBVIEW_LOAD_TIMEOUT_MS },
            });
            setWebViewError({ description: 'Unable to load the page.' });
          }, WEBVIEW_LOAD_TIMEOUT_MS);
        }}
        onLoadEnd={() => {
          clearLoadTimeout();
          if (loadStartRef.current) {
            const durationMs = Date.now() - loadStartRef.current;
            loadStartRef.current = null;
            if (durationMs > WEBVIEW_SLOW_LOAD_THRESHOLD_MS) {
              Sentry.captureMessage('webview_slow_load', {
                level: 'warning',
                tags: { app_variant: AppConfig.variant },
                extra: { durationMs, url: webUrl },
              });
            }
          }
        }}
        onHttpError={syntheticEvent => {
          const { statusCode, url } = syntheticEvent.nativeEvent;
          Sentry.captureMessage('webview_http_error', {
            level: 'error',
            tags: {
              app_variant: AppConfig.variant,
              status_code: String(statusCode),
            },
            extra: { url },
          });
        }}
        onError={syntheticEvent => {
          clearLoadTimeout();
          Sentry.captureException(
            new Error(
              `webview_load_error: ${syntheticEvent.nativeEvent.description}`,
            ),
            {
              tags: {
                app_variant: AppConfig.variant,
                error_code: String(syntheticEvent.nativeEvent.code),
              },
            },
          );
          setWebViewError(syntheticEvent.nativeEvent);
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
