/**
 * Cuts the clothing (or a person) out of a photo, in the browser.
 *
 * The heavy lifting happens in `cutout.worker.ts`; this file prepares the image,
 * applies the returned mask as transparency, softens the edge and trims the
 * empty border so the piece sits snugly on the paper doll.
 */
import type { CutoutRequest, CutoutResponse } from './cutout.worker';

export type CutoutMode = 'item' | 'worn';
export type CutoutProgress = { stage: 'download' | 'thinking'; progress: number | null };
export type CutoutResult = { blob: Blob; found: string[]; width: number; height: number };

/** Which SegFormer clothing labels belong to each wardrobe category. */
export const WORN_LABELS: Record<string, string[]> = {
	head: ['Hat'],
	torso: ['Upper-clothes', 'Dress'],
	legs: ['Pants', 'Skirt'],
	feet: ['Left-shoe', 'Right-shoe'],
	accessory: ['Bag', 'Belt', 'Scarf', 'Sunglasses'],
};

/** Longest side sent to the model; bigger only costs time, the wardrobe shows ≤1024 px. */
const MAX_SIDE = 1024;
/** Less than this share of the photo kept means the model found nothing useful. */
const MIN_COVERAGE = 0.004;

export class CutoutError extends Error {
	constructor(
		public code: 'nothing-found' | 'unsupported' | 'failed',
		message: string,
		/** For `nothing-found` on worn photos: the clothing the model did spot. */
		public found: string[] = [],
	) {
		super(message);
	}
}

export const cutoutSupported = () =>
	typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof createImageBitmap !== 'undefined';

// ───────────────────────── worker plumbing ─────────────────────────
type Pending = { resolve: (r: Extract<CutoutResponse, { type: 'result' }>) => void; reject: (e: Error) => void; onProgress?: (p: CutoutProgress) => void };
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = (event: MessageEvent<CutoutResponse>) => {
		const msg = event.data;
		const job = pending.get(msg.id);
		if (!job) return;
		if (msg.type === 'progress') job.onProgress?.({ stage: msg.stage, progress: msg.progress });
		else {
			pending.delete(msg.id);
			if (msg.type === 'result') job.resolve(msg);
			else job.reject(new CutoutError('failed', msg.message));
		}
	};
	worker.onerror = (event) => {
		pending.forEach((job) => job.reject(new CutoutError('failed', event.message || 'The cut-out worker crashed')));
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	return worker;
}

// ───────────────────────── canvas helpers ─────────────────────────
const toBlob = (canvas: HTMLCanvasElement, type = 'image/png') =>
	new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new CutoutError('failed', 'Could not encode the image'))), type));

function canvas2d(width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new CutoutError('unsupported', 'Canvas is not available in this browser');
	return { canvas, ctx };
}

/** Blurs a hard 0/255 mask by ~1px so cut edges don't look jagged. */
function feather(mask: Uint8Array, width: number, height: number): Uint8Array {
	const src = canvas2d(width, height);
	const img = src.ctx.createImageData(width, height);
	for (let i = 0; i < mask.length; i += 1) img.data[i * 4 + 3] = mask[i];
	src.ctx.putImageData(img, 0, 0);
	const out = canvas2d(width, height);
	if (!('filter' in out.ctx)) return mask; // older Safari: keep the hard edge
	out.ctx.filter = 'blur(1px)';
	out.ctx.drawImage(src.canvas, 0, 0);
	const blurred = out.ctx.getImageData(0, 0, width, height).data;
	const result = new Uint8Array(mask.length);
	for (let i = 0; i < mask.length; i += 1) result[i] = blurred[i * 4 + 3];
	return result;
}

// ───────────────────────── main entry ─────────────────────────
export async function cutOut(
	file: Blob,
	options: { mode: CutoutMode; labels?: string[]; onProgress?: (p: CutoutProgress) => void },
): Promise<CutoutResult> {
	if (!cutoutSupported()) throw new CutoutError('unsupported', 'This browser cannot run the cut-out AI');

	const bitmap = await createImageBitmap(file).catch(() => {
		throw new CutoutError('failed', 'Could not read that image');
	});
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const { canvas, ctx } = canvas2d(width, height);
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const input = await toBlob(canvas);
	const id = nextId++;
	const result = await new Promise<Extract<CutoutResponse, { type: 'result' }>>((resolve, reject) => {
		pending.set(id, { resolve, reject, onProgress: options.onProgress });
		getWorker().postMessage({ id, mode: options.mode, labels: options.labels ?? [], image: input } satisfies CutoutRequest);
	});

	if (result.width !== width || result.height !== height) throw new CutoutError('failed', 'Mask size mismatch');
	const mask = options.mode === 'worn' ? feather(result.mask, width, height) : result.mask;

	// Apply the mask as transparency and find the bounding box of what's kept.
	const pixels = ctx.getImageData(0, 0, width, height);
	let kept = 0;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const i = y * width + x;
			const a = Math.min(pixels.data[i * 4 + 3], mask[i]);
			pixels.data[i * 4 + 3] = a;
			if (a > 24) {
				kept += 1;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (kept / (width * height) < MIN_COVERAGE || maxX < 0) {
		throw new CutoutError('nothing-found', 'Nothing to cut out was found in this photo', result.found);
	}
	ctx.putImageData(pixels, 0, 0);

	// Trim to the piece, with a little breathing room.
	const pad = Math.round(Math.max(width, height) * 0.02);
	const x0 = Math.max(0, minX - pad);
	const y0 = Math.max(0, minY - pad);
	const w = Math.min(width, maxX + pad + 1) - x0;
	const h = Math.min(height, maxY + pad + 1) - y0;
	const trimmed = canvas2d(w, h);
	trimmed.ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);

	return { blob: await toBlob(trimmed.canvas), found: result.found, width: w, height: h };
}
