import { spawnSync } from 'node:child_process';

function normalizePublicUrl(input) {
  let value = (input ?? '/').trim();

  if (!value || value === '.') return '/';
  if (/^https?:\/\//.test(value)) {
    return value.endsWith('/') ? value : `${value}/`;
  }
  if (!value.startsWith('/')) value = `/${value}`;
  if (!value.endsWith('/')) value = `${value}/`;
  return value;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  });

  if (result.error) {
    console.error(`[build] failed to run ${command}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const publicUrl = normalizePublicUrl(process.env.PUBLIC_URL);
const env = { ...process.env, PUBLIC_URL: publicUrl };

console.log(`[build] PUBLIC_URL=${publicUrl}`);
run('node', ['node_modules/parcel/lib/bin.js', 'build', 'index.html', 'weights.html', '--public-url', publicUrl], env);
run('node', ['scripts/build-sw.js'], env);
