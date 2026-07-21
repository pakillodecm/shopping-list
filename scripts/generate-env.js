require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

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
