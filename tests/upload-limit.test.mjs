import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fetchUploadLimit } from '../lib/upload-limit.ts';

test('capacity lookup preserves multi-GB limits and bypasses cached redirects', async () => {
  const signal = new AbortController().signal;
  const limit = await fetchUploadLimit(signal, async (url, options) => {
    assert.equal(url, '/api/files');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal, signal);
    return Response.json({ maxFileSize: 4692377600 });
  });
  assert.equal(limit, 4692377600);
});

test('real zero and low-storage 10 MB limits remain authoritative', async () => {
  for (const limit of [0, 10 * 1024 ** 2]) {
    assert.equal(await fetchUploadLimit(undefined, async () => Response.json({ maxFileSize: limit })), limit);
  }
});

test('network, redirect, HTTP and invalid JSON failures never become a 10 MB limit', async () => {
  const failures = [
    async () => { throw new TypeError('redirect count exceeded'); },
    async () => Response.json({}, { status: 503 }),
    async () => new Response('<html>301</html>', { status: 301 }),
    async () => new Response('<html>not JSON</html>'),
    async () => null,
  ];
  for (const fetcher of failures) await assert.rejects(() => fetchUploadLimit(undefined, fetcher));
  for (const value of [null, {}, { maxFileSize: '4692377600' }, { maxFileSize: -1 }, { maxFileSize: 1.5 }, { maxFileSize: Number.MAX_SAFE_INTEGER + 1 }]) {
    await assert.rejects(() => fetchUploadLimit(undefined, async () => Response.json(value)));
  }
});

test('a failed capacity lookup recovers on the next poll', async () => {
  let attempt = 0;
  const fetcher = async () => {
    if (++attempt === 1) throw new TypeError('network error');
    return Response.json({ maxFileSize: 4 * 1024 ** 3 });
  };
  await assert.rejects(() => fetchUploadLimit(undefined, fetcher));
  assert.equal(await fetchUploadLimit(undefined, fetcher), 4 * 1024 ** 3);
});

test('Nginx file location covers both limit and chunk endpoints without slash redirects', async () => {
  const config = await readFile(new URL('../deploy/nginx-file-transfer.conf', import.meta.url), 'utf8');
  const expression = config.match(/^location ~ (\S+) \{/m)?.[1];
  assert.ok(expression);
  const matches = new RegExp(expression);
  for (const path of ['/api/files', '/api/files/', '/api/files/uploads', '/api/files/uploads/ABC/complete', '/api/files/ABC/access']) assert.equal(matches.test(path), true, path);
  for (const path of ['/api/files-other', '/api/session', '/privacy']) assert.equal(matches.test(path), false, path);
  assert.match(config, /proxy_request_buffering off;/);
  assert.match(config, /proxy_buffering off;/);
});
