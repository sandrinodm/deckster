import { describe, expect, it } from 'vite-plus/test';

import { hyphenPoints, widestWord, wordBreaks, wordPieces } from '#diagrams/word-breaks.ts';

describe('wordBreaks', () => {
  it('breaks at camelCase boundaries and after separators', () => {
    expect(wordPieces('OrderCancelledAfterShipmentEvent')).toEqual([
      'Order',
      'Cancelled',
      'After',
      'Shipment',
      'Event',
    ]);
    expect(wordPieces('order-fulfilment-events-v2')).toEqual([
      'order-',
      'fulfilment-',
      'events-v2',
    ]);
    expect(wordPieces('api.orders/v1_internal')).toEqual(['api.', 'orders/', 'v1_', 'internal']);
  });

  it('never leaves fewer than three characters on either side', () => {
    expect(wordBreaks('iPhone')).toEqual([]);
    expect(wordPieces('events-v2')).toEqual(['events-v2']);
    expect(wordBreaks('Internationalization')).toEqual([]);
  });
});

describe('widestWord', () => {
  it('measures whole words only', () => {
    expect(widestWord('Customer identity and access', (text) => text.length)).toBe(8);
  });
});

describe('hyphenPoints', () => {
  it('offers syllable breaks in a long word with no other break point', () => {
    const points = hyphenPoints('Übersetzungsdatenbank');
    expect(points.length).toBeGreaterThan(2);
    expect(points.every((point) => point >= 3 && point <= 'Übersetzungsdatenbank'.length - 3)).toBe(
      true,
    );
    expect(points.slice(1).every((point, index) => point - (points[index] ?? 0) >= 3)).toBe(true);
  });

  it('leaves short words and words with camelCase boundaries alone', () => {
    expect(hyphenPoints('Database')).toEqual([]);
    expect(hyphenPoints('OrderCancelledEvent')).toEqual([]);
  });
});
