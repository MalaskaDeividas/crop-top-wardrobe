/**
 * Background worker that runs the cut-out AI models in the visitor's browser.
 *
 * Nothing is bundled into the site: Transformers.js comes from jsDelivr and the
 * model weights from Hugging Face's CDN, downloaded once and then cached by the
 * browser. Two models, each loaded only when first needed:
 *
 *   item → BRIA RMBG-1.4 (≈44 MB): keeps the main object, for flat-lay,
 *          hanger and product photos (and for avatar photos of a person).
 *   worn → SegFormer-B2 clothes (≈29 MB): labels clothing on a person, so
 *          only the chosen piece (top, pants, shoes…) is kept.
 *
 * LICENSES: both models are licensed for non-commercial use only. Before
 * using the app commercially, swap ITEM_MODEL for a permissive one (for example
 * onnx-community/BiRefNet_lite-ONNX, MIT, ≈115 MB) and get a commercial licence
 * or replacement for the clothing model.
 */

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const ITEM_MODEL = 'briaai/RMBG-1.4';
const WORN_MODEL = 'Xenova/segformer_b2_clothes';

export type CutoutRequest = {
	id: number;
	mode: 'item' | 'worn';
	/** For `worn`: clothing labels to keep, e.g. ['Pants', 'Skirt']. */
	labels: string[];
	image: Blob;
};

export type CutoutResponse =
	| { id: number; type: 'progress'; stage: 'download' | 'thinking'; progress: number | null }
	| { id: number; type: 'result'; mask: Uint8Array; width: number; height: number; found: string[] }
	| { id: number; type: 'error'; message: string };

// Minimal shapes of the Transformers.js API used here (loaded at runtime from the CDN).
type RawImageLike = { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number; resize(w: number, h: number): Promise<RawImageLike> };
type Lib = {
	env: { allowLocalModels: boolean };
	RawImage: { fromBlob(blob: Blob): Promise<RawImageLike>; fromTensor(t: unknown): RawImageLike };
	AutoModel: { from_pretrained(id: string, opts: object): Promise<(inputs: object) => Promise<{ output: TensorLike }>> };
	AutoProcessor: { from_pretrained(id: string, opts: object): Promise<(image: RawImageLike) => Promise<{ pixel_values: unknown }>> };
	pipeline(task: string, id: string, opts: object): Promise<(image: RawImageLike) => Promise<Array<{ label: string; mask: RawImageLike }>>>;
};
type TensorLike = { [index: number]: TensorLike; mul(n: number): TensorLike; to(type: string): TensorLike };

// Typed by hand: the app's tsconfig uses the DOM lib, which clashes with the WebWorker lib.
type WorkerScope = {
	postMessage(message: CutoutResponse, transfer: Transferable[]): void;
	onmessage: ((event: MessageEvent<CutoutRequest>) => void) | null;
};
const ctx = self as unknown as WorkerScope;
const post = (message: CutoutResponse, transfer: Transferable[] = []) => ctx.postMessage(message, transfer);

// Hugging Face answers requests whose Referer is a *.workers.dev address with a
// 404 page and no CORS headers, so the model downloads fail with "Failed to fetch"
// once the site is hosted (localhost is fine). This worker only fetches from the
// model/runtime CDNs, so send every request without a Referer.
const originalFetch = self.fetch.bind(self);
self.fetch = (input, init) => originalFetch(input, { ...init, referrerPolicy: 'no-referrer' });

let libPromise: Promise<Lib> | null = null;
const loadLib = () =>
	(libPromise ??= import(/* @vite-ignore */ TRANSFORMERS_URL).then((lib: Lib) => {
		lib.env.allowLocalModels = false; // always fetch from the Hugging Face CDN, never from this site
		return lib;
	}));

/** Reports one combined download percentage across a model's files. */
function downloadTracker(id: number) {
	const files = new Map<string, { loaded: number; total: number }>();
	return (event: { status: string; file?: string; loaded?: number; total?: number }) => {
		if (event.status !== 'progress' || !event.file || !event.total) return;
		files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
		let loaded = 0;
		let total = 0;
		files.forEach((f) => {
			loaded += f.loaded;
			total += f.total;
		});
		post({ id, type: 'progress', stage: 'download', progress: total ? loaded / total : null });
	};
}

