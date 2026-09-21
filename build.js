const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');
const androidPublicDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

[wwwDir, androidPublicDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const files = [
  'index.html',
  'style.css',
  'app.js',
  'escpos.js',
  'graphics.js',
  'header.png',
  'footer.png',
  'html2canvas.min.js',
  'manifest.json',
  'icon.svg',
  'sw.js'
];

files.forEach(file => {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, file));
    fs.copyFileSync(src, path.join(androidPublicDir, file));
  }
});

console.log('Build complete: Assets synced to www/ and android assets/public/');
