/* @flow */
'use strict';

import React from 'react';
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

jest.mock('react-native-custom-tabs', () => ({
  CustomTabs: { openURL: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  return {
    SafeAreaView: ({ children }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

const { WebView } = require('react-native-webview');
const SingleSiteWebView = require('../SingleSiteWebView').default;

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
