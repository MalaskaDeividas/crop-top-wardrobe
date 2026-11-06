/**
 * Shrinks a clothing photo in the browser before upload.
 *
 * Free D1 storage caps each row at 2 MB and each database at 500 MB, so photos
 * are scaled to at most 1600 px and re-encoded until they're under ~1 MB.
 * Transparent cut-outs (PNG/WebP) keep their transparency; GIFs are left alone
 * so animations survive.
 */
const TARGET_BYTES = 1_000_000;
const SIZES = [1600, 1280, 1024, 800, 640];
const QUALITIES = [0.86, 0.75, 0.62];

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function prepareImage(file: Blob): Promise<Blob> {
	if (file.type === 'image/gif' || typeof createImageBitmap === 'undefined') return file;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file; // not decodable here; let the server decide
	}

	const longest = Math.max(bitmap.width, bitmap.height);
	if (file.size <= TARGET_BYTES && longest <= SIZES[0]) {
		bitmap.close();
		return file;
	}

	// JPEG has no transparency, so only photos that were JPEG become JPEG.
	const keepsAlpha = file.type !== 'image/jpeg';
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		return file;
	}

	let best: Blob | null = null;
	try {
		for (const size of SIZES) {
			const scale = Math.min(1, size / longest);
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

			for (const quality of QUALITIES) {
				let blob = await toBlob(canvas, keepsAlpha ? 'image/webp' : 'image/jpeg', quality);
				// Browsers that can't encode WebP hand back PNG; that is still transparent.
				if (blob && keepsAlpha && blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
				if (!blob) continue;
				if (!best || blob.size < best.size) best = blob;
				if (blob.size <= TARGET_BYTES) return blob;
				if (blob.type === 'image/png') break; // quality has no effect on PNG
			}
		}
	} finally {
		bitmap.close();
	}
	return best && best.size < file.size ? best : file;
}

export function uploadName(blob: Blob, original: File): string {
	const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[blob.type];
	const base = original.name.replace(/\.[^.]+$/, '') || 'photo';
	return ext ? `${base}.${ext}` : original.name;
}
