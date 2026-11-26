import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import storage from 'store';
import siteReducer from '@/store/site/slice';
import { PalettePicker, ThemeSettings } from './ThemePicker';
import { themePalettes } from '@/utils/theme';

jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));

it.each(themePalettes)(
  'synchronizes %s across controls above the independent dark switch',
  (palette) => {
    const store = configureStore({ reducer: { site: siteReducer } });
    const container = document.createElement('div');
    document.body.appendChild(container);
    storage.clearAll();
    try {
      act(() => {
        render(
          <Provider store={store}>
            <PalettePicker compact />
            <ThemeSettings />
          </Provider>,
          container,
        );
      });
      const selects = container.querySelectorAll('select');
      expect(selects).toHaveLength(2);
      expect(Array.from(selects[0].options, (option) => option.value)).toEqual(
        themePalettes,
      );
      act(() => {
        selects[0].value = palette;
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(selects[1].value).toBe(palette);
      expect(store.getState().site.palette).toBe(palette);
      expect(storage.get('palette')).toBe(palette);
      expect(document.documentElement.dataset).toMatchObject({
        palette,
        theme: 'light',
      });

      const darkSwitch =
        container.querySelector<HTMLButtonElement>('[role="switch"]');
      if (!darkSwitch) throw new Error('Dark mode switch is missing');
      expect(
        selects[1].compareDocumentPosition(darkSwitch) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      act(() => darkSwitch.click());
      expect(store.getState().site.darkMode).toBe(true);
      expect(storage.get('darkMode')).toBe(true);
      expect(document.documentElement.dataset).toMatchObject({
        palette,
        theme: 'dark',
      });

      const nextPalette = palette === 'zinrai' ? 'resort-anthem' : 'zinrai';
      act(() => {
        selects[1].value = nextPalette;
        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(selects[0].value).toBe(nextPalette);
      expect(store.getState().site.darkMode).toBe(true);
      expect(document.documentElement.dataset).toMatchObject({
        palette: nextPalette,
        theme: 'dark',
      });
    } finally {
      act(() => {
        unmountComponentAtNode(container);
      });
      container.remove();
      storage.clearAll();
      document.documentElement.removeAttribute('data-palette');
      document.documentElement.removeAttribute('data-theme');
    }
  },
);
