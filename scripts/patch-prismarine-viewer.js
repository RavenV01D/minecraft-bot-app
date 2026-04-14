const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'prismarine-viewer',
  'viewer',
  'lib',
  'entities.js'
);

if (!fs.existsSync(targetPath)) {
  console.log('patch-prismarine-viewer: target file not found, skipping');
  process.exit(0);
}

const original = fs.readFileSync(targetPath, 'utf8');

if (original.includes('let createCanvas = null')) {
  console.log('patch-prismarine-viewer: already patched');
  process.exit(0);
}

const requireNeedle = "const { createCanvas } = require('canvas')";
const replacement = `let createCanvas = null
try {
  ({ createCanvas } = require('canvas'))
} catch (err) {
  // canvas is optional here; without it we simply skip username sprites
}`;

if (!original.includes(requireNeedle)) {
  console.error('patch-prismarine-viewer: expected canvas require not found');
  process.exit(1);
}

let patched = original.replace(requireNeedle, replacement);

patched = patched.replace(
  "      if (entity.username !== undefined) {",
  "      if (entity.username !== undefined && createCanvas) {"
);

fs.writeFileSync(targetPath, patched);
console.log('patch-prismarine-viewer: patched entities.js');
