import fs from 'node:fs';
import path from 'node:path';
import en from '@/locales/en.json';
import zh from '@/locales/zh-cn.json';
import { themePalettes } from './theme';

const css = fs.readFileSync(path.join(__dirname, '../palettes.css'), 'utf8');
const newPalettes = ['resort-anthem', 'sparkle-shower', 'zinrai'] as const;
const modes = ['light', 'dark'] as const;
const combinations = newPalettes.flatMap((palette) =>
  modes.map((mode) => [palette, mode] as const),
);

function tokensFor(palette: string, mode: string): Record<string, string> {
  const selector = `html[data-theme='${mode}'][data-palette='${palette}']`;
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing palette: ${selector}`);
  const declarations = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    Array.from(
      declarations.matchAll(/--moeflow-([\w-]+):\s*([^;]+);/g),
      (match) => [match[1], match[2].trim()],
    ),
  );
}

function rgb(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex))
    throw new Error(`Expected solid sRGB hex, got ${hex}`);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex: string) {
  return rgb(hex)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort(
    (left, right) => left - right,
  );
  return (high + 0.05) / (low + 0.05);
}

describe('IIDX theme tokens', () => {
  it.each(combinations)(
    '%s / %s defines a complete palette and legible independent action colors',
    (palette, mode) => {
      const tokens = tokensFor(palette, mode);
      for (const name of [
        'Canvas',
        'Surface',
        'Elevated',
        'Hover',
        'Glass',
        'Text',
        'TextRgb',
        'Secondary',
        'Muted',
        'BorderSubtle',
        'BorderInk',
        'BorderStrong',
        'Accent',
        'AccentDeep',
        'AccentSoft',
        'AccentBorder',
        'Action',
        'ActionHover',
        'ActionContrast',
        'ActionRgb',
        'Focus',
        'FocusRgb',
      ])
        expect(tokens[`palette${name}`]).toBeTruthy();

      for (const surface of ['Canvas', 'Surface', 'Elevated']) {
        expect(
          contrast(tokens.paletteText, tokens[`palette${surface}`]),
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const foreground of ['Secondary', 'Muted', 'Accent', 'AccentDeep']) {
        expect(
          contrast(tokens[`palette${foreground}`], tokens.paletteSurface),
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const action of ['Action', 'ActionHover']) {
        expect(
          contrast(tokens.paletteActionContrast, tokens[`palette${action}`]),
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(tokens.paletteAccent, tokens.paletteAccentSoft),
      ).toBeGreaterThanOrEqual(4.5);
      // Radio/checkbox/switch still use the text accent, not the separate CTA fill.
      expect(
        contrast(tokens.primaryContrast, tokens.paletteAccent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(tokens.paletteFocus, tokens.paletteSurface),
      ).toBeGreaterThanOrEqual(3);
      expect(tokens.primaryRgb).toBe(rgb(tokens.paletteAccent).join(', '));
      expect(tokens.paletteActionRgb).toBe(
        rgb(tokens.paletteAction).join(', '),
      );
    },
  );

  it('keeps the guide signature colors rather than reducing every theme to a monochrome tint', () => {
    expect(tokensFor('resort-anthem', 'light').paletteAction).toBe('#ff8d04');
    expect(tokensFor('resort-anthem', 'dark').paletteFocus).toBe('#00ffff');
    expect(tokensFor('sparkle-shower', 'light').paletteLoginBg).toContain(
      '#bffe40',
    );
    expect(tokensFor('sparkle-shower', 'dark').paletteAccent).toBe('#bffe40');
    expect(tokensFor('sparkle-shower', 'light').paletteAction).toBe('#ff9000');
    expect(tokensFor('zinrai', 'dark').paletteCanvas).toBe('#080014');
    expect(tokensFor('zinrai', 'dark').paletteFocus).toBe('#00dae2');
    expect(tokensFor('zinrai', 'light').paletteAction).toBe('#fe40dd');
  });

  it('applies shared component overrides to every custom theme without touching the default', () => {
    expect(css).toContain(
      "html[data-theme][data-palette]:where(:not([data-palette='default']))",
    );
    expect(css).not.toContain(
      ":is([data-palette='azure'], [data-palette='miku'])",
    );
    for (const variable of [
      'successColor',
      'warningColor',
      'errorColor',
      'translatorColorBackground',
    ]) {
      expect(css).not.toContain(`--moeflow-${variable}:`);
    }
  });
});

it.each(themePalettes)(
  'has a label for %s in both supported languages',
  (palette) => {
    const key = `site.palette.${palette}` as keyof typeof en;
    expect(en[key]).toBeTruthy();
    expect(zh[key]).toBeTruthy();
  },
);
