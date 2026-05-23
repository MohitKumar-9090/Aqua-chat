import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = await readFile(join(publicDir, 'app-icon.svg'));

const makeSquare = async (size, { maskable = false } = {}) => {
  const icon = sharp(svg).resize(size, size, { fit: 'contain', background: { r: 6, g: 182, b: 212, alpha: 1 } });
  if (!maskable) return icon.png().toBuffer();

  const inset = Math.round(size * 0.18);
  const inner = size - inset * 2;
  const foreground = await sharp(svg)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 6, g: 182, b: 212, alpha: 1 }
    }
  })
    .composite([{ input: foreground, gravity: 'center' }])
    .png()
    .toBuffer();
};

await writeFile(join(publicDir, 'icon-192.png'), await makeSquare(192));
await writeFile(join(publicDir, 'icon-512.png'), await makeSquare(512));
await writeFile(join(publicDir, 'icon-maskable-512.png'), await makeSquare(512, { maskable: true }));

console.log('Generated icon-192.png, icon-512.png, and icon-maskable-512.png');
