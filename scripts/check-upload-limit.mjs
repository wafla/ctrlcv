// Run after Nginx changes as well as application deployments.
const origin = new URL(process.argv[2] || 'https://www.ctrlcv.net').origin;
try {
  const response = await fetch(`${origin}/api/files`, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Number.isSafeInteger(data.maxFileSize) || data.maxFileSize < 0) {
    throw new Error('Invalid maxFileSize');
  }
  console.log(JSON.stringify({ status: response.status, redirects: 0, maxFileSize: data.maxFileSize, limitGiB: +(data.maxFileSize / 1024 ** 3).toFixed(2) }));
} catch (error) {
  console.error('Upload-limit deployment check failed:', error.message, error.cause?.message || '');
  process.exitCode = 1;
}
