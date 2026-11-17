import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { measureOnce, measureSeries } from '../src/measure.js';

// Локальный сервер на случайном свободном порту (порт 0 — выбрать любой свободный).
function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function urlOf(server) {
  return `http://127.0.0.1:${server.address().port}/`;
}

function stopServer(server) {
  // Рвём и keep-alive, и зависшие соединения, иначе close() будет ждать их вечно.
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

test('10 запросов идут строго по очереди и каждый получает ровно N байт', async () => {
  const BODY_SIZE = 256 * 1024;
  let active = 0;
  let maxActive = 0;
  const encodings = [];

  const server = await startServer((req, res) => {
    active++;
    maxActive = Math.max(maxActive, active);
    encodings.push(req.headers['accept-encoding']);
    res.on('close', () => active--);

    res.writeHead(200, { 'Content-Length': BODY_SIZE });
    // Тело с задержкой: если бы запросы шли параллельно, они бы здесь пересеклись.
    setTimeout(() => res.end(Buffer.alloc(BODY_SIZE)), 20);
  });

  try {
    const results = await measureSeries(urlOf(server), 10, 5000);

    assert.equal(results.length, 10);
    for (const r of results) {
      assert.equal(r.ok, true);
      assert.equal(r.bytes, BODY_SIZE);
      assert.ok(r.ttfbMs <= r.timeMs);
    }
    assert.equal(maxActive, 1, 'сервер видел больше одного запроса одновременно');
    assert.deepEqual(encodings, Array(10).fill('identity'));
  } finally {
    await stopServer(server);
  }
});

test('HTTP 500 записывается как ошибка, серия продолжается', async () => {
  let requestNumber = 0;
  const server = await startServer((req, res) => {
    requestNumber++;
    if (requestNumber === 2) {
      res.writeHead(500);
      res.end('server error');
    } else {
      res.end(Buffer.alloc(1000));
    }
  });

  try {
    const results = await measureSeries(urlOf(server), 3, 5000);

    assert.deepEqual(results.map((r) => r.ok), [true, false, true]);
    assert.equal(results[1].status, 500);
    assert.match(results[1].error, /HTTP 500/);
  } finally {
    await stopServer(server);
  }
});

test('таймаут срабатывает, когда заголовки пришли, а тело зависло', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Length': 1000 });
    res.write(Buffer.alloc(100)); // остальные 900 байт так и не придут
  });

  try {
    const start = performance.now();
    const result = await measureOnce(urlOf(server), 300);
    const elapsed = performance.now() - start;

    assert.equal(result.ok, false);
    assert.equal(result.status, 200, 'заголовки должны были прийти');
    assert.match(result.error, /таймаут/);
    assert.ok(elapsed >= 290 && elapsed < 3000, `прошло ${elapsed} мс`);
  } finally {
    await stopServer(server);
  }
});

test('недоступный хост даёт понятную ошибку, а не исключение', async () => {
  // Занимаем свободный порт и сразу освобождаем: теперь на нём точно никто не слушает.
  const server = await startServer(() => {});
  const url = urlOf(server);
  await stopServer(server);

  const result = await measureOnce(url, 10_000);

  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.match(result.error, /ECONNREFUSED/);
});
