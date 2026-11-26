import { css } from '@emotion/core';
import { Popover } from 'antd';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { availableLocales, setLocale, SupportedLocale } from '@/locales';
import { ThemeSettings } from './ThemePicker';

/** 登录前即可调整外观和语言；复用用户菜单的同一套偏好。 */
export function LoginQuickSettings() {
  const { formatMessage, locale } = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="LoginQuickSettings"
      css={css`
        position: absolute;
        z-index: 20;
        top: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--moeflow-textColor);
        button,
        label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 36px;
          padding: 6px 10px;
          border: 1px solid var(--moeflow-borderColorBase);
          border-radius: 6px;
          background: var(--moeflow-surface);
          color: inherit;
          font: inherit;
        }
        button,
        select {
          cursor: pointer;
        }
        button:focus-visible,
        select:focus-visible {
          outline: 2px solid var(--moeflow-primaryColor);
          outline-offset: 2px;
        }
        select {
          max-width: 115px;
          border: 0;
          background: var(--moeflow-surface);
          color: inherit;
          font: inherit;
        }
        @media (max-width: 600px) {
          top: 12px;
          right: 12px;
        }
      `}
    >
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomRight"
        content={
          <div
            style={{ width: 260, maxWidth: 'calc(100vw - 64px)' }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          >
            <ThemeSettings />
          </div>
        }
      >
        <button type="button" aria-expanded={open}>
          {formatMessage({ id: 'site.theme' })}
        </button>
      </Popover>
      <label>
        <span>{formatMessage({ id: 'site.language' })}</span>
        <select
          value={/^zh/i.test(locale) ? 'zh-CN' : 'en'}
          onChange={(event) => setLocale(event.target.value as SupportedLocale)}
        >
          {Object.entries(availableLocales).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
