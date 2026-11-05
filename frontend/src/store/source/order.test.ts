import { orderSourcesForDisplay } from './order';

const first = Object.freeze({ id: 'first', kind: 'text' as const, rank: 20 });
const second = Object.freeze({ id: 'second', rank: 2 });
const third = Object.freeze({ id: 'third', kind: 'text' as const, rank: 2 });
const author = Object.freeze({
  id: 'author',
  kind: 'author' as const,
  rank: 1,
});

describe('orderSourcesForDisplay', () => {
  it.each([
    [author, first, second, third],
    [first, author, second, third],
    [first, second, third, author],
  ])(
    'puts the author last regardless of its stored position: %j',
    (...sources) => {
      const ordered = orderSourcesForDisplay(sources);

      expect(ordered.map((source, index) => [source.id, index + 1])).toEqual([
        ['first', 1],
        ['second', 2],
        ['third', 3],
        ['author', 4],
      ]);
    },
  );

  it('preserves ordinary order, objects and ranks without mutating the input', () => {
    const sources = Object.freeze([third, author, first, second]);
    const ordered = orderSourcesForDisplay(sources);

    expect(sources).toEqual([third, author, first, second]);
    expect(ordered).toEqual([third, first, second, author]);
    expect(ordered[0]).toBe(third);
    expect(ordered[1]).toBe(first);
    expect(ordered[2]).toBe(second);
    expect(ordered[3]).toBe(author);
    expect(orderSourcesForDisplay(ordered)).toEqual(ordered);
  });

  it('keeps new temporary markers after ordinary markers and before the author', () => {
    const temporary = {
      id: 'temp',
      kind: 'text' as const,
      rank: 0,
      isTemp: true,
    };
    const ordered = orderSourcesForDisplay([first, second, author, temporary]);

    expect(ordered).toEqual([first, second, temporary, author]);
    expect(ordered.indexOf(author) + 1).toBe(ordered.length);
  });

  it('uses the actual total for the author number even beyond 99', () => {
    const ordinary = Array.from({ length: 100 }, (_, index) => ({
      id: `source-${index}`,
      kind: 'text' as const,
      rank: index + 1,
    }));
    const ordered = orderSourcesForDisplay([
      ...ordinary.slice(0, 50),
      author,
      ...ordinary.slice(50),
    ]);

    expect(ordered.slice(0, -1)).toEqual(ordinary);
    expect(ordered.indexOf(author) + 1).toBe(101);
    expect(ordered.indexOf(author) + 1).toBe(ordered.length);
  });

  it('preserves an explicit reorder instead of sorting the stored ranks again', () => {
    expect(orderSourcesForDisplay([second, third, author, first])).toEqual([
      second,
      third,
      first,
      author,
    ]);
  });

  it('handles empty lists, ordinary-only lists and an author-only image', () => {
    expect(orderSourcesForDisplay([])).toEqual([]);
    expect(orderSourcesForDisplay([second, first])).toEqual([second, first]);
    expect(orderSourcesForDisplay([author])).toEqual([author]);
  });
});
