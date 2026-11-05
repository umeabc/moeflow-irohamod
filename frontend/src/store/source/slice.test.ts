import type { Source } from '@/interfaces/source';
import reducer, {
  createSource,
  deleteSource,
  editSource,
  rerankSource,
  setSources,
} from './slice';

const makeSource = (id: string, overrides: Partial<Source> = {}): Source => ({
  id,
  x: 0,
  y: 0,
  rank: 1,
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
  ...overrides,
});
const first = makeSource('first', { rank: 2 });
const second = makeSource('second', { rank: 3 });
const third = makeSource('third', { rank: 4 });
const author = makeSource('author', { kind: 'author' });
const loadedState = () =>
  reducer(undefined, setSources([first, author, second]));
const sourceIDs = (state: ReturnType<typeof reducer>) =>
  state.sources.map((source) => source.id);

describe('source display ordering', () => {
  it('normalizes a loaded image and clears the list when switching images', () => {
    const state = loadedState();

    expect(sourceIDs(state)).toEqual(['first', 'second', 'author']);
    expect(state.sources.map((source) => source.rank)).toEqual([2, 3, 1]);
    expect(reducer(state, setSources([])).sources).toEqual([]);
  });

  it('inserts temporary markers before the author and keeps their position on save', () => {
    const temporary = makeSource('temporary', {
      rank: 0,
      isTemp: true,
      labelStatus: 'creating',
    });
    const creatingState = reducer(loadedState(), createSource(temporary));
    expect(sourceIDs(creatingState)).toEqual([
      'first',
      'second',
      'temporary',
      'author',
    ]);

    const savedState = reducer(
      creatingState,
      editSource({
        id: 'temporary',
        newID: 'saved',
        kind: 'text',
        rank: 4,
        isTemp: false,
        labelStatus: 'pending',
      }),
    );
    expect(sourceIDs(savedState)).toEqual([
      'first',
      'second',
      'saved',
      'author',
    ]);
    expect(savedState.sources[2]).toMatchObject({ rank: 4, isTemp: false });
  });

  it('also inserts a real marker before the author', () => {
    expect(sourceIDs(reducer(loadedState(), createSource(third)))).toEqual([
      'first',
      'second',
      'third',
      'author',
    ]);
  });

  it('normalizes an author kind returned in an update', () => {
    const state = reducer(undefined, setSources([first, second, third]));
    expect(
      sourceIDs(reducer(state, editSource({ id: 'first', kind: 'author' }))),
    ).toEqual(['second', 'third', 'first']);
  });

  it('moves an ordinary marker to the end of ordinary markers', () => {
    const state = reducer(
      loadedState(),
      rerankSource({ id: 'first', next_source_id: 'end' }),
    );
    expect(sourceIDs(state)).toEqual(['second', 'first', 'author']);
    expect(state.sources.map((source) => source.rank)).toEqual([3, 2, 1]);
  });

  it('moves before another ordinary marker while leaving the author last', () => {
    const state = reducer(
      loadedState(),
      rerankSource({ id: 'second', next_source_id: 'first' }),
    );
    expect(sourceIDs(state)).toEqual(['second', 'first', 'author']);
  });

  it.each([
    { id: 'author', next_source_id: 'first' },
    { id: 'first', next_source_id: 'first' },
    { id: 'missing', next_source_id: 'end' },
    { id: 'first', next_source_id: 'missing' },
  ])('ignores an invalid or read-only reorder: %j', (payload) => {
    const state = loadedState();
    expect(reducer(state, rerankSource(payload))).toBe(state);
  });

  it('updates the author display number naturally after deletion', () => {
    const state = reducer(loadedState(), deleteSource({ id: 'first' }));
    expect(
      state.sources.map((source, index) => [source.id, index + 1]),
    ).toEqual([
      ['second', 1],
      ['author', 2],
    ]);
  });
});
