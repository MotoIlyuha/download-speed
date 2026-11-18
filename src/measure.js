// Один замер и серия замеров. Здесь только сбор данных, в консоль ничего не пишем.

const HEADERS = {
  // Просим не сжимать ответ: считаем байты, которые реально пришли по сети.
  'Accept-Encoding': 'identity',
  // Просим промежуточные кеши (CDN, прокси) не отдавать сохранённую копию без проверки.
  'Cache-Control': 'no-cache',
};

export async function measureOnce(url, timeoutMs) {
  const start = performance.now();
  // Снаружи try, чтобы при обрыве на чтении тела ошибка показала, что заголовки уже пришли.
  let status = null;
  // Сигнал действует на весь запрос: и на ожидание заголовков, и на чтение тела.
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    status = res.status;
    // fetch возвращает ответ, как только пришли заголовки, — это и есть время до заголовков.
    const ttfbMs = performance.now() - start;

    if (!res.ok) {
      // Тело не нужно, но его надо отменить, иначе соединение останется занятым.
      await res.body?.cancel();
      return { ok: false, status: res.status, error: `HTTP ${res.status} ${res.statusText}`.trim() };
    }

    let bytes = 0;
    // У ответа без тела (например, 204) body === null.
    if (res.body) {
      // Читаем тело потоком: считаем размер каждого куска и сразу его выбрасываем.
      for await (const chunk of res.body) {
        bytes += chunk.byteLength;
      }
    }
    const timeMs = performance.now() - start;
    return { ok: true, status: res.status, bytes, timeMs, ttfbMs };
  } catch (err) {
    // Таймаут определяем по самому сигналу, а не по имени ошибки: в Node 18.18 при обрыве
    // во время чтения тела undici бросает общий AbortError вместо TimeoutError.
    const error = signal.aborted ? `таймаут ${timeoutMs / 1000} с` : describeError(err);
    return { ok: false, status, error };
  }
}

export async function measureSeries(url, count, timeoutMs, onResult = () => {}) {
  const results = [];
  for (let i = 1; i <= count; i++) {
    // await внутри цикла: следующий запрос уходит только после полного ответа на текущий.
    const result = await measureOnce(url, timeoutMs);
    results.push(result);
    onResult(result, i);
  }
  return results;
}

function describeError(err) {
  // fetch пишет просто "fetch failed", а настоящая причина (ECONNREFUSED, ENOTFOUND...) лежит в cause.
  // У AggregateError (несколько попыток подключения) message пустой, но есть code.
  return err.cause?.message || err.cause?.code || err.message;
}
