// Fast, zero-dependency Cloudflare Pages build script
// Builds dist/index.html and dist/command-centre-v2.html in <1 second
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const distDir = path.join(ROOT, 'dist');
const shellPath = path.join(ROOT, 'src', 'shell.html');
const appPath = path.join(distDir, 'app.js');
const outIndex = path.join(distDir, 'index.html');
const outV2 = path.join(distDir, 'command-centre-v2.html');
const outDev = path.join(distDir, 'dev.html');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('⚡ Starting high-speed Cloudflare Pages build...');

let shell = fs.readFileSync(shellPath, 'utf8');
let appJs = '';

if (fs.existsSync(appPath)) {
  appJs = fs.readFileSync(appPath, 'utf8');
  console.log(`✓ Loaded pre-built app.js (${(appJs.length / 1024).toFixed(0)} KB)`);
} else {
  console.log('Building app.js with esbuild...');
  const { build } = await import('esbuild');
  const res = await build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
  });
  appJs = res.outputFiles[0].text;
  fs.writeFileSync(appPath, appJs, 'utf8');
}

const bundledHtml = shell.replace('<!--APP-->', () => `<script>${appJs}</script>`);

fs.writeFileSync(outIndex, bundledHtml, 'utf8');
fs.writeFileSync(outV2, bundledHtml, 'utf8');
fs.writeFileSync(outDev, shell.replace('<!--APP-->', '<script src="app.js"></script>'), 'utf8');

console.log(`✓ Built dist/index.html (${(bundledHtml.length / 1024).toFixed(0)} KB)`);
console.log(`✓ Built dist/command-centre-v2.html (${(bundledHtml.length / 1024).toFixed(0)} KB)`);
console.log(`✓ Built dist/dev.html`);
console.log('🚀 Ready for Cloudflare Pages deployment!');
