/* ------------------------------------------------------------------
   Line-level diff via LCS. Pure computation — no dependency, no network.

   Two guards keep a large paste from freezing the tab. Identical leading
   and trailing lines are trimmed before the table is built (an optimal LCS
   always keeps a matching first or last pair, so trimming cannot change
   the answer), and whatever remains is refused above a fixed cell budget
   rather than allocated: 4M cells is a 16MB Int32Array, roughly where a
   browser tab starts to stall.
------------------------------------------------------------------- */

export const LIMITS = {
  lines: 4000,
  cells: 4_000_000,
  chars: 2_000_000,
};

const WORD_TOKEN_CAP = 400;
const WORD_SIMILARITY = 0.4;

const fmt = (n) => n.toLocaleString('en-US');

function splitLines(text) {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  if (s === '') return [];
  // A trailing newline terminates the last line rather than starting an
  // empty one — the same way every diff tool counts lines.
  return (s.endsWith('\n') ? s.slice(0, -1) : s).split('\n');
}

function normalize(line, o) {
  let s = line;
  if (o.ignoreWhitespace) s = s.trim();
  if (o.ignoreCase) s = s.toLowerCase();
  return s;
}

/** Map each line to an integer id so the DP inner loop compares numbers. */
function intern(lines, o, dict) {
  const ids = new Int32Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const key = normalize(lines[i], o);
    let id = dict.get(key);
    if (id === undefined) {
      id = dict.size;
      dict.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

/**
 * Shared LCS driver — used for lines (integer ids) and for words (strings).
 * Returns edit operations in order: t = -1 delete, 0 keep, 1 insert.
 */
function lcs(ka, kb) {
  const n = ka.length;
  const m = kb.length;
  const w = m + 1;
  const table = new Int32Array((n + 1) * w);

  for (let i = n - 1; i >= 0; i--) {
    const row = i * w;
    const next = row + w;
    const a = ka[i];
    for (let j = m - 1; j >= 0; j--) {
      table[row + j] =
        a === kb[j]
          ? table[next + j + 1] + 1
          : Math.max(table[next + j], table[row + j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      ops.push({ t: 0, ai: i, bi: j });
      i++;
      j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
      // Ties go to the deletion, so a replaced line reads as "−" then "+".
      ops.push({ t: -1, ai: i, bi: -1 });
      i++;
    } else {
      ops.push({ t: 1, ai: -1, bi: j });
      j++;
    }
  }
  while (i < n) ops.push({ t: -1, ai: i++, bi: -1 });
  while (j < m) ops.push({ t: 1, ai: -1, bi: j++ });
  return ops;
}

const tokenize = (line) => line.split(/(\s+)/).filter((t) => t !== '');

// Adjacent tokens in the same state merge, so a highlight is one continuous
// span rather than one box per word.
function pushPart(parts, text, changed) {
  const last = parts[parts.length - 1];
  if (last && last.changed === changed) last.text += text;
  else parts.push({ text, changed });
}

/**
 * Word-level refinement for one replaced line pair. Returns null instead of a
 * guess when too little of the line survives: an intra-line diff of two
 * unrelated lines misleads more than no intra-line diff at all.
 */
function wordDiff(left, right, o) {
  const ta = tokenize(left);
  const tb = tokenize(right);
  if (!ta.length || !tb.length) return null;
  if (ta.length > WORD_TOKEN_CAP || tb.length > WORD_TOKEN_CAP) return null;

  const key = (t) => (o.ignoreCase ? t.toLowerCase() : t);
  const ops = lcs(ta.map(key), tb.map(key));

  // Whitespace runs match trivially, so they carry no weight in the
  // similarity test — otherwise two indented but unrelated lines look alike.
  const weight = (t) => (/\S/.test(t) ? t.length : 0);
  const sum = (arr) => arr.reduce((n, t) => n + weight(t), 0);
  let kept = 0;
  for (const op of ops) if (op.t === 0) kept += weight(ta[op.ai]);
  const total = sum(ta) + sum(tb);
  if (!total || (2 * kept) / total < WORD_SIMILARITY) return null;

  const leftParts = [];
  const rightParts = [];
  for (const op of ops) {
    if (op.t === 0) {
      pushPart(leftParts, ta[op.ai], false);
      pushPart(rightParts, tb[op.bi], false);
    } else if (op.t === -1) {
      pushPart(leftParts, ta[op.ai], true);
    } else {
      pushPart(rightParts, tb[op.bi], true);
    }
  }
  return { left: leftParts, right: rightParts };
}

/** Pair the removals and additions inside each changed block, then word-diff. */
function refine(ops, o) {
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'same') {
      i++;
      continue;
    }
    let end = i;
    while (end < ops.length && ops[end].type !== 'same') end++;

    const dels = [];
    const adds = [];
    for (let k = i; k < end; k++) (ops[k].type === 'del' ? dels : adds).push(ops[k]);

    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const pair = wordDiff(dels[k].text, adds[k].text, o);
      if (pair) {
        dels[k].parts = pair.left;
        adds[k].parts = pair.right;
      }
    }
    i = end;
  }
}

/**
 * Diff two blocks of text by line.
 *
 * Returns { tooLarge: true, message } when an input exceeds a guard, or the
 * op list plus counts. Each op carries both line numbers (null on the side it
 * does not exist) and aBefore/bBefore, the line counts consumed before it,
 * which the patch writer needs to anchor a pure insertion.
 */
export function diffText(originalText, changedText, options = {}) {
  const o = { ignoreWhitespace: false, ignoreCase: false, ...options };
  const aText = String(originalText ?? '');
  const bText = String(changedText ?? '');

  if (aText.length + bText.length > LIMITS.chars) {
    return {
      tooLarge: true,
      message: `These inputs total ${fmt(aText.length + bText.length)} characters, past the ${fmt(LIMITS.chars)} this page will attempt. Compare a section at a time, or use git diff locally.`,
    };
  }

  const a = splitLines(aText);
  const b = splitLines(bText);

  if (a.length > LIMITS.lines || b.length > LIMITS.lines) {
    return {
      tooLarge: true,
      message: `This page compares up to ${fmt(LIMITS.lines)} lines per side — you pasted ${fmt(a.length)} and ${fmt(b.length)}. Beyond that the comparison table gets large enough to hang the tab, so it is refused rather than attempted.`,
    };
  }

  const dict = new Map();
  const ia = intern(a, o, dict);
  const ib = intern(b, o, dict);

  let head = 0;
  while (head < a.length && head < b.length && ia[head] === ib[head]) head++;
  let endA = a.length;
  let endB = b.length;
  while (endA > head && endB > head && ia[endA - 1] === ib[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - head;
  const m = endB - head;
  const cells = (n + 1) * (m + 1);
  if (cells > LIMITS.cells) {
    return {
      tooLarge: true,
      message: `After skipping the identical lines at the top and bottom, ${fmt(n)} × ${fmt(m)} = ${fmt(cells)} comparisons remain — past the ${fmt(LIMITS.cells)} cell budget that keeps this responsive. These two inputs differ too widely to diff in a browser tab.`,
    };
  }

  const ops = [];
  let aCount = 0;
  let bCount = 0;

  const emit = (type, ai, bi) => {
    ops.push({
      type,
      text: type === 'add' ? b[bi] : a[ai],
      aLine: type === 'add' ? null : ai + 1,
      bLine: type === 'del' ? null : bi + 1,
      aBefore: aCount,
      bBefore: bCount,
    });
    if (type !== 'add') aCount++;
    if (type !== 'del') bCount++;
  };

  for (let k = 0; k < head; k++) emit('same', k, k);

  for (const op of lcs(ia.subarray(head, endA), ib.subarray(head, endB))) {
    if (op.t === 0) emit('same', head + op.ai, head + op.bi);
    else if (op.t === -1) emit('del', head + op.ai, -1);
    else emit('add', -1, head + op.bi);
  }

  for (let k = 0; k < a.length - endA; k++) emit('same', endA + k, endB + k);

  refine(ops, o);

  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const op of ops) {
    if (op.type === 'add') added++;
    else if (op.type === 'del') removed++;
    else unchanged++;
  }

  const totalLines = a.length + b.length;

  return {
    ops,
    added,
    removed,
    unchanged,
    aLines: a.length,
    bLines: b.length,
    similarity: totalLines ? Math.round((2 * unchanged * 100) / totalLines) : 100,
    identical: added === 0 && removed === 0,
  };
}

/** Collapse the flat op list into same-runs and changed blocks for rendering. */
export function toGroups(ops) {
  const groups = [];
  for (const op of ops) {
    const last = groups[groups.length - 1];
    if (op.type === 'same') {
      if (last && last.type === 'same') last.ops.push(op);
      else groups.push({ type: 'same', ops: [op] });
    } else {
      let g = last;
      if (!g || g.type !== 'change') {
        g = { type: 'change', dels: [], adds: [] };
        groups.push(g);
      }
      (op.type === 'del' ? g.dels : g.adds).push(op);
    }
  }
  return groups;
}

/** Render the ops as a unified diff, so the result can leave this page as text. */
export function unifiedPatch(ops, context = 3) {
  const changed = [];
  for (let i = 0; i < ops.length; i++) if (ops[i].type !== 'same') changed.push(i);
  if (!changed.length) return '';

  // Two changes closer than 2×context share a hunk, otherwise their context
  // lines would overlap and print twice.
  const hunks = [];
  let cur = [changed[0], changed[0]];
  for (let k = 1; k < changed.length; k++) {
    if (changed[k] - cur[1] - 1 <= context * 2) cur[1] = changed[k];
    else {
      hunks.push(cur);
      cur = [changed[k], changed[k]];
    }
  }
  hunks.push(cur);

  const out = ['--- original', '+++ changed'];
  for (const [s, e] of hunks) {
    const from = Math.max(0, s - context);
    const to = Math.min(ops.length - 1, e + context);
    const body = [];
    let aStart = 0;
    let bStart = 0;
    let aCount = 0;
    let bCount = 0;

    for (let i = from; i <= to; i++) {
      const op = ops[i];
      if (op.type !== 'add') {
        if (!aCount) aStart = op.aLine;
        aCount++;
      }
      if (op.type !== 'del') {
        if (!bCount) bStart = op.bLine;
        bCount++;
      }
      body.push((op.type === 'del' ? '-' : op.type === 'add' ? '+' : ' ') + op.text);
    }

    // A hunk with no lines on one side is a pure insertion or deletion: the
    // unified format anchors it to the line it follows, not to a line number
    // that does not exist.
    const aFrom = aCount ? aStart : ops[from].aBefore;
    const bFrom = bCount ? bStart : ops[from].bBefore;
    out.push(`@@ -${aFrom},${aCount} +${bFrom},${bCount} @@`);
    out.push(...body);
  }

  return `${out.join('\n')}\n`;
}
