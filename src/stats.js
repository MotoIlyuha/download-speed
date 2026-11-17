// Чистые функции: сводка по серии замеров и форматирование чисел для вывода.
// Единицы: 1 МБ = 10^6 байт, 1 Мбит = 10^6 бит.

const sum = (numbers) => numbers.reduce((a, b) => a + b, 0);

export function bytesPerSecond(bytes, timeMs) {
  return timeMs > 0 ? bytes / (timeMs / 1000) : 0;
}

export function summarize(results) {
  // В расчёт идут только успешные запросы.
  const ok = results.filter((r) => r.ok);
  const count = ok.length;
  const times = ok.map((r) => r.timeMs);
  const totalBytes = sum(ok.map((r) => r.bytes));
  const totalTimeMs = sum(times);

  return {
    total: results.length,
    succeeded: count,
    totalBytes,
    avgTimeMs: count ? totalTimeMs / count : 0,
    minTimeMs: count ? Math.min(...times) : 0,
    maxTimeMs: count ? Math.max(...times) : 0,
    avgTtfbMs: count ? sum(ok.map((r) => r.ttfbMs)) / count : 0,
    // Все байты делим на всё время, а не усредняем скорости отдельных запросов:
    // иначе один быстрый маленький запрос сильно завысил бы результат.
    bytesPerSecond: bytesPerSecond(totalBytes, totalTimeMs),
  };
}

export function formatBytes(bytes) {
  return `${(bytes / 1e6).toFixed(2)} МБ`;
}

export function formatMs(ms) {
  return `${Math.round(ms)} мс`;
}

export function formatMbps(bytesPerSec) {
  return `${((bytesPerSec * 8) / 1e6).toFixed(2)} Мбит/с`;
}

export function formatSpeed(bytesPerSec) {
  return `${formatMbps(bytesPerSec)} (${(bytesPerSec / 1e6).toFixed(2)} МБ/с)`;
}
