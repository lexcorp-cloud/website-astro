/* ------------------------------------------------------------------
   Cron expression parser and describer. Pure logic, no dependencies.

   Handles the standard 5-field format plus the common shorthands.
   Deliberately does NOT claim to cover every vendor extension (Quartz
   seconds fields, `L`/`W`/`#`) — the UI says so rather than silently
   mis-describing an expression it does not understand.
------------------------------------------------------------------- */

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 }, // 7 == Sunday, same as 0
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const MONTH_ALIASES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const DAY_ALIASES = { sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6 };

const SHORTHAND = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/** Expand one field into the explicit set of values it matches. */
function expandField(raw, field, index) {
  const values = new Set();
  const aliases = index === 3 ? MONTH_ALIASES : index === 4 ? DAY_ALIASES : null;

  const resolve = (token) => {
    const t = String(token).trim().toLowerCase();
    if (aliases && aliases[t] !== undefined) return aliases[t];
    if (!/^\d+$/.test(t)) return NaN;
    return Number(t);
  };

  for (const part of String(raw).split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (Number.isNaN(step) || step < 1) throw new Error(`Invalid step in "${part}"`);

    let from;
    let to;

    if (rangePart === '*') {
      from = field.min;
      to = field.max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      from = resolve(a);
      to = resolve(b);
    } else {
      from = resolve(rangePart);
      to = stepPart === undefined ? from : field.max;
    }

    if (Number.isNaN(from) || Number.isNaN(to)) {
      throw new Error(`Could not read "${part}" in the ${field.name} field`);
    }
    if (from < field.min || to > field.max) {
      throw new Error(`${field.name} must be between ${field.min} and ${field.max}`);
    }

    for (let v = from; v <= to; v += step) values.add(v);
  }

  // Normalise Sunday: cron accepts both 0 and 7.
  if (index === 4 && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  return [...values].sort((a, b) => a - b);
}

function listToText(values, total, formatter) {
  if (values.length === total) return null; // means "every"
  const names = values.map(formatter);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Turn the parsed sets into a sentence a human can check at a glance. */
function describe(sets, raw) {
  const [minutes, hours, dom, months, dow] = sets;

  let time;
  const everyMinute = minutes.length === 60;
  const everyHour = hours.length === 24;

  if (everyMinute && everyHour) {
    time = 'Every minute';
  } else if (everyMinute) {
    time = `Every minute during ${listToText(hours, 24, (h) => `${String(h).padStart(2, '0')}:00`)}`;
  } else if (minutes.length > 1 && isEvenStep(minutes) && everyHour) {
    time = `Every ${stepOf(minutes)} minutes`;
  } else if (everyHour) {
    time = `At ${minutes.map((m) => `minute ${m}`).join(', ')} of every hour`;
  } else if (hours.length > 1 && isEvenStep(hours) && minutes.length === 1) {
    // Two things to get right here: a step of 1 is "every hour", not "every 1
    // hours"; and when the hours are restricted the window has to be stated, or
    // "every 6 hours" reads as covering the whole day when it does not.
    const step = stepOf(hours);
    const window = `between ${pad(hours[0])}:00 and ${pad(hours[hours.length - 1])}:00`;
    time =
      step === 1
        ? `Every hour at minute ${minutes[0]}, ${window}`
        : `Every ${step} hours at minute ${minutes[0]}, ${window}`;
  } else {
    const stamps = [];
    for (const h of hours) {
      for (const m of minutes) stamps.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    time = `At ${stamps.slice(0, 6).join(', ')}${stamps.length > 6 ? ` and ${stamps.length - 6} more` : ''}`;
  }

  const parts = [time];

  const domText = listToText(dom, 31, (d) => ordinal(d));
  const dowText = listToText(dow, 7, (d) => DAYS[d]);
  const monthText = listToText(months, 12, (m) => MONTHS[m - 1]);

  // When both day-of-month and day-of-week are restricted, cron runs on EITHER,
  // not both — a genuine gotcha worth stating rather than glossing over.
  if (domText && dowText) {
    parts.push(`on the ${domText} of the month **or** on ${dowText} (cron treats these as OR)`);
  } else if (domText) {
    parts.push(`on the ${domText} of the month`);
  } else if (dowText) {
    parts.push(`on ${dowText}`);
  }

  if (monthText) parts.push(`in ${monthText}`);

  return parts.join(' ') + '.';
}

const pad = (n) => String(n).padStart(2, '0');

const isEvenStep = (arr) => {
  if (arr.length < 3) return false;
  const step = arr[1] - arr[0];
  return arr.every((v, i) => i === 0 || v - arr[i - 1] === step);
};
const stepOf = (arr) => arr[1] - arr[0];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Next N matching times, evaluated minute by minute from `from`. */
function nextRuns(sets, from = new Date(), count = 5) {
  const [minutes, hours, dom, months, dow] = sets;
  const results = [];

  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  const domRestricted = dom.length !== 31;
  const dowRestricted = dow.length !== 7;

  // Two years of minutes is a generous bound; anything not found by then is
  // effectively a never-matching expression (e.g. 30 February).
  const limit = 60 * 24 * 366 * 2;

  for (let i = 0; i < limit && results.length < count; i++) {
    if (
      minutes.includes(d.getMinutes()) &&
      hours.includes(d.getHours()) &&
      months.includes(d.getMonth() + 1) &&
      (domRestricted && dowRestricted
        ? dom.includes(d.getDate()) || dow.includes(d.getDay())
        : (!domRestricted || dom.includes(d.getDate())) && (!dowRestricted || dow.includes(d.getDay())))
    ) {
      results.push(new Date(d.getTime()));
    }
    d.setMinutes(d.getMinutes() + 1);
  }

  return results;
}

export function parseCron(input) {
  let expr = String(input || '').trim().toLowerCase();
  if (!expr) throw new Error('Enter a cron expression, for example 0 */6 * * 1-5');

  const shorthandUsed = SHORTHAND[expr] ? expr : null;
  if (shorthandUsed) expr = SHORTHAND[expr];

  if (expr === '@reboot') {
    return {
      expression: '@reboot',
      description: 'Runs once when the machine boots. It has no schedule, so there are no upcoming times to show.',
      fields: [],
      next: [],
      shorthand: '@reboot',
    };
  }

  const tokens = expr.split(/\s+/);

  if (tokens.length === 6) {
    throw new Error('This looks like a 6-field (Quartz) expression with a seconds column. This tool covers the standard 5-field crontab format.');
  }
  if (tokens.length !== 5) {
    throw new Error(`Expected 5 fields (minute hour day month weekday) but got ${tokens.length}.`);
  }
  if (/[lw#]/.test(expr)) {
    throw new Error('Contains a vendor extension (L, W or #) that standard crontab does not support.');
  }

  const sets = tokens.map((t, i) => expandField(t, FIELDS[i], i));

  return {
    expression: tokens.join(' '),
    shorthand: shorthandUsed,
    description: describe(sets, tokens),
    fields: FIELDS.map((f, i) => ({
      name: f.name,
      raw: tokens[i],
      matches:
        sets[i].length === (i === 4 ? 7 : f.max - f.min + 1)
          ? 'every value'
          : sets[i].length > 12
            ? `${sets[i].length} values`
            : sets[i].join(', '),
    })),
    next: nextRuns(sets),
  };
}
