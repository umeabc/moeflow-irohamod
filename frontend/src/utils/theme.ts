export const themePalettes = [
  'default',
  'azure',
  'miku',
  'resort-anthem',
  'sparkle-shower',
  'zinrai',
] as const;
export type ThemePalette = (typeof themePalettes)[number];

export function normalizePalette(value: unknown): ThemePalette {
  return themePalettes.find((palette) => palette === value) ?? 'default';
}

/** 配色与明暗模式独立，不改变图片画布或业务状态色。 */
export function applyTheme(darkMode: boolean, palette: ThemePalette) {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  document.documentElement.dataset.palette = palette;
}
