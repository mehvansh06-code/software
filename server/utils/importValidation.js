function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function stringValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseFiniteNumber(value, fieldLabel, { min = null, allowBlank = true } = {}) {
  if (isBlank(value)) {
    if (allowBlank) return { ok: true, value: null };
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: `${fieldLabel} must be a valid number.` };
  if (min != null && n < min) return { ok: false, error: `${fieldLabel} must be >= ${min}.` };
  return { ok: true, value: n };
}

function parseHsnCode(value, options = {}) {
  const allowEmpty = options.allowEmpty !== false;
  const allowedLengths = Array.isArray(options.allowedLengths) && options.allowedLengths.length > 0
    ? options.allowedLengths
    : [4, 6, 8];
  const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : 8;

  if (value == null || String(value).trim() === '') {
    if (allowEmpty) return { ok: true, value: '' };
    return { ok: false, error: 'HSN Code is required.' };
  }

  let text = '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return { ok: false, error: 'HSN Code must be digits only (no decimal).' };
    }
    text = String(value);
  } else {
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) {
      text = raw;
    } else if (/^\d+\.0+$/.test(raw)) {
      text = raw.split('.')[0];
    } else if (/^[0-9]+(\.[0-9]+)?[eE][+-]?[0-9]+$/.test(raw)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return { ok: false, error: 'HSN Code must be a whole number.' };
      }
      text = String(n);
    } else {
      return { ok: false, error: 'HSN Code must contain digits only.' };
    }
  }

  if (!/^\d+$/.test(text)) return { ok: false, error: 'HSN Code must contain digits only.' };
  if (text.length > maxLength) return { ok: false, error: `HSN Code must be at most ${maxLength} digits.` };
  if (!allowedLengths.includes(text.length)) {
    return { ok: false, error: `HSN Code must be ${allowedLengths.join('/')} digits.` };
  }
  return { ok: true, value: text };
}

module.exports = {
  isBlank,
  stringValue,
  parseFiniteNumber,
  parseHsnCode,
};
