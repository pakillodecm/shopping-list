const fs = require('node:fs');
const path = require('node:path');

// Local dev: read from the repo-root .env via dotenv, same as before.
// CI/Cloudflare Pages: no .env file is ever present there (it's gitignored
// and nothing writes one on the build server) — the values are instead
// injected directly as real process environment variables via the
// Cloudflare Pages dashboard. Skipping dotenv.config() in that case isn't
// strictly required for correctness (dotenv never overwrites an
// already-set process.env value with one from a .env file), but it makes
// the local-vs-CI branch explicit instead of relying on a silent no-op,
// and avoids a misleading "injected env (0)" log line on every CI build.
const envFilePath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envFilePath)) {
  require('dotenv').config({ path: envFilePath });
} else {
  console.log('No .env file found — reading SUPABASE_URL/SUPABASE_KEY from process.env (expected in CI/Cloudflare Pages).');
}

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SUPABASE_KEY) missing.push('SUPABASE_KEY');

if (missing.length > 0) {
  console.error(
    `Error: missing required environment variable(s): ${missing.join(', ')}.\n` +
      'Set them in your .env file (local) or in the deployment environment (Cloudflare Pages).',
  );
  process.exit(1);
}

const environmentsDir = path.join(__dirname, '..', 'src', 'environments');

const buildFileContent = (production) =>
  `export const environment = {\n` +
  `  production: ${production},\n` +
  `  supabaseUrl: '${SUPABASE_URL}',\n` +
  `  supabaseKey: '${SUPABASE_KEY}',\n` +
  `};\n`;

fs.writeFileSync(path.join(environmentsDir, 'environment.ts'), buildFileContent(true));
fs.writeFileSync(path.join(environmentsDir, 'environment.development.ts'), buildFileContent(false));

console.log('Generated src/environments/environment.ts and environment.development.ts');
