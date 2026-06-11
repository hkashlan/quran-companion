/**
 * Generates solid-emerald PWA icons (no image deps) so the manifest resolves and
 * the install prompt has artwork. Run: pnpm --filter @quran/web icons
 * Replace with real artwork later.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// brand emerald #0A7B4F
const R = 0x0a;
const G = 0x7b;
const B = 0x4f;

function crc32(buf: Uint8Array): number {
	let c = ~0;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);
	const len = data.length;
	const out = new Uint8Array(4 + body.length + 4);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, len);
	out.set(body, 4);
	dv.setUint32(4 + body.length, crc32(body));
	return out;
}

function solidPng(size: number): Uint8Array {
	// RGBA scanlines, each prefixed with filter byte 0
	const row = new Uint8Array(1 + size * 4);
	for (let x = 0; x < size; x++) {
		row[1 + x * 4] = R;
		row[1 + x * 4 + 1] = G;
		row[1 + x * 4 + 2] = B;
		row[1 + x * 4 + 3] = 0xff;
	}
	const raw = new Uint8Array(row.length * size);
	for (let y = 0; y < size; y++) raw.set(row, y * row.length);
	const idat = deflateSync(raw);

	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, size);
	dv.setUint32(4, size);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	// 10,11,12 = compression/filter/interlace = 0

	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const png = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		png.set(p, off);
		off += p.length;
	}
	return png;
}

const dir = resolve(import.meta.dirname, "../public/icons");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "icon-192.png"), solidPng(192));
writeFileSync(resolve(dir, "icon-512.png"), solidPng(512));
console.log("icons: wrote icon-192.png, icon-512.png");
