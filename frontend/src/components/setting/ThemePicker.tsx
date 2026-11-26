import { css } from '@emotion/core';
import { Switch } from 'antd';
import { useIntl } from 'react-intl';
import { useTheme } from '@/hooks/useTheme';
import { normalizePalette, themePalettes } from '@/utils/theme';

export const compactThemePickerWidth = 244;

export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const { formatMessage } = useIntl();
  const { palette, changePalette } = useTheme();

  return (
    <label
      className="PalettePicker"
      css={css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 40px;
        width: ${compact ? `${compactThemePickerWidth}px` : '100%'};
        margin: 0 auto;
        > span {
          flex-shrink: 0;
        }
        select {
          flex: 0 1 168px;
          width: 168px;
          min-width: 0;
          min-height: 32px;
          padding: 4px 8px;
          border: 1px solid var(--moeflow-borderColorBase);
          border-radius: 4px;
          background: var(--moeflow-surface);
          color: var(--moeflow-textColor);
          font: inherit;
          cursor: pointer;
        }
        select:focus-visible {
          outline: 2px solid
            var(--moeflow-primaryFocusColor, var(--moeflow-primaryColor));
          outline-offset: 2px;
        }
      `}
    >
      <span>{formatMessage({ id: 'site.palette' })}</span>
      <select
        value={palette}
        onChange={(event) =>
          changePalette(normalizePalette(event.target.value))
        }
      >
        {themePalettes.map((value) => (
          <option key={value} value={value}>
            {formatMessage({ id: `site.palette.${value}` })}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ThemeSettings() {
  const { formatMessage } = useIntl();
  const { darkMode, changeDarkMode } = useTheme();

  return (
    <div>
      <PalettePicker />
      <div
        css={css`
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 40px;
          gap: 12px;
        `}
      >
        <span>{formatMessage({ id: 'site.darkMode' })}</span>
        <Switch
          aria-label={formatMessage({ id: 'site.darkMode' })}
          checked={darkMode}
          onChange={changeDarkMode}
        />
      </div>
    </div>
  );
}
