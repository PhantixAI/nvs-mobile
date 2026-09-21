/* @flow */
'use strict';

import { HIDE_SITE_FOOTER_NAV_SCRIPT } from '../hideSiteFooterNav';

describe('HIDE_SITE_FOOTER_NAV_SCRIPT', () => {
  function run() {
    const appended = [];
    const style = {
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
    };
    const window = {};
    const document = {
      createElement: () => style,
      documentElement: { appendChild: el => appended.push(el) },
    };
    new Function('window', 'document', HIDE_SITE_FOOTER_NAV_SCRIPT)(
      window,
      document,
    );
    return { appended, style, window };
  }

  it('is valid JavaScript', () => {
    expect(() => new Function(HIDE_SITE_FOOTER_NAV_SCRIPT)).not.toThrow();
  });

  it('adds one style that hides the footer bar and zeroes the room reserved for it', () => {
    const { appended, style } = run();
    expect(appended).toEqual([style]);
    expect(style.attrs['data-nvs']).toBe('hide-footer-nav');
    expect(style.textContent).toContain('.footer-nav{display:none !important}');
    expect(style.textContent).toContain('--footer-nav-height:0px !important');
  });

  it('does nothing the second time it runs on the same page', () => {
    const document = {
      createElement: jest.fn(() => ({ setAttribute() {} })),
      documentElement: { appendChild: jest.fn() },
    };
    const window = {};
    const script = new Function(
      'window',
      'document',
      HIDE_SITE_FOOTER_NAV_SCRIPT,
    );
    script(window, document);
    script(window, document);
    expect(document.documentElement.appendChild).toHaveBeenCalledTimes(1);
  });
});
