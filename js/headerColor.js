/* @flow */
'use strict';

import chroma from 'chroma-js';

// The strip above the site's own header (status bar / notch) is drawn by the
// app, not the page, so it can only match the site if the page tells the app
// what colour its header is. This script runs inside the WebView, reads the
// header's real background colour and posts it back; parseHeaderColorMessage
// validates what arrives.

export const HEADER_COLOR_MESSAGE = 'nvs-header-color';

// Injected before the page loads. It waits for the DOM itself, re-reads a few
// times while theme CSS settles, and again when the OS light/dark setting flips
// (the site switches palette with it). A canvas converts whatever CSS colour
// syntax the browser returns (rgb(), color(srgb ...), ...) to plain RGBA.
export const HEADER_COLOR_SCRIPT = `
(function () {
  if (window.__nvsHeaderColor) { return; }
  window.__nvsHeaderColor = true;
  var last = null;

  function toRgba(css) {
    var ctx = document.createElement('canvas').getContext('2d');
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  }

  function hex(n) {
    return ('0' + n.toString(16)).slice(-2);
  }

  function read() {
    var els = [
      document.querySelector('.d-header'),
      document.querySelector('.d-header-wrap'),
      document.body,
      document.documentElement
    ];
    for (var i = 0; i < els.length; i++) {
      if (!els[i]) { continue; }
      var d = toRgba(getComputedStyle(els[i]).backgroundColor);
      if (d[3] === 255) { return '#' + hex(d[0]) + hex(d[1]) + hex(d[2]); }
    }
    return null;
  }

  function post() {
    try {
      var color = read();
      if (color && color !== last && window.ReactNativeWebView) {
        last = color;
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: '${HEADER_COLOR_MESSAGE}', color: color })
        );
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', post);
  window.addEventListener('load', post);
  [500, 1500, 3500].forEach(function (ms) { setTimeout(post, ms); });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) { mq.addEventListener('change', post); }
  }
})();
true;
`;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// A lowercase #rrggbb string, or null if the value is not exactly that.
export function normalizeHexColor(value: mixed): ?string {
  return typeof value === 'string' && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : null;
}

// Returns the colour from the message the script above sends, or null for
// anything else. Messages come from a web page, so nothing else is trusted.
export function parseHeaderColorMessage(data: mixed): ?string {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const message = JSON.parse(data);
    if (message && message.type === HEADER_COLOR_MESSAGE) {
      return normalizeHexColor(message.color);
    }
  } catch {
    // Not JSON: some other message, ignore.
  }
  return null;
}

// Status-bar icons must contrast with the colour behind them.
export function statusBarStyleFor(
  color: string,
): 'light-content' | 'dark-content' {
  return chroma(color).luminance() < 0.5 ? 'light-content' : 'dark-content';
}
