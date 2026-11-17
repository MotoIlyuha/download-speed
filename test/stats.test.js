import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, formatSpeed, formatBytes, formatMs } from '../src/stats.js';

test('скорость = все байты / всё время, а не среднее скоростей', () => {
  const results = [
    // 10 МБ за 1 с = 10 МБ/с
    { ok: true, status: 200, bytes: 10_000_000, timeMs: 1000, ttfbMs: 100 },
    // 10 МБ за 9 с ≈ 1.11 МБ/с
    { ok: true, status: 200, bytes: 10_000_000, timeMs: 9000, ttfbMs: 300 },
    // ошибка в расчёт не входит
    { ok: false, status: 500, error: 'HTTP 500' },
  ];

  const s = summarize(results);

  assert.equal(s.total, 3);
  assert.equal(s.succeeded, 2);
  assert.equal(s.totalBytes, 20_000_000);
  assert.equal(s.avgTimeMs, 5000);
  assert.equal(s.minTimeMs, 1000);
  assert.equal(s.maxTimeMs, 9000);
  assert.equal(s.avgTtfbMs, 200);
  // 20 МБ / 10 с = 2 МБ/с. Среднее скоростей дало бы (10 + 1.11) / 2 ≈ 5.56 МБ/с.
  assert.equal(s.bytesPerSecond, 2_000_000);
  assert.equal(formatSpeed(s.bytesPerSecond), '16.00 Мбит/с (2.00 МБ/с)');
});

test('если успешных нет, сводка из нулей без NaN и Infinity', () => {
  const s = summarize([{ ok: false, status: null, error: 'ECONNREFUSED' }]);

  assert.equal(s.succeeded, 0);
  assert.equal(s.totalBytes, 0);
  assert.equal(s.minTimeMs, 0);
  assert.equal(s.avgTimeMs, 0);
  assert.equal(s.bytesPerSecond, 0);
});

test('форматирование байт и миллисекунд', () => {
  assert.equal(formatBytes(12_345_678), '12.35 МБ');
  assert.equal(formatMs(1234.6), '1235 мс');
});
