/* ------------------------------------------------------------------
   Connection speed measurement, entirely in the browser.

   Measures against Cloudflare's public measurement endpoints — the same
   ones their own speed test uses. That means results reflect your route
   to the nearest Cloudflare edge, not a universal figure; the UI says so
   rather than implying otherwise.

   Two accuracy details worth keeping:
   - A single TCP stream under-reports fast links, so downloads run over
     several parallel connections.
   - The first request pays DNS, TLS and slow-start costs, so a warm-up is
     discarded before anything is recorded.
------------------------------------------------------------------- */

const DOWN = 'https://speed.cloudflare.com/__down';
const UP = 'https://speed.cloudflare.com/__up';

const nocache = (url) => `${url}${url.includes('?') ? '&' : '?'}r=${Math.random().toString(36).slice(2)}`;
const mbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;

/* ------------------------------ latency ------------------------------- */

export async function measureLatency(samples = 8, onProgress) {
  const times = [];

  // Warm-up: opens the connection so the first real sample isn't inflated.
  await fetch(nocache(`${DOWN}?bytes=0`), { cache: 'no-store' }).catch(() => {});

  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    try {
      await fetch(nocache(`${DOWN}?bytes=0`), { cache: 'no-store' });
      times.push(performance.now() - t0);
    } catch {
      /* one dropped sample shouldn't abort the run */
    }
    onProgress?.((i + 1) / samples);
  }

  if (!times.length) throw new Error('Could not reach the measurement server.');

  const sorted = [...times].sort((a, b) => a - b);
  // Minimum is the truest round trip; the median would carry queueing noise.
  const latency = sorted[0];
  // Jitter: mean absolute difference between consecutive samples.
  const jitter =
    times.length > 1
      ? times.slice(1).reduce((sum, t, i) => sum + Math.abs(t - times[i]), 0) / (times.length - 1)
      : 0;

  return { latency, jitter, samples: times.length };
}

/* ----------------------------- download ------------------------------- */

async function downloadOnce(bytes) {
  const t0 = performance.now();
  const res = await fetch(nocache(`${DOWN}?bytes=${bytes}`), { cache: 'no-store' });
  const buf = await res.arrayBuffer();
  return { bytes: buf.byteLength, ms: performance.now() - t0 };
}

export async function measureDownload(onProgress) {
  // Warm-up, discarded.
  await downloadOnce(200_000).catch(() => {});

  // Escalate size, then widen to parallel streams. Total stays ≈26MB so the
  // test is honest on a fast link without burning a mobile data allowance.
  const stages = [
    { bytes: 1_000_000, streams: 1 },
    { bytes: 3_000_000, streams: 2 },
    { bytes: 5_000_000, streams: 3 },
  ];

  let best = 0;
  for (let s = 0; s < stages.length; s++) {
    const { bytes, streams } = stages[s];
    const t0 = performance.now();
    const runs = await Promise.all(Array.from({ length: streams }, () => downloadOnce(bytes)));
    const elapsed = performance.now() - t0;
    const total = runs.reduce((sum, r) => sum + r.bytes, 0);

    // Parallel streams share the wall clock, so throughput is total ÷ elapsed.
    best = Math.max(best, mbps(total, elapsed));
    onProgress?.((s + 1) / stages.length, best);
  }

  return best;
}

/* ------------------------------ upload -------------------------------- */

async function uploadOnce(bytes) {
  const payload = new Uint8Array(bytes);
  const t0 = performance.now();
  await fetch(nocache(UP), { method: 'POST', body: payload, cache: 'no-store' });
  return { bytes, ms: performance.now() - t0 };
}

export async function measureUpload(onProgress) {
  await uploadOnce(100_000).catch(() => {});

  const stages = [
    { bytes: 500_000, streams: 1 },
    { bytes: 1_000_000, streams: 2 },
    { bytes: 2_000_000, streams: 2 },
  ];

  let best = 0;
  for (let s = 0; s < stages.length; s++) {
    const { bytes, streams } = stages[s];
    const t0 = performance.now();
    await Promise.all(Array.from({ length: streams }, () => uploadOnce(bytes)));
    const elapsed = performance.now() - t0;

    best = Math.max(best, mbps(bytes * streams, elapsed));
    onProgress?.((s + 1) / stages.length, best);
  }

  return best;
}

/* ------------------------------ verdicts ------------------------------ */

export function rateSpeed(down) {
  if (down >= 100) return { label: 'Excellent', note: 'Comfortably handles 4K streaming, large transfers and a full team on video calls.' };
  if (down >= 50) return { label: 'Very good', note: 'Fine for HD streaming, video calls and everyday cloud work.' };
  if (down >= 25) return { label: 'Good', note: 'Handles HD video and normal business use without trouble.' };
  if (down >= 10) return { label: 'Fair', note: 'Workable for browsing and SD video; large uploads will feel slow.' };
  return { label: 'Slow', note: 'Likely to struggle with video calls and cloud file transfers.' };
}

export function rateLatency(ms) {
  if (ms < 30) return { label: 'Excellent', note: 'Responsive enough for real-time work and gaming.' };
  if (ms < 60) return { label: 'Good', note: 'Video calls and remote sessions will feel smooth.' };
  if (ms < 120) return { label: 'Fair', note: 'Noticeable lag in remote desktops and calls.' };
  return { label: 'High', note: 'Interactive work over this link will feel sluggish.' };
}

/* ------------------------------ full run ------------------------------ */

export async function runSpeedTest({ onPhase, onProgress } = {}) {
  onPhase?.('latency');
  const { latency, jitter } = await measureLatency(8, (p) => onProgress?.('latency', p));

  onPhase?.('download');
  const download = await measureDownload((p, current) => onProgress?.('download', p, current));

  onPhase?.('upload');
  const upload = await measureUpload((p, current) => onProgress?.('upload', p, current));

  onPhase?.('done');
  return {
    download,
    upload,
    latency,
    jitter,
    speedVerdict: rateSpeed(download),
    latencyVerdict: rateLatency(latency),
  };
}
