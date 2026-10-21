import {
  parseUrlLines,
  isValidHttpUrl,
  extractErrorMessage,
  calcBatchSummary,
  BATCH_MAX_LINES,
  BatchLineItem,
} from './importFromURLHelpers';

describe('importFromURLHelpers', () => {
  describe('isValidHttpUrl', () => {
    it('accepts http and https URLs with hostname', () => {
      expect(isValidHttpUrl('https://x.com/status/123')).toBe(true);
      expect(isValidHttpUrl('http://cdn.donmai.us/sample/x.jpg')).toBe(true);
    });

    it('rejects non-http protocols', () => {
      expect(isValidHttpUrl('ftp://example.com/file')).toBe(false);
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects malformed strings', () => {
      expect(isValidHttpUrl('not a url')).toBe(false);
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl('http://')).toBe(false);
    });
  });

  describe('parseUrlLines', () => {
    it('returns empty-lines error for blank input', () => {
      const result = parseUrlLines('');
      expect(result.lines).toEqual([]);
      expect(result.error).toBe('file.importUrlRequired');
    });

    it('returns empty-lines error for only whitespace', () => {
      const result = parseUrlLines('   \n  \n');
      expect(result.lines).toEqual([]);
      expect(result.error).toBe('file.importUrlRequired');
    });

    it('trims and keeps physical line numbers', () => {
      const result = parseUrlLines(
        'https://x.com/a\n  https://x.com/b  \nhttps://x.com/c',
      );
      expect(result.lines).toHaveLength(3);
      expect(result.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
      expect(result.lines.map((l) => l.url)).toEqual([
        'https://x.com/a',
        'https://x.com/b',
        'https://x.com/c',
      ]);
    });

    it('skips blank lines but preserves physical numbering', () => {
      const result = parseUrlLines(
        '\nhttps://x.com/a\n\nhttps://x.com/b\n',
      );
      expect(result.lines).toHaveLength(2);
      expect(result.lines.map((l) => l.lineNo)).toEqual([2, 4]);
    });

    it('rejects when exceeding max lines', () => {
      const many = Array.from(
        { length: BATCH_MAX_LINES + 1 },
        (_, i) => `https://x.com/${i}`,
      ).join('\n');
      const result = parseUrlLines(many);
      expect(result.error).toBe('file.importBatchTooMany');
      expect(result.errorParams).toEqual({
        max: BATCH_MAX_LINES,
        count: BATCH_MAX_LINES + 1,
      });
    });

    it('accepts exactly max lines', () => {
      const many = Array.from(
        { length: BATCH_MAX_LINES },
        (_, i) => `https://x.com/${i}`,
      ).join('\n');
      const result = parseUrlLines(many);
      expect(result.error).toBeUndefined();
      expect(result.lines).toHaveLength(BATCH_MAX_LINES);
    });

    it('marks invalid URL lines as failed', () => {
      const result = parseUrlLines(
        'https://x.com/a\nnot a url\nftp://bad.com',
      );
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].status).toBe('pending');
      expect(result.lines[1].status).toBe('failed');
      expect(result.lines[1].error).toBe('file.importBatchInvalidUrl');
      expect(result.lines[2].status).toBe('failed');
    });
  });

  describe('extractErrorMessage', () => {
    it('extracts string message', () => {
      const e = { data: { message: '获取失败：网络错误' } };
      expect(extractErrorMessage(e)).toBe('获取失败：网络错误');
    });

    it('flattens field-error map', () => {
      const e = { data: { message: { url: ['invalid'], name: 'too long' } } };
      expect(extractErrorMessage(e)).toBe('url: invalid; name: too long');
    });

    it('returns fallback when no message', () => {
      const e = { data: {} };
      expect(extractErrorMessage(e)).toBe('file.importBatchUnknownError');
    });

    it('returns fallback for non-object', () => {
      expect(extractErrorMessage(null)).toBe('file.importBatchUnknownError');
      expect(extractErrorMessage('string')).toBe('file.importBatchUnknownError');
    });
  });

  describe('calcBatchSummary', () => {
    it('sums imported/duplicated/failed counts', () => {
      const lines: BatchLineItem[] = [
        { lineNo: 1, url: 'a', status: 'completed', imported: 3, duplicated: 1 },
        { lineNo: 2, url: 'b', status: 'completed', imported: 0, duplicated: 2 },
        { lineNo: 3, url: 'c', status: 'failed', imported: 0, duplicated: 0, error: 'x' },
        { lineNo: 4, url: 'd', status: 'completed', imported: 1, duplicated: 0 },
      ];
      const summary = calcBatchSummary(lines);
      expect(summary).toEqual({ imported: 4, duplicated: 3, failed: 1 });
    });

    it('handles all-failed', () => {
      const lines: BatchLineItem[] = [
        { lineNo: 1, url: 'a', status: 'failed', imported: 0, duplicated: 0 },
        { lineNo: 2, url: 'b', status: 'failed', imported: 0, duplicated: 0 },
      ];
      expect(calcBatchSummary(lines)).toEqual({
        imported: 0,
        duplicated: 0,
        failed: 2,
      });
    });

    it('handles empty list', () => {
      expect(calcBatchSummary([])).toEqual({
        imported: 0,
        duplicated: 0,
        failed: 0,
      });
    });
  });
});
