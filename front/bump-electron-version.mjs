import fs from 'node:fs';
import path from 'node:path';

const pkgPath = path.resolve(process.cwd(), 'package.json');
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

const current = typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.1.0';
const parts = current.split('.');
if (parts.length !== 3) {
  throw new Error(`Unsupported version format: ${current}. Expected semver x.y.z`);
}

const major = Number(parts[0]);
const minor = Number(parts[1]);
const patch = Number(parts[2]);

if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
  throw new Error(`Version contains non-integer parts: ${current}`);
}

const next = `${major}.${minor}.${patch + 1}`;
pkg.version = next;

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`[devcord-electron] version bumped: ${current} -> ${next}`);
