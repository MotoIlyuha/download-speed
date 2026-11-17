#!/usr/bin/env node
// Точка входа: разбор аргументов, вывод таблицы и итогов, код выхода.

import { parseArgs } from 'node:util';
import { measureSeries } from './measure.js';
import { summarize, bytesPerSecond, formatBytes, formatMs, formatMbps, formatSpeed } from './stats.js';

const HELP = `Замер скорости скачивания по URL.

Использование:
  node src/cli.js <url> [-n 10] [-t 30]

Опции:
  -n, --count <число>      сколько запросов сделать подряд (по умолчанию 10)
  -t, --timeout <секунды>  таймаут одного запроса вместе со скачиванием тела (по умолчанию 30)
  -h, --help               показать эту справку`;

// Ширина колонок таблицы; последняя колонка не выравнивается.
const COLUMNS = [4, 8, 12, 11, 10];

function row(cells) {
  return cells.map((cell, i) => String(cell).padEnd(COLUMNS[i] ?? 0)).join('').trimEnd();
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      count: { type: 'string', short: 'n', default: '10' },
      timeout: { type: 'string', short: 't', default: '30' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) return { help: true };

  if (positionals.length !== 1) {
    throw new Error('нужно указать ровно один URL');
  }

  let url;
  try {
    url = new URL(positionals[0]);
  } catch {
    throw new Error(`некорректный URL: ${positionals[0]}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('поддерживаются только адреса http:// и https://');
  }

  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`-n должно быть целым числом от 1, получено: ${values.count}`);
  }

  const timeout = Number(values.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`-t должно быть положительным числом секунд, получено: ${values.timeout}`);
  }

  return { help: false, url: url.href, count, timeoutMs: timeout * 1000 };
}

function printResult(result, n) {
  if (!result.ok) {
    console.log(row([n, result.status ?? '—', `ошибка: ${result.error}`]));
    return;
  }
  console.log(row([
    n,
    result.status,
    formatBytes(result.bytes),
    formatMs(result.timeMs),
    formatMs(result.ttfbMs),
    formatMbps(bytesPerSecond(result.bytes, result.timeMs)),
  ]));
}

function printSummary(s) {
  console.log('\nИтого');
  console.log(`  Успешных:       ${s.succeeded} из ${s.total}`);
  if (s.succeeded === 0) {
    console.log('  Все запросы завершились ошибкой, скорость посчитать нельзя.');
    return;
  }
  console.log(`  Скачано всего:  ${formatBytes(s.totalBytes)} (${s.totalBytes} байт)`);
  console.log(`  Время запроса:  среднее ${formatMs(s.avgTimeMs)}, мин ${formatMs(s.minTimeMs)}, макс ${formatMs(s.maxTimeMs)}`);
  console.log(`  Средний TTFB:   ${formatMs(s.avgTtfbMs)}`);
  console.log(`  Скорость:       ${formatSpeed(s.bytesPerSecond)}`);
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    console.error(`Ошибка: ${err.message}\nСправка: node src/cli.js --help`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  console.log(`URL: ${options.url}`);
  console.log(`Запросов: ${options.count}, таймаут: ${options.timeoutMs / 1000} с\n`);
  console.log(row(['#', 'Статус', 'Размер', 'Время', 'TTFB', 'Скорость']));

  const results = await measureSeries(options.url, options.count, options.timeoutMs, printResult);
  const summary = summarize(results);
  printSummary(summary);

  // exitCode вместо process.exit(): процесс завершится сам, когда весь вывод будет записан.
  process.exitCode = summary.succeeded > 0 ? 0 : 1;
}

main();
