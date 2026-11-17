// Packs square PNGs into a Windows .ico (used by make-icon.sh). Windows Vista and later read
// PNG images inside an .ico directly, so the PNGs go in as they are.
// Usage: node make-ico.cjs out.ico 16.png 32.png … 256.png
const fs = require('fs');

const [out, ...inputs] = process.argv.slice(2);
const images = inputs.map((file) => {
  const png = fs.readFileSync(file);
  if (png.readUInt32BE(12) !== 0x49484452) throw new Error(`${file} isn't a PNG`);
  return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map(({ png, width, height }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(width >= 256 ? 0 : width, 0); // 0 means 256
  e.writeUInt8(height >= 256 ? 0 : height, 1);
  e.writeUInt8(0, 2); // no palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});

fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.png)]));
