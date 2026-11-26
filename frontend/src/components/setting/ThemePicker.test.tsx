import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import storage from 'store';
import siteReducer from '@/store/site/slice';
import { PalettePicker, ThemeSettings } from './ThemePicker';

jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));

it('synchronizes palette controls and keeps palette selection above the independent dark switch', () => {
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
    act(() => {
      selects[0].value = 'azure';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(selects[1].value).toBe('azure');
    expect(store.getState().site.palette).toBe('azure');
    expect(storage.get('palette')).toBe('azure');
    expect(document.documentElement.dataset).toMatchObject({
      palette: 'azure',
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
      palette: 'azure',
      theme: 'dark',
    });

    act(() => {
      selects[1].value = 'miku';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(selects[0].value).toBe('miku');
    expect(store.getState().site.darkMode).toBe(true);
    expect(document.documentElement.dataset).toMatchObject({
      palette: 'miku',
      theme: 'dark',
    });
  } finally {
    act(() => {
      unmountComponentAtNode(container);
    });
    container.remove();
    storage.clearAll();
  }
});
