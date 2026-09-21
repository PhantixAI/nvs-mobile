/* @flow */
'use strict';

import {
  HEADER_COLOR_MESSAGE,
  HEADER_COLOR_SCRIPT,
  normalizeHexColor,
  parseHeaderColorMessage,
  statusBarStyleFor,
} from '../headerColor';

const message = color => JSON.stringify({ type: HEADER_COLOR_MESSAGE, color });

describe('normalizeHexColor', () => {
  it('accepts #rrggbb and lowercases it', () => {
    expect(normalizeHexColor('#F7F7F4')).toBe('#f7f7f4');
  });

  it('rejects everything else', () => {
    ['#fff', 'red', '#12345g', 'f7f7f4', '', null, undefined, 42].forEach(
      value => expect(normalizeHexColor(value)).toBeNull(),
    );
  });
});

describe('parseHeaderColorMessage', () => {
  it('returns the colour from a well-formed message', () => {
    expect(parseHeaderColorMessage(message('#f7f7f4'))).toBe('#f7f7f4');
  });

  it('ignores messages of another type', () => {
    expect(
      parseHeaderColorMessage(
        JSON.stringify({ type: 'something-else', color: '#f7f7f4' }),
      ),
    ).toBeNull();
  });

  it('ignores a colour that is not #rrggbb, so a page cannot inject a style', () => {
    expect(parseHeaderColorMessage(message('red'))).toBeNull();
    expect(parseHeaderColorMessage(message('#f7f7f4; x'))).toBeNull();
    expect(parseHeaderColorMessage(message(null))).toBeNull();
  });

  it('ignores non-JSON and non-string data', () => {
    expect(parseHeaderColorMessage('not json')).toBeNull();
    expect(parseHeaderColorMessage(undefined)).toBeNull();
    expect(parseHeaderColorMessage({ color: '#f7f7f4' })).toBeNull();
  });
});

describe('statusBarStyleFor', () => {
  it('uses dark icons on a light colour and light icons on a dark one', () => {
    expect(statusBarStyleFor('#f7f7f4')).toBe('dark-content');
    expect(statusBarStyleFor('#ffffff')).toBe('dark-content');
    expect(statusBarStyleFor('#111111')).toBe('light-content');
    expect(statusBarStyleFor('#1b1913')).toBe('light-content');
  });
});

describe('HEADER_COLOR_SCRIPT', () => {
  // A minimal fake page: getComputedStyle returns a fixed CSS colour per
  // element, and the canvas "parses" rgb(r, g, b) / rgba(...) like a browser.
  function runScript({ header, body }) {
    const posted = [];
    const timers = [];
    const listeners = {};
    const canvas = () => ({
      getContext: () => {
        let value = 'rgba(0, 0, 0, 0)';
        let pixel = [0, 0, 0, 0];
        return {
          clearRect() {},
          fillRect() {},
          set fillStyle(css) {
            const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
            if (m) {
              value = css;
              pixel = [
                +m[1],
                +m[2],
                +m[3],
                m[4] === undefined ? 255 : Math.round(+m[4] * 255),
              ];
            }
          },
          get fillStyle() {
            return value;
          },
          getImageData: () => ({ data: pixel }),
        };
      },
    });
    const els = { '.d-header': header ? { css: header } : null };
    const bodyEl = { css: body };
    const document = {
      querySelector: sel => els[sel] || null,
      createElement: () => canvas(),
      addEventListener: (name, fn) => (listeners[name] = fn),
      body: bodyEl,
      documentElement: { css: 'rgba(0, 0, 0, 0)' },
    };
    const window = {
      ReactNativeWebView: { postMessage: data => posted.push(data) },
      addEventListener: (name, fn) => (listeners['w' + name] = fn),
      matchMedia: () => ({ addEventListener: (n, fn) => (listeners.mq = fn) }),
    };
    const getComputedStyle = el => ({ backgroundColor: el.css });
    const setTimeout = (fn, ms) => timers.push({ fn, ms });
    new Function(
      'window',
      'document',
      'getComputedStyle',
      'setTimeout',
      HEADER_COLOR_SCRIPT,
    )(window, document, getComputedStyle, setTimeout);
    return { posted, timers, listeners };
  }

  it('is valid JavaScript', () => {
    expect(() => new Function(HEADER_COLOR_SCRIPT)).not.toThrow();
  });

  it('posts the header background as #rrggbb once the page loads', () => {
    const { posted, listeners } = runScript({
      header: 'rgb(247, 247, 244)',
      body: 'rgb(255, 255, 255)',
    });
    listeners.DOMContentLoaded();
    expect(posted).toHaveLength(1);
    expect(parseHeaderColorMessage(posted[0])).toBe('#f7f7f4');
  });

  it('falls back to the body when the header is transparent', () => {
    const { posted, listeners } = runScript({
      header: 'rgba(0, 0, 0, 0)',
      body: 'rgb(26, 26, 26)',
    });
    listeners.wload();
    expect(parseHeaderColorMessage(posted[0])).toBe('#1a1a1a');
  });

  it('posts again only when the colour changes', () => {
    const { posted, listeners, timers } = runScript({
      header: 'rgb(247, 247, 244)',
      body: 'rgb(255, 255, 255)',
    });
    listeners.DOMContentLoaded();
    timers.forEach(t => t.fn());
    listeners.mq();
    expect(posted).toHaveLength(1);
  });

  it('re-reads on a delay while theme CSS settles', () => {
    const { timers } = runScript({
      header: 'rgb(1, 2, 3)',
      body: 'rgb(0, 0, 0)',
    });
    expect(timers.map(t => t.ms)).toEqual([500, 1500, 3500]);
  });
});
