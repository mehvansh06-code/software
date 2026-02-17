/**
 * Validates required and optional environment variables before the app starts.
 * Exits process with code 1 and a clear message if required vars are missing or invalid.
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  // Required for production: JWT secret must be set and non-default
  const JWT_SECRET = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length === 0) {
      errors.push('JWT_SECRET is required in production. Set a strong random value in .env');
    } else if (/flotex-ims-secret|change-in-production|secret|password/i.test(JWT_SECRET)) {
      errors.push('JWT_SECRET must not be a default or guessable value in production.');
    }
  } else if (!JWT_SECRET || JWT_SECRET.trim() === '') {
    warnings.push('JWT_SECRET not set; using default. Set JWT_SECRET in .env for production.');
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
