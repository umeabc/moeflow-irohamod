import fs from 'node:fs';
import path from 'node:path';
import storage from 'store';
import { paletteStorage, themeStorage } from './storage';
import { applyTheme, normalizePalette, themePalettes } from './theme';

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!bootstrap) throw new Error('Theme bootstrap script is missing');

beforeEach(() => {
  storage.clearAll();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
});

describe('theme preferences', () => {
  it('keeps an existing dark preference with the original pink palette', () => {
    storage.set('darkMode', true);
    expect(themeStorage.load()).toBe(true);
    expect(paletteStorage.load()).toBe('default');
  });

  it.each(themePalettes)(
    'persists the %s palette without changing dark mode',
    (palette) => {
      themeStorage.save(true);
      paletteStorage.save(palette);
      expect(paletteStorage.load()).toBe(palette);
      expect(themeStorage.load()).toBe(true);
    },
  );

  it.each([null, undefined, '', 'invalid', false, 2, {}])(
    'falls back for invalid palette %p',
    (value) => {
      expect(normalizePalette(value)).toBe('default');
      storage.set('palette', value);
      expect(paletteStorage.load()).toBe('default');
    },
  );

  it.each(themePalettes)(
    'applies both modes of %s before application mount',
    (palette) => {
      for (const darkMode of [false, true]) {
        themeStorage.save(darkMode);
        paletteStorage.save(palette);
        // Execute the actual pre-paint HTML script, not a duplicate implementation.
        window.eval(bootstrap);
        expect(document.documentElement.dataset).toMatchObject({
          theme: darkMode ? 'dark' : 'light',
          palette,
        });
        applyTheme(darkMode, palette);
        expect(document.documentElement.dataset).toMatchObject({
          theme: darkMode ? 'dark' : 'light',
          palette,
        });
      }
    },
  );

  it('ignores malformed stored values in the pre-paint script', () => {
    localStorage.setItem('darkMode', 'not-json');
    localStorage.setItem('palette', 'not-json');
    window.eval(bootstrap);
    expect(document.documentElement.dataset).toMatchObject({
      theme: 'light',
      palette: 'default',
    });
  });
});
