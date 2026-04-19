/**
 * ND and code normalisation for materials fingerprint matching.
 */

const UNICODE_FRACTIONS = {
  '\u00BD': 0.5,    // ½
  '\u00BC': 0.25,   // ¼
  '\u00BE': 0.75,   // ¾
  '\u2153': 0.333,  // ⅓
  '\u2154': 0.667,  // ⅔
  '\u215B': 0.125,  // ⅛
  '\u215C': 0.375,  // ⅜
  '\u215D': 0.625,  // ⅝
  '\u215E': 0.875,  // ⅞
};

/**
 * Parse a single ND token (one side of an "X" separator) into a numeric string.
 * Handles: integers, decimals, simple fractions "3/4", mixed fractions "1 1/2",
 * and Unicode fraction characters.
 */
function parseToken(tok) {
  let s = tok.trim();
  if (!s) return null;

  // Replace unicode fractions with their decimal value
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) {
      // Mixed: "1½" → 1 + 0.5
      const before = s.substring(0, s.indexOf(ch)).trim();
      const whole = before ? parseFloat(before) : 0;
      if (isNaN(whole)) return s; // give up, pass through
      const result = whole + val;
      return fmtNum(result);
    }
  }

  // Mixed fraction: "1 1/2" or "1-1/2"
  const mixedMatch = s.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return s;
    return fmtNum(whole + num / den);
  }

  // Simple fraction: "3/4"
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return s;
    return fmtNum(num / den);
  }

  // Pure number (integer or decimal)
  const n = parseFloat(s);
  if (!isNaN(n)) return fmtNum(n);

  // Unrecognised — pass through
  return s;
}

/** Format number: strip trailing zeros but keep at least one decimal if fractional */
function fmtNum(n) {
  // Use parseFloat(toFixed) to avoid floating point artefacts
  const s = parseFloat(n.toFixed(4)).toString();
  return s;
}

/**
 * Normalise a nominal diameter string to a canonical form.
 *
 * Examples:
 *   '1/2"'          → '0.5'
 *   '1 1/2"'        → '1.5'
 *   '2"X1"'         → '2X1'
 *   '5/8" X 120'    → '0.625X120'
 *   'DN25'          → 'DN25'
 *   null            → null
 */
export function normalizeND(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Uppercase
  s = s.toUpperCase();

  // Strip inch marks: ", IN, "
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033"]/g, '');
  s = s.replace(/\bIN\b\.?/g, '');

  // Replace multiplication sign with X
  s = s.replace(/\u00D7/g, 'X');

  // Normalise whitespace around X
  s = s.replace(/\s*X\s*/g, 'X');

  // Trim again
  s = s.trim();
  if (!s) return null;

  // If it starts with DN (metric), pass through as-is
  if (/^DN\d/.test(s)) return s;

  // Split on X, parse each token, rejoin
  const tokens = s.split('X');
  const parsed = tokens.map(t => parseToken(t)).filter(t => t !== null);
  if (parsed.length === 0) return null;

  return parsed.join('X');
}

/**
 * Normalise a category code: trim + uppercase.
 */
export function normalizeCode(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  return s || null;
}

// =============================================================================
// Self-check (runs in dev only, no-op in production builds)
// =============================================================================
if (import.meta.env?.DEV) {
  const checks = [
    ['1/2"', '0.5'],
    ['3/4"', '0.75'],
    ['5/8"', '0.625'],
    ['1"', '1'],
    ['1 1/2"', '1.5'],
    ['1-1/2"', '1.5'],
    ['1\u00BD"', '1.5'],
    ['2"', '2'],
    ['2 1/2"', '2.5'],
    ['14"', '14'],
    ['24"', '24'],
    ['1 1/2"X3/4"', '1.5X0.75'],
    ['2"X1"', '2X1'],
    ['5/8"X120', '0.625X120'],
    ['5/8" X 120', '0.625X120'],
    ['DN25', 'DN25'],
    ['', null],
    [null, null],
  ];
  let pass = 0;
  for (const [input, expected] of checks) {
    const got = normalizeND(input);
    if (got !== expected) {
      console.error(`[normalizeND] FAIL: normalizeND(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    } else {
      pass++;
    }
  }
  console.info(`[normalizeND] self-check: ${pass}/${checks.length} passed`);
}
