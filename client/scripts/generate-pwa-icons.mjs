import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = await readFile(join(publicDir, 'app-icon.svg'));

await sharp(svg).resize(192, 192).png().toFile(join(publicDir, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(publicDir, 'icon-512.png'));

console.log('Generated icon-192.png and icon-512.png');
