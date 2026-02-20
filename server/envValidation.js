/**
 * Validates required and optional environment variables before the app starts.
 * Exits process with code 1 and a clear message if required vars are missing or invalid.
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  // Required in all environments: JWT secret must be set, long, and non-default.
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length < 32) {
    errors.push('JWT_SECRET is required and must be at least 32 characters. Set a strong random value in .env');
  } else if (/flotex-ims-secret|change-in-production|secret|password/i.test(JWT_SECRET)) {
    errors.push('JWT_SECRET must not be a default or guessable value.');
  }

  // Company-sensitive env (Sales Indent): all required so server refuses to start if any are missing
  const companyEnvKeys = [
    'GFPL_GSTIN', 'GFPL_IEC', 'GFPL_BANK_ACCT', 'GFPL_IFSC', 'GFPL_SWIFT',
    'GTEX_GSTIN', 'GTEX_IEC', 'GTEX_BANK_ACCT', 'GTEX_IFSC', 'GTEX_SWIFT',
  ];
  for (const key of companyEnvKeys) {
    const val = process.env[key];
    if (val == null || typeof val !== 'string' || val.trim() === '') {
      errors.push(`${key} is required. Set it in .env (company-sensitive value for Sales Indent).`);
    }
  }

  // Optional but recommended
  if (!process.env.ADMIN_USERNAME && process.env.NODE_ENV === 'production') {
    warnings.push('ADMIN_USERNAME not set; using DB/fallback users only.');
  }

  if (errors.length > 0) {
    console.error('\n[env] Validation failed:\n');
    errors.forEach((e) => console.error('  - ' + e));
    console.error('\nFix the above and restart the server.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('[env] Warnings:', warnings.join(' '));
  }

  return true;
}

module.exports = { validateEnv };
