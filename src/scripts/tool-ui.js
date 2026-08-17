/* ------------------------------------------------------------------
   Shared rendering for scanner-style tools. Every tool returns findings
   in the same shape, so the report markup lives here once instead of
   being copied into each page.

   Finding shape: { status, title, detail, record?, fix? }
   status ∈ pass | warn | fail | unknown
------------------------------------------------------------------- */

const BADGE = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', unknown: '?' };

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Render one finding card. `kind` is the small label above the title. */
export function findingCard(kind, r) {
  if (!r) return '';
  const status = r.status || 'unknown';
  return `
    <article class="finding">
      <span class="f-badge f-${status}">${BADGE[status] || '?'}</span>
      <div>
        <span class="f-kind">${esc(kind)}</span>
        <h3 class="f-title">${esc(r.title)}</h3>
        <p class="f-detail">${esc(r.detail)}</p>
        ${r.record ? `<code class="f-record">${esc(r.record)}</code>` : ''}
        ${r.fix ? `<p class="f-fix"><b>Fix</b> ${esc(r.fix)}</p>` : ''}
      </div>
    </article>`;
}

/** Paint the grade ring, colour-coded by score. */
export function renderScore({ score, grade, domain, summary }) {
  const ring = document.getElementById('score-ring');
  const colour =
    score >= 75 ? 'var(--term-ok)' : score >= 50 ? '#febc2e' : 'var(--accent-red)';

  if (ring) {
    ring.style.setProperty('--ring', `${(score / 100).toFixed(3)}turn`);
    ring.style.setProperty('--ring-color', colour);
  }

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set('score-letter', grade.letter);
  set('score-num', String(score));
  set('score-label', grade.label);
  set('score-domain', domain);
  set('score-summary', summary);
}

/**
 * Wire a tool's form to its scan function. Handles loading state, errors,
 * result reveal, and the ?domain= deep link — identical across tools.
 */
export function wireScanner({ scan, render, summarise }) {
  const form = document.getElementById('scan-form');
  const input = document.getElementById('domain');
  const btn = document.getElementById('scan-btn');
  const errorEl = document.getElementById('scan-error');
  const results = document.getElementById('results');
  const findings = document.getElementById('findings');

  if (!form || !input) return;

  const setLoading = (loading) => {
    if (!btn) return;
    btn.disabled = loading;
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = loading ? 'Scanning…' : 'Run check';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    setLoading(true);

    try {
      const result = await scan(input.value);

      renderScore({
        score: result.score,
        grade: result.grade,
        domain: result.domain,
        summary: summarise(result),
      });

      if (findings) findings.innerHTML = render(result);
      if (results) {
        results.hidden = false;
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = err?.message || 'Something went wrong running that check.';
      if (results) results.hidden = true;
    } finally {
      setLoading(false);
    }
  });

  // Deep link: /tools/<tool>?domain=example.com runs immediately and is shareable.
  const preset = new URLSearchParams(location.search).get('domain');
  if (preset) {
    input.value = preset;
    form.requestSubmit();
  }
}
