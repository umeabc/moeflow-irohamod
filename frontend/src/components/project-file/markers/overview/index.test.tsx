import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { Source } from '@/interfaces/source';
import reducer, { rerankSourceSaga, setSources } from '@/store/source/slice';
import { ImageSourceViewerGod } from './index';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => undefined,
}));
jest.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
}));
jest.mock('@/components', () => ({
  Icon: () => null,
  Button: ({ icon, onClick }: { icon: string; onClick: () => void }) => (
    <button type="button" data-icon={icon} onClick={onClick} />
  ),
}));
jest.mock('./TranslationList', () => ({
  TranslationList: () => <div className="translation-editor" />,
}));

const first: Source = {
  id: 'first',
  x: 0,
  y: 0,
  rank: 2,
  content: '',
  positionType: 1,
  translations: [],
  hasOtherLanguageTranslation: false,
  tips: [],
  isTemp: false,
  focus: false,
  selecting: false,
  labelStatus: 'pending',
  proodreadContentStatuses: {},
};
const second: Source = { ...first, id: 'second', rank: 3 };
const third: Source = { ...first, id: 'third', rank: 4 };
const author: Source = {
  ...first,
  id: 'author',
  kind: 'author',
  rank: 1,
  content: 'Original creator',
};

describe('overview source ordering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    mockDispatch.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      unmountComponentAtNode(container);
    });
    container.remove();
  });

  const showSources = (sources: Source[]) => {
    const state = reducer(undefined, setSources(sources));
    act(() => {
      render(
        <ImageSourceViewerGod sources={state.sources} targetID="target" />,
        container,
      );
    });
    return container.querySelectorAll('.ImageSourceViewerGod__Source');
  };

  it('moves the penultimate ordinary marker to end, without using the author rank as an anchor', () => {
    const rows = showSources([first, author, second]);
    const down = rows[0].querySelector<HTMLButtonElement>(
      '[data-icon="chevron-down"]',
    );
    expect(down).not.toBeNull();
    act(() => {
      down?.click();
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      rerankSourceSaga({ id: 'first', next_source_id: 'end' }),
    );
    expect(rows[1].querySelector('[data-icon="chevron-down"]')).toBeNull();
    expect(rows[1].querySelector('[data-icon="chevron-up"]')).not.toBeNull();
  });

  it('still uses the following ordinary marker as the anchor for a middle move', () => {
    const rows = showSources([author, first, second, third]);
    act(() => {
      rows[0]
        .querySelector<HTMLButtonElement>('[data-icon="chevron-down"]')
        ?.click();
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      rerankSourceSaga({ id: 'first', next_source_id: 'third' }),
    );
  });

  it('numbers the author by the current total and keeps its row read-only', () => {
    const rows = showSources([first, author, second]);

    expect(
      Array.from(
        container.querySelectorAll('.Source__Index'),
        (el) => el.textContent,
      ),
    ).toEqual(['1', '2', '3']);
    expect(rows[2]).toHaveClass('Source--author');
    expect(rows[2]).toHaveTextContent('Original creator');
    expect(rows[2].querySelector('button')).toBeNull();
    expect(rows[2].querySelector('.translation-editor')).toBeNull();
    expect(rows[2].querySelector('.Source__ContentBottom')).toBeNull();
  });
});
