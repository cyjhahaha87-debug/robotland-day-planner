import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const source = path.join(root, 'public');
const target = path.join(root, 'netlify-dist');
fs.mkdirSync(target, { recursive: true });
const files = fs.readdirSync(source).filter(name => fs.statSync(path.join(source, name)).isFile()).sort();
const hash = crypto.createHash('sha256');
for (const name of files) hash.update(name).update(fs.readFileSync(path.join(source, name)));
const version = hash.digest('hex').slice(0, 12);
for (const name of files) {
  let data = fs.readFileSync(path.join(source, name));
  if (name === 'sw.js') data = Buffer.from(data.toString().replace(/robotland-onsite-v\d+/g, 'robotland-onsite-' + version));
  fs.writeFileSync(path.join(target, name), data);
}
console.log(JSON.stringify({ provider: 'netlify', assets: files.length, cacheVersion: version }));
