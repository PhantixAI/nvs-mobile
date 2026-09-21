/* @flow */
'use strict';

// The site treats any page that can reach window.ReactNativeWebView as running
// inside the official Discourse app, and then draws its own bottom bar (back,
// forward, share, dismiss). react-native-webview only defines that object when
// the WebView has an onMessage handler, which this screen needs to learn the
// header colour. Share and dismiss are messages this app does not handle, and
// the bar is not part of a native look, so it is hidden here.
//
// The site reserves room for the bar through --footer-nav-height (page padding,
// the composer, the topic progress bar, ...), so the variable is zeroed as well
// as the bar hidden, otherwise an empty strip is left behind.
const CSS =
  ':root{--footer-nav-height:0px !important}.footer-nav{display:none !important}';

// Injected before the page loads. The <style> goes on <html> so it exists
// before <head> is parsed and survives the site re-rendering its own markup.
export const HIDE_SITE_FOOTER_NAV_SCRIPT = `
(function () {
  if (window.__nvsHideFooterNav) { return; }
  window.__nvsHideFooterNav = true;
  var style = document.createElement('style');
  style.setAttribute('data-nvs', 'hide-footer-nav');
  style.textContent = ${JSON.stringify(CSS)};
  document.documentElement.appendChild(style);
})();
true;
`;
