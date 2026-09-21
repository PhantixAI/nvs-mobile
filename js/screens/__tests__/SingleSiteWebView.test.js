/* @flow */
'use strict';

import React from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';

jest.mock('../../AppConfig', () => ({
  variant: 'test',
  loginMessage: 'Welcome! Please log in to continue.',
  primaryColor: '#08c',
}));

jest.mock('@sentry/react-native', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('react-native-webview', () => ({ WebView: () => null }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('react-native-custom-tabs', () => ({
  CustomTabs: { openURL: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  return {
    // A host element (not a Fragment) so tests can read the background style.
    SafeAreaView: ({ children, style }) =>
      ReactActual.createElement('SafeAreaView', { style }, children),
  };
});

const { WebView } = require('react-native-webview');
const SingleSiteWebView = require('../SingleSiteWebView').default;
const AsyncStorage =
  require('@react-native-async-storage/async-storage').default;

// Lets the test control exactly when the webUrl-building XHR (POST
// /user-api-key/otp) "completes", instead of depending on a real network
// round-trip — see the onerror() call below.
class FakeXHR {
  constructor() {
    FakeXHR.instances.push(this);
  }
  open() {}
  setRequestHeader() {}
  send() {}
}
FakeXHR.instances = [];

function createFakeSiteManager() {
  let changeListener = null;
  return {
    isLoading: () => false,
    sites: [{ authToken: 'test-token', url: 'https://example.com' }],
    subscribe: jest.fn(cb => {
      changeListener = cb;
    }),
    unsubscribe: jest.fn(),
    takePendingOtp: () => null,
    takePendingDeepLink: () => null,
    logOut: jest.fn(),
    setActiveSite: jest.fn(),
    generateAuthURL: jest.fn(),
    requestAuth: jest.fn(),
    triggerChange: () => changeListener && changeListener(),
  };
}

describe('SingleSiteWebView pending deep link vs. stale webViewError', () => {
  beforeEach(() => {
    global.XMLHttpRequest = FakeXHR;
    FakeXHR.instances = [];
  });

  it('applies a pending deep link even while the Retry (webViewError) screen is showing', async () => {
    const siteManager = createFakeSiteManager();
    let tree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SingleSiteWebView screenProps={{ siteManager }} />,
      );
    });

    // Deterministically resolve the webUrl-building XHR so webUrl becomes truthy.
    await TestRenderer.act(async () => {
      FakeXHR.instances[0].onerror();
    });
    expect(tree.root.findByType(WebView).props.source.uri).toBe(
      'https://example.com',
    );

    // Simulate a load failure — this is the same path the 20s hang-timeout
    // takes (setWebViewError), so the Retry screen replaces the WebView.
    await TestRenderer.act(async () => {
      tree.root.findByType(WebView).props.onError({
        nativeEvent: { description: 'timed out', code: -1001 },
      });
    });
    expect(() => tree.root.findByType(WebView)).toThrow();

    // A deep link (e.g. from a tapped push notification) arrives while the
    // Retry screen is still showing.
    siteManager.takePendingDeepLink = () =>
      'https://example.com/deep-link-target';
    await TestRenderer.act(async () => {
      siteManager.triggerChange();
    });

    // The deep link must win over the stale error state: the WebView should
    // be back on screen, pointed at the deep-linked URL — not stuck on Retry.
    const webview = tree.root.findByType(WebView);
    expect(webview.props.source.uri).toBe(
      'https://example.com/deep-link-target',
    );
  });

  it('still deep-links normally when there is no error to clear', async () => {
    const siteManager = createFakeSiteManager();
    let tree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SingleSiteWebView screenProps={{ siteManager }} />,
      );
    });
    await TestRenderer.act(async () => {
      FakeXHR.instances[0].onerror();
    });

    siteManager.takePendingDeepLink = () =>
      'https://example.com/deep-link-target';
    await TestRenderer.act(async () => {
      siteManager.triggerChange();
    });

    const webview = tree.root.findByType(WebView);
    expect(webview.props.source.uri).toBe(
      'https://example.com/deep-link-target',
    );
  });
});

describe('SingleSiteWebView strip above the site header', () => {
  const message = color => JSON.stringify({ type: 'nvs-header-color', color });
  const stripColor = tree =>
    StyleSheet.flatten(tree.root.findByType('SafeAreaView').props.style)
      .backgroundColor;

  async function render() {
    const siteManager = createFakeSiteManager();
    let tree;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SingleSiteWebView screenProps={{ siteManager }} />,
      );
    });
    await TestRenderer.act(async () => {
      FakeXHR.instances[0].onerror();
    });
    return tree;
  }

  beforeEach(() => {
    global.XMLHttpRequest = FakeXHR;
    FakeXHR.instances = [];
    AsyncStorage.getItem.mockReset();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockClear();
  });

  it('starts with the app theme background until the site reports its colour', async () => {
    const tree = await render();
    expect(stripColor(tree)).toBe('#FFFFFF');
    expect(() => tree.root.findByType(StatusBar)).toThrow();
  });

  it('injects the header-colour script and listens for its message', async () => {
    const tree = await render();
    const webview = tree.root.findByType(WebView);
    expect(webview.props.injectedJavaScriptBeforeContentLoaded).toContain(
      'nvs-header-color',
    );
    // The site's own footer bar must be hidden too: giving the WebView an
    // onMessage handler makes the site think it is in the official app.
    expect(webview.props.injectedJavaScriptBeforeContentLoaded).toContain(
      'hide-footer-nav',
    );
    expect(typeof webview.props.onMessage).toBe('function');
  });

  it('paints the strip with the colour the site reports, and remembers it', async () => {
    const tree = await render();
    await TestRenderer.act(async () => {
      tree.root
        .findByType(WebView)
        .props.onMessage({ nativeEvent: { data: message('#f7f7f4') } });
    });
    expect(stripColor(tree)).toBe('#f7f7f4');
    expect(tree.root.findByType(StatusBar).props.barStyle).toBe('dark-content');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com'),
      '#f7f7f4',
    );
  });

  it('uses light status-bar icons on a dark header', async () => {
    const tree = await render();
    await TestRenderer.act(async () => {
      tree.root
        .findByType(WebView)
        .props.onMessage({ nativeEvent: { data: message('#1b1913') } });
    });
    expect(tree.root.findByType(StatusBar).props.barStyle).toBe(
      'light-content',
    );
  });

  it('ignores messages that are not a valid header colour', async () => {
    const tree = await render();
    await TestRenderer.act(async () => {
      tree.root
        .findByType(WebView)
        .props.onMessage({ nativeEvent: { data: message('red') } });
      tree.root
        .findByType(WebView)
        .props.onMessage({ nativeEvent: { data: 'hello' } });
    });
    expect(stripColor(tree)).toBe('#FFFFFF');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('starts from the cached colour so there is no white flash at launch', async () => {
    AsyncStorage.getItem.mockResolvedValue('#f7f7f4');
    const tree = await render();
    expect(stripColor(tree)).toBe('#f7f7f4');
  });
});
