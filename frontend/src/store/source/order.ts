import type { Source } from '@/interfaces/source';

/** Keep display numbers (array index + 1) consistent without changing rank. */
export const orderSourcesForDisplay = <T extends Pick<Source, 'id' | 'kind'>>(
  sources: readonly T[],
): T[] => {
  const textSources: T[] = [];
  const authorSources: T[] = [];
  for (const source of sources) {
    (source.kind === 'author' ? authorSources : textSources).push(source);
  }
  return [...textSources, ...authorSources];
};
