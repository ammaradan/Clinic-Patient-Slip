const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');
if (!fs.existsSync(wwwDir)) {
  fs.mkdirSync(wwwDir, { recursive: true });
}

const files = [
  'index.html',
  'style.css',
  'app.js',
  'escpos.js',
  'manifest.json',
  'icon.svg',
  'sw.js'
];

files.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(wwwDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

console.log('Build complete: Web assets copied to www/');
