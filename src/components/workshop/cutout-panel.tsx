import { useEffect, useState } from 'react';
import { Loader2, Scissors, TriangleAlert } from 'lucide-react';
import { cutOut, CutoutError, cutoutSupported, type CutoutMode, type CutoutProgress } from '@/lib/cutout';

export type CutoutState =
	| { status: 'idle' }
	| { status: 'skipped'; message: string }
	| { status: 'working'; progress: CutoutProgress | null }
	| { status: 'done'; blob: Blob; url: string; found: string[] }
	| { status: 'error'; code: CutoutError['code']; found: string[]; message: string };

/** Runs the cut-out AI whenever the photo, mode or wanted labels change. */
export function useCutout(file: Blob | null, mode: CutoutMode, labels: string[] = []): CutoutState {
	const [state, setState] = useState<CutoutState>({ status: 'idle' });
	const labelKey = labels.join(',');

	useEffect(() => {
		if (!file) {
			setState({ status: 'idle' });
			return;
		}
		if (file.type === 'image/gif') {
			setState({ status: 'skipped', message: 'GIFs keep their animation, so they are added as they are.' });
			return;
		}
		if (!cutoutSupported()) {
			setState({ status: 'error', code: 'unsupported', found: [], message: "This browser can't run the cut-out AI, so the original photo will be used." });
			return;
		}

		let live = true;
		let url = '';
		setState({ status: 'working', progress: null });
		cutOut(file, { mode, labels: labelKey ? labelKey.split(',') : [], onProgress: (progress) => live && setState({ status: 'working', progress }) })
			.then((result) => {
				if (!live) return;
				url = URL.createObjectURL(result.blob);
				setState({ status: 'done', blob: result.blob, url, found: result.found });
			})
			.catch((error: unknown) => {
				if (!live) return;
				const e = error instanceof CutoutError ? error : new CutoutError('failed', String(error));
				setState({ status: 'error', code: e.code, found: e.found, message: e.message });
			});

		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [file, mode, labelKey]);

	return state;
}

const CHECKER = { background: 'repeating-conic-gradient(#e9e2d4 0% 25%, #ffffff 0% 50%) 0 0 / 14px 14px' };

function progressText(p: CutoutProgress | null) {
	if (!p) return 'Starting the cut-out AI…';
	if (p.stage === 'thinking') return 'Snipping it out…';
	const pct = p.progress == null ? '' : ` ${Math.round(p.progress * 100)}%`;
	return `Fetching the AI model (first time only)${pct}`;
}

/** Original vs cut-out preview with a toggle for which one to keep. */
export function CutoutPanel({
	originalUrl,
	state,
	useCutout,
	onUseCutoutChange,
	notFoundMessage,
}: {
	originalUrl: string;
	state: CutoutState;
	useCutout: boolean;
	onUseCutoutChange: (value: boolean) => void;
	/** Message when the model found nothing to keep; receives what it did spot. */
	notFoundMessage?: (found: string[]) => string;
}) {
	if (!originalUrl) return null;
	const done = state.status === 'done';
	const chosen = done && useCutout ? 'cutout' : 'original';

	let note: React.ReactNode = null;
	if (state.status === 'working') {
		const pct = state.progress?.stage === 'download' && state.progress.progress != null ? state.progress.progress : null;
		note = (
			<div className="flex flex-col gap-2">
				<span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {progressText(state.progress)}</span>
				{pct != null && (
					<span className="block h-2 w-full border border-black bg-white">
						<span className="block h-full bg-[#e547a2] transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
					</span>
				)}
			</div>
		);
	} else if (state.status === 'error') {
		const msg =
			state.code === 'nothing-found' && notFoundMessage
				? notFoundMessage(state.found)
				: state.code === 'nothing-found'
					? "The AI couldn't find anything to cut out. The original photo will be used."
					: state.code === 'unsupported'
						? state.message
						: "The cut-out AI couldn't run right now, so the original photo will be used.";
		note = <span className="flex items-start gap-2 text-red-700"><TriangleAlert size={14} className="mt-0.5 shrink-0" /> {msg}</span>;
	} else if (state.status === 'skipped') {
		note = <span>{state.message}</span>;
	}

	const tile = (label: string, which: 'original' | 'cutout', content: React.ReactNode, enabled: boolean) => (
		<button
			type="button"
			disabled={!enabled}
			onClick={() => onUseCutoutChange(which === 'cutout')}
			aria-pressed={chosen === which}
			className={`relative flex flex-col border-2 border-black bg-white p-1.5 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-default ${
				chosen === which ? 'shadow-[3px_3px_0_#e547a2]' : 'shadow-[2px_2px_0_#17121b] opacity-80'
			}`}
		>
			<span className="relative flex aspect-square w-full items-center justify-center overflow-hidden" style={CHECKER}>
				{content}
			</span>
			<span className="mt-1 text-[10px] font-black uppercase tracking-wider">
				{label} {chosen === which && '✓'}
			</span>
		</button>
	);

	return (
		<div className="mt-3">
			<div className="grid grid-cols-2 gap-3">
				{tile('Original', 'original', <img src={originalUrl} alt="Original photo" className="h-full w-full object-contain" />, done)}
				{tile(
					'AI cut-out',
					'cutout',
					done ? (
						<img src={state.url} alt="Cut-out preview" className="h-full w-full object-contain drop-shadow-[2px_3px_0_#17121b55]" />
					) : (
						<Scissors size={28} className={state.status === 'working' ? 'animate-pulse' : 'opacity-30'} />
					),
					done,
				)}
			</div>
			{note && <div className="mt-2 text-xs font-bold">{note}</div>}
		</div>
	);
}