let itemModel: Promise<{ model: Awaited<ReturnType<Lib['AutoModel']['from_pretrained']>>; processor: Awaited<ReturnType<Lib['AutoProcessor']['from_pretrained']>> }> | null = null;
let wornModel: ReturnType<Lib['pipeline']> | null = null;

function getItemModel(id: number) {
	itemModel ??= loadLib().then(async (lib) => {
		const progress_callback = downloadTracker(id);
		const [model, processor] = await Promise.all([
			// RMBG-1.4 ships without a Transformers.js config, so it is described here
			// (this mirrors the model card's own Transformers.js example).
			lib.AutoModel.from_pretrained(ITEM_MODEL, { config: { model_type: 'custom' }, dtype: 'q8', device: 'wasm', progress_callback }),
			lib.AutoProcessor.from_pretrained(ITEM_MODEL, {
				config: {
					do_normalize: true,
					do_pad: false,
					do_rescale: true,
					do_resize: true,
					image_mean: [0.5, 0.5, 0.5],
					feature_extractor_type: 'ImageFeatureExtractor',
					image_std: [1, 1, 1],
					resample: 2,
					rescale_factor: 0.00392156862745098,
					size: { width: 1024, height: 1024 },
				},
				progress_callback,
			}),
		]);
		return { model, processor };
	});
	itemModel.catch(() => (itemModel = null)); // allow a retry after a failed download
	return itemModel;
}

function getWornModel(id: number) {
	wornModel ??= loadLib().then((lib) =>
		lib.pipeline('image-segmentation', WORN_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: downloadTracker(id) }),
	);
	wornModel.catch(() => (wornModel = null));
	return wornModel;
}

async function toSize(mask: RawImageLike, width: number, height: number) {
	return mask.width === width && mask.height === height ? mask : mask.resize(width, height);
}

async function run(req: CutoutRequest) {
	const lib = await loadLib();
	const image = await lib.RawImage.fromBlob(req.image);
	const { width, height } = image;
	const mask = new Uint8Array(width * height);

	if (req.mode === 'item') {
		const { model, processor } = await getItemModel(req.id);
		post({ id: req.id, type: 'progress', stage: 'thinking', progress: null });
		const { pixel_values } = await processor(image);
		const { output } = await model({ input: pixel_values });
		const alpha = await toSize(lib.RawImage.fromTensor(output[0].mul(255).to('uint8')), width, height);
		mask.set(alpha.data.length === mask.length ? alpha.data : alpha.data.filter((_, i) => i % alpha.channels === 0));
		return { mask, width, height, found: [] as string[] };
	}

	const segment = await getWornModel(req.id);
	post({ id: req.id, type: 'progress', stage: 'thinking', progress: null });
	const parts = await segment(image);
	const wanted = new Set(req.labels);
	for (const part of parts) {
		if (!wanted.has(part.label)) continue;
		const m = await toSize(part.mask, width, height);
		const step = m.channels || 1;
		for (let i = 0; i < mask.length; i += 1) if (m.data[i * step] > 127) mask[i] = 255;
	}
	const ignore = new Set(['Background', 'Hair', 'Face', 'Left-arm', 'Right-arm', 'Left-leg', 'Right-leg']);
	const found = parts.map((p) => p.label).filter((l) => !ignore.has(l));
	return { mask, width, height, found };
}

async function handle(req: CutoutRequest) {
	try {
		const result = await run(req);
		post({ id: req.id, type: 'result', ...result }, [result.mask.buffer]);
	} catch (error) {
		post({ id: req.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
	}
}

// One job at a time: the model sessions aren't safe to run concurrently, and a
// queue keeps quick option changes from piling up parallel inference.
let queue: Promise<void> = Promise.resolve();
ctx.onmessage = (event: MessageEvent<CutoutRequest>) => {
	queue = queue.then(() => handle(event.data));
};
