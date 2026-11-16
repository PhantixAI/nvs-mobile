/* @flow */
'use strict';

import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome5 from '@react-native-vector-icons/fontawesome5';
import { ThemeContext } from '../ThemeContext';

const ChatScreen = ({ screenProps }) => {
  const theme = useContext(ThemeContext);
  const siteManager = screenProps.siteManager;
  const site = siteManager?.sites?.[0];

  const webviewRef = useRef(null);
  const canGoBackRef = useRef(false);

  const [chatUrl, setChatUrl] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    if (!site?.authToken) {
      setNeedsLogin(true);
      setChatUrl(null);
      return;
    }

    setNeedsLogin(false);

    // Use generateURLParams so Discourse creates an authenticated session in the WebView
    // (same mechanism the home WebView uses — Discourse maps user_api_public_key → session cookie)
    siteManager.generateURLParams(site)
      .then(params => setChatUrl(`${site.url}/chat?${params}`))
      .catch(() => setChatUrl(`${site.url}/chat`));
  }, [site?.authToken, site?.url]);

  // Android: navigate back within the WebView before leaving the tab
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

  // ── No auth ───────────────────────────────────────────────────────────────

  if (!site?.authToken || needsLogin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.grayBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.grayTitle }]}>Chat</Text>
        </View>
        <View style={styles.authGate}>
          <FontAwesome5 name="comments" size={48} color={theme.grayBorder} iconStyle="solid" />
          <Text style={[styles.authTitle, { color: theme.grayTitle }]}>Log in to access chat</Text>
          <Text style={[styles.authSubtitle, { color: theme.grayUI }]}>
            Sign in to join conversations with your community.
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: theme.blueCallToAction }]}
            onPress={() => {
              if (!site) { return; }
              siteManager.setActiveSite(site);
              siteManager.generateAuthURL(site).then(authUrl => {
                screenProps.openUrl(authUrl);
              });
            }}
          >
            <Text style={styles.loginBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Building auth URL ─────────────────────────────────────────────────────

  if (!chatUrl) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} size="large" color={theme.grayUI} />
      </SafeAreaView>
    );
  }

  // ── Chat WebView ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top', 'left', 'right']}
    >
      <WebView
        ref={webviewRef}
        source={{ uri: chatUrl }}
        applicationNameForUserAgent="DiscourseHub"
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        style={{ flex: 1, backgroundColor: theme.background }}
        onNavigationStateChange={navState => {
          canGoBackRef.current = navState.canGoBack;
        }}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator
            style={StyleSheet.absoluteFill}
            size="large"
            color={theme.grayUI}
          />
        )}
        onShouldStartLoadWithRequest={request => {
          // Stay within the site domain; block external navigations
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  authGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  loginBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChatScreen;
