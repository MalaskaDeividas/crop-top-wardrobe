import { useEffect, useMemo, useRef, useState } from 'react';
import {
	Camera,
	Check,
	ChevronDown,
	Trash2,
	Shirt,
	Save,
	Shuffle,
	Sparkles,
	User,
	X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api, ApiError, onGarmentsChange, type Garment, type Placement } from '@/lib/api-client';
import { prepareImage, uploadName } from '@/lib/image-resize';
import { CutoutPanel, useCutout } from './cutout-panel';
import { defaultPlace, DollStage, fitToZone, type LayerMove, type StageItem } from './doll-stage';
import { DollFigure } from './paper-avatar';

const CATEGORIES = ['head', 'torso', 'legs', 'feet', 'accessory'] as const;
type Category = (typeof CATEGORIES)[number];

const MOODS = [
	'confident', 'lazy', 'playful', 'rebellious', 'cozy', 'bold',
	'soft', 'mysterious', 'happy', 'moody',
] as const;
const VIBES = ['punk', 'preppy', 'streetwear', 'y2k', 'grunge', 'minimal', 'sporty', 'romantic', 'festival', 'office'] as const;
const WEATHER = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'hot', 'cold', 'mild', 'stormy', 'layering'] as const;
const COLORS = [
	'black', 'white', 'grey', 'red', 'pink', 'orange', 'yellow',
	'green', 'blue', 'purple', 'brown', 'beige', 'silver', 'gold', 'multi',
] as const;
const COLOR_HEX: Record<string, string> = {
	black: '#17121b', white: '#ffffff', grey: '#9a9a9a', red: '#d8392b',
	pink: '#e547a2', orange: '#e8841f', yellow: '#ecc31f', green: '#3fae5a',
	blue: '#3a6fd8', purple: '#8a4fd0', brown: '#7a4a2a', beige: '#d8c4a0',
	silver: '#c8c8d0', gold: '#d4af37', multi: 'linear-gradient(135deg,#e547a2,#a765cf,#3a6fd8)',
};

/** Accessories can stack; every other zone holds one piece at a time. */
const MAX_ACCESSORIES = 4;

type Placed = { garment: Garment; place: Placement };

const chip = (on: boolean) =>
	`border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-transform hover:-translate-y-0.5 ${
		on ? 'bg-black text-white shadow-[3px_3px_0_#e547a2]' : 'bg-white shadow-[2px_2px_0_#17121b]'
	}`;

/** A row of toggle chips: pick as many as you like, or "any" to clear the row. */
function FilterRow({
	label,
	options,
	picked,
	onToggle,
	onAny,
}: {
	label: string;
	options: readonly string[];
	picked: string[];
	onToggle: (value: string) => void;
	onAny: () => void;
}) {
	return (
		<>
			<span className="mb-1 block text-[11px] font-black uppercase tracking-wider">
				{label} {picked.length > 1 && <span className="text-[#7a617d]">· {picked.length} picked</span>}
			</span>
			<div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={`${label} (pick any number)`}>
				<button type="button" onClick={onAny} aria-pressed={picked.length === 0} className={chip(picked.length === 0)}>
					any
				</button>
				{options.map((o) => (
					<button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={picked.includes(o)} className={chip(picked.includes(o))}>
						{o}
					</button>
				))}
			</div>
		</>
	);
}

export function OutfitStudio() {
	const { user } = useAuth();

	// avatar customization
	const [open, setOpen] = useState(true);
	const [bodyType, setBodyType] = useState<'female' | 'male'>('female');
	const [hairColor, setHairColor] = useState('brown');
	const [eyeColor, setEyeColor] = useState('brown');
	const [skinColor, setSkinColor] = useState('fair');
	const [figure, setFigure] = useState<'collage' | 'photo'>('collage');
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [avatarId, setAvatarId] = useState<string | null>(null);
	const [avatarBusy, setAvatarBusy] = useState(false);
	const [avatarSaved, setAvatarSaved] = useState(false);
	const [avatarError, setAvatarError] = useState('');

	// own-photo avatar: picked file → AI cut-out → upload
	const [selfieFile, setSelfieFile] = useState<File | null>(null);
	const [selfiePreview, setSelfiePreview] = useState('');
	const [selfieUseCut, setSelfieUseCut] = useState(true);
	const [selfieBusy, setSelfieBusy] = useState(false);
	const selfieInput = useRef<HTMLInputElement>(null);
	const selfieCut = useCutout(selfieFile, 'item');

	// wardrobe + outfit
	const [garments, setGarments] = useState<Garment[]>([]);
	const [placed, setPlaced] = useState<Placed[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const needsFit = useRef(new Set<string>());
	const stageRef = useRef<HTMLDivElement>(null);
	// Generator filters: pick any number per row; an empty row means "any".
	const [moods, setMoods] = useState<string[]>([]);
	const [vibes, setVibes] = useState<string[]>([]);
	const [weathers, setWeathers] = useState<string[]>([]);
	const [colors, setColors] = useState<string[]>([]);
	const [outfitBusy, setOutfitBusy] = useState(false);
	const [outfitSaved, setOutfitSaved] = useState(false);
	const [outfitError, setOutfitError] = useState('');

	// drag from the wardrobe onto the doll (mouse and pen; on touch, tap adds)
	const [ghost, setGhost] = useState<{ url: string; x: number; y: number } | null>(null);
	const suppressClick = useRef(false);

	useEffect(() => {
		if (!user) return;
		let active = true;
		api.avatar
			.get()
			.then((a) => {
				if (!active || !a) return;
				setAvatarId(a.id);
				setBodyType(a.bodyType);
				setHairColor(a.hairColor);
				setEyeColor(a.eyeColor);
				setSkinColor(a.skinColor);
				setFigure(a.figure);
				setPhotoUrl(a.photoUrl);
			})
			.catch(() => {});
		api.garments
			.list()
			.then((rows) => active && setGarments(rows))
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [user]);

	// Pieces added or removed at the upload desk above show up here instantly.
	useEffect(() => {
		if (!user) return;
		return onGarmentsChange((e) => {
			if (e.action === 'create') {
				const rec = e.record;
				setGarments((prev) => [rec, ...prev.filter((g) => g.id !== rec.id)]);
				return;
			}
			const gone = e.record.id;
			setGarments((prev) => prev.filter((g) => g.id !== gone));
			setPlaced((prev) => prev.filter((p) => p.garment.id !== gone));
		});
	}, [user]);

	useEffect(() => {
		return () => {
			if (selfiePreview) URL.revokeObjectURL(selfiePreview);
		};
	}, [selfiePreview]);

	const byCategory = useMemo(() => {
		const map: Record<string, Garment[]> = {};
		for (const c of CATEGORIES) map[c] = [];
		for (const g of garments) {
			if (map[g.category]) map[g.category].push(g);
		}
		return map;
	}, [garments]);

	const pickedList = placed.map((p) => p.garment);
	const isPlaced = (g: Garment) => placed.some((p) => p.garment.id === g.id);

	const stageItems: StageItem[] = placed.map((p) => ({
		key: p.garment.id,
		name: p.garment.name,
		imageUrl: p.garment.imageUrl,
		category: p.garment.category,
		place: p.place,
	}));

	async function saveAvatar() {
		if (!user) return;
		setAvatarBusy(true);
		setAvatarError('');
		setAvatarSaved(false);
		try {
			const saved = await api.avatar.save({ bodyType, hairColor, eyeColor, skinColor, figure: figure === 'photo' && photoUrl ? 'photo' : 'collage' });
			setAvatarId(saved.id);
			setFigure(saved.figure);
			setAvatarSaved(true);
		} catch {
			setAvatarError('Could not save your avatar. Try again.');
		} finally {
			setAvatarBusy(false);
		}
	}

	function pickSelfie(file: File | null) {
		setSelfieFile(file);
		setSelfiePreview(file ? URL.createObjectURL(file) : '');
		setSelfieUseCut(true);
		setAvatarError('');
	}

	async function uploadSelfie() {
		if (!selfieFile) return;
		setSelfieBusy(true);
		setAvatarError('');
		try {
			const source = selfieCut.status === 'done' && selfieUseCut ? selfieCut.blob : selfieFile;
			const image = await prepareImage(source);
			const saved = await api.avatar.uploadPhoto(image, uploadName(image, selfieFile));
			setAvatarId(saved.id);
			setPhotoUrl(saved.photoUrl);
			setFigure('photo');
			pickSelfie(null);
			if (selfieInput.current) selfieInput.current.value = '';
		} catch (err) {
			setAvatarError(err instanceof ApiError && err.status < 500 ? err.message : 'Could not upload your photo. Try again.');
		} finally {
			setSelfieBusy(false);
		}
	}

	async function removeSelfie() {
		setSelfieBusy(true);
		setAvatarError('');
		try {
			await api.avatar.removePhoto();
			setPhotoUrl(null);
			setFigure('collage');
		} catch {
			setAvatarError('Could not remove your photo. Try again.');
		} finally {
			setSelfieBusy(false);
		}
	}

	// ── placing pieces on the doll ──
	function addGarment(g: Garment, at?: { x: number; y: number }) {
		setPlaced((prev) => {
			let list = prev.filter((p) => p.garment.id !== g.id);
			if (g.category === 'accessory') {
				const accessories = list.filter((p) => p.garment.category === 'accessory');
				if (accessories.length >= MAX_ACCESSORIES) list = list.filter((p) => p !== accessories[0]);
			} else {
				list = list.filter((p) => p.garment.category !== g.category);
			}
			const z = list.reduce((m, p) => Math.max(m, p.place.z), -1) + 1;
			const place = { ...defaultPlace(g.category, z), ...(at ?? {}) };
			needsFit.current.add(g.id);
			return [...list, { garment: g, place }];
		});
		setSelected(g.id);
		setOutfitSaved(false);
	}

	function removePlaced(id: string) {
		setPlaced((prev) => prev.filter((p) => p.garment.id !== id));
		setSelected((s) => (s === id ? null : s));
		setOutfitSaved(false);
	}

	function updatePlace(id: string, place: Placement) {
		setPlaced((prev) => prev.map((p) => (p.garment.id === id ? { ...p, place } : p)));
		setOutfitSaved(false);
	}

	/** Re-stacks the pieces (back to front) and renumbers layers 0…n. */
	function layer(id: string, move: LayerMove) {
		setPlaced((prev) => {
			const order = [...prev].sort((a, b) => a.place.z - b.place.z);
			const from = order.findIndex((p) => p.garment.id === id);
			if (from < 0) return prev;
			const to = { front: order.length - 1, back: 0, forward: Math.min(order.length - 1, from + 1), backward: Math.max(0, from - 1) }[move];
			const [me] = order.splice(from, 1);
			order.splice(to, 0, me);
			return order.map((p, z) => ({ ...p, place: { ...p.place, z } }));
		});
		setOutfitSaved(false);
	}

	function resetPlace(id: string) {
		setPlaced((prev) =>
			prev.map((p) => {
				if (p.garment.id !== id) return p;
				needsFit.current.add(id);
				return { ...p, place: defaultPlace(p.garment.category, p.place.z) };
			}),
		);
	}

	/** Once a fresh piece's image loads, shrink it to fit its body zone. */
	function fitOnLoad(id: string, aspect: number) {
		if (!needsFit.current.has(id)) return;
		needsFit.current.delete(id);
		setPlaced((prev) => prev.map((p) => (p.garment.id === id ? { ...p, place: fitToZone(p.place, p.garment.category, aspect) } : p)));
	}

	function toggleGarment(g: Garment) {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		if (isPlaced(g)) removePlaced(g.id);
		else addGarment(g);
	}

	function startWardrobeDrag(event: React.PointerEvent<HTMLButtonElement>, g: Garment) {
		if (event.pointerType === 'touch' || event.button !== 0) return; // touch: tap to add, then drag on the doll
		event.preventDefault(); // stop the browser's own image drag and text selection
		const startX = event.clientX;
		const startY = event.clientY;
		let dragging = false;

		const onMove = (e: PointerEvent) => {
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
			dragging = true;
			setGhost({ url: g.imageUrl, x: e.clientX, y: e.clientY });
		};
		const onUp = (e: PointerEvent) => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			setGhost(null);
			if (!dragging || e.type === 'pointercancel') return;
			suppressClick.current = true;
			setTimeout(() => (suppressClick.current = false), 0);
			const rect = stageRef.current?.getBoundingClientRect();
			if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
				addGarment(g, {
					x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10,
					y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10,
				});
			}
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}

	function clearOutfit() {
		setPlaced([]);
		setSelected(null);
		setOutfitSaved(false);
	}

	const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) =>
		setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

	/** How many of the active filter rows a piece satisfies (a row matches if any of its picks match). */
	function matchScore(g: Garment) {
		let score = 0;
		if (moods.length && g.moods.some((m) => moods.includes(m))) score += 1;
		if (vibes.length && g.vibes.some((v) => vibes.includes(v))) score += 1;
		if (weathers.length && g.weathers.some((w) => weathers.includes(w))) score += 1;
		if (colors.length && (g.colors || []).some((c) => colors.includes(c))) score += 1;
		return score;
	}

	/**
	 * One piece per zone. Prefers pieces matching every active row; if a zone has
	 * none, falls back to the pieces matching the most rows, so a fit always appears.
	 */
	function generateByMood() {
		const next: Placed[] = [];
		for (const c of CATEGORIES) {
			const pool = byCategory[c];
			if (pool.length === 0) continue;
			const scored = pool.map((g) => ({ g, score: matchScore(g) }));
			const best = Math.max(...scored.map((x) => x.score));
			const candidates = scored.filter((x) => x.score === best).map((x) => x.g);
			const g = candidates[Math.floor(Math.random() * candidates.length)];
			needsFit.current.add(g.id);
			next.push({ garment: g, place: defaultPlace(c, next.length) });
		}
		setPlaced(next);
		setSelected(null);
		setOutfitSaved(false);
	}

	async function saveOutfit() {
		if (!user || placed.length === 0) return;
		setOutfitBusy(true);
		setOutfitError('');
		setOutfitSaved(false);
		try {
			await api.outfits.create({
				title: `${moods.length ? moods.slice(0, 2).join(' + ') : 'my'} fit — ${new Date().toLocaleDateString()}`,
				items: [...placed]
					.sort((a, b) => a.place.z - b.place.z)
					.map(({ garment: g, place }) => ({ id: g.id, name: g.name, category: g.category, image: g.imageUrl, place })),
			});
			setOutfitSaved(true);
		} catch {
			setOutfitError('Could not save this outfit. Try again.');
		} finally {
			setOutfitBusy(false);
		}
	}

	return (
		<section className="bg-[#eee8dc] px-5 py-16 text-[#17121b] md:px-10 md:py-24">
			<div className="mx-auto max-w-[1380px]">
				<div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b-[3px] border-black pb-8">
					<div>
						<div className="mb-4 inline-block rotate-[-2deg] bg-[#a765cf] px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-white">
							THE OUTFIT BUILDER / 02
						</div>
						<h2 className="brand-type text-5xl leading-[.85] tracking-[-.07em] md:text-7xl">
							MIX &amp; <span className="text-[#e547a2]">MATCH.</span>
						</h2>
					</div>
					<p className="max-w-[340px] font-semibold leading-snug">
						Dress your paper doll with the pieces you uploaded. Pick a mood and let us
						generate a fit, or snip them on yourself.
					</p>
				</div>

				{/* Collapsible avatar customizer */}
				<div className="mb-8 border-[3px] border-black bg-white shadow-[6px_6px_0_#17121b]">
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						aria-expanded={open}
						className="flex w-full items-center justify-between gap-4 bg-[#17121b] px-5 py-4 text-left text-white"
					>
						<span className="flex items-center gap-3 text-sm font-black uppercase tracking-[.16em] md:text-base">
							<User size={18} /> Make your avatar
						</span>
						<span className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-[#c9bdca]">
							{avatarId ? 'Saved' : 'Not saved'}
							<ChevronDown
								size={22}
								className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
							/>
						</span>
					</button>

					{open && (
						<div className="grid gap-8 p-6 lg:grid-cols-[auto_1fr]">
							<div className="flex flex-wrap gap-6">
								<div className="w-full">
									<h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest">
										<Camera size={16} /> Figure
									</h3>
									<div className="flex flex-wrap gap-3">
										{(['collage', 'photo'] as const).map((value) => (
											<button
												key={value}
												type="button"
												onClick={() => {
													setFigure(value);
													setAvatarSaved(false);
												}}
												aria-pressed={figure === value}
												className={`border-2 border-black px-5 py-3 text-sm font-black uppercase tracking-wider transition-transform hover:-translate-y-1 ${
													figure === value ? 'bg-black text-white shadow-[4px_4px_0_#e547a2]' : 'bg-white shadow-[3px_3px_0_#17121b]'
												}`}
											>
												{value === 'collage' ? 'Collage cut-out' : 'My own photo'}
											</button>
										))}
									</div>

									{figure === 'photo' && (
										<div className="mt-4 max-w-[460px] border-2 border-black bg-[#f6f1e8] p-4">
											{photoUrl && !selfieFile ? (
												<div className="flex items-center gap-4">
													<img src={photoUrl} alt="Your avatar photo" className="h-24 w-16 border-2 border-black bg-white object-contain" />
													<div className="flex flex-wrap gap-2">
														<button type="button" onClick={() => selfieInput.current?.click()} disabled={selfieBusy} className="studio-button">
															<Camera size={15} /> Replace photo
														</button>
														<button
															type="button"
															onClick={removeSelfie}
															disabled={selfieBusy}
															className="flex min-h-11 items-center gap-2 border-2 border-black bg-white px-3 text-xs font-black uppercase tracking-widest hover:bg-red-100"
														>
															<Trash2 size={15} /> Remove
														</button>
													</div>
												</div>
											) : (
												<p className="text-xs font-semibold">
													Upload a full-length photo of yourself, standing and facing the camera. The AI cuts you out of the
													background right here in your browser.
												</p>
											)}
											<input
												ref={selfieInput}
												type="file"
												accept="image/jpeg,image/png,image/webp"
												className={`studio-input file:mr-3 file:border-0 file:bg-black file:px-3 file:py-2 file:text-xs file:font-bold file:text-white ${photoUrl && !selfieFile ? 'hidden' : ''}`}
												onChange={(e) => pickSelfie(e.target.files?.[0] || null)}
											/>
											{selfieFile && (
												<>
													<CutoutPanel
														originalUrl={selfiePreview}
														state={selfieCut}
														useCutout={selfieUseCut}
														onUseCutoutChange={setSelfieUseCut}
														notFoundMessage={() => "The AI couldn't find a person in this photo. The original photo will be used."}
													/>
													<div className="mt-3 flex flex-wrap gap-2">
														<button
															type="button"
															onClick={uploadSelfie}
															disabled={selfieBusy || selfieCut.status === 'working'}
															className="studio-button bg-[#e547a2]"
														>
															{selfieBusy ? 'Uploading…' : selfieCut.status === 'working' ? 'Cutting out…' : 'Use this photo'} <Save size={15} />
														</button>
														<button
															type="button"
															onClick={() => {
																pickSelfie(null);
																if (selfieInput.current) selfieInput.current.value = '';
															}}
															className="flex min-h-11 items-center gap-2 border-2 border-black bg-white px-3 text-xs font-black uppercase tracking-widest"
														>
															<X size={15} /> Cancel
														</button>
													</div>
												</>
											)}
										</div>
									)}
								</div>
							</div>

							<div className="flex flex-col items-start gap-3 lg:items-end lg:justify-end">
								{avatarError && (
									<p role="alert" className="font-bold text-red-700">{avatarError}</p>
								)}
								<button
									type="button"
									onClick={saveAvatar}
									disabled={avatarBusy}
									className="studio-button"
								>
									{avatarBusy ? 'Saving…' : avatarSaved ? 'Avatar saved!' : 'Save my avatar'}{' '}
									<Save size={17} />
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Avatar + wardrobe */}
				<div className="grid gap-8 lg:grid-cols-[420px_1fr]">
					{/* Dressed avatar */}
					<div className="relative h-fit border-[3px] border-black bg-white p-5 shadow-[10px_10px_0_#17121b]">
						<span className="absolute -left-4 top-6 rotate-[-12deg] bg-[#e547a2] px-3 py-1 text-xs font-black uppercase text-white shadow-[3px_3px_0_#17121b]">
							PAPER YOU
						</span>
						<DollStage
							ref={stageRef}
							className="mx-auto max-w-[320px]"
							figure={
								<DollFigure
									bodyType={bodyType}
									hairColor={hairColor}
									eyeColor={eyeColor}
									skinColor={skinColor}
									figure={figure}
									photoUrl={photoUrl}
								/>
							}
							items={stageItems}
							editable
							selected={selected}
							onSelect={setSelected}
							onChange={updatePlace}
							onRemove={removePlaced}
							onLayer={layer}
							onReset={resetPlace}
							onImageLoad={fitOnLoad}
						/>
						<div className="mt-4 flex items-center justify-between border-t-2 border-black pt-3 text-[10px] font-black uppercase tracking-[.22em]">
							<span>{pickedList.length} piece{pickedList.length === 1 ? '' : 's'} on</span>
							<button
								type="button"
								onClick={clearOutfit}
								disabled={pickedList.length === 0}
								className="flex items-center gap-1 text-[#7a617d] hover:text-red-600 disabled:opacity-40"
							>
								<X size={12} /> Clear
							</button>
						</div>
					</div>

					{/* Wardrobe + generator */}
					<div className="space-y-6">
						<div className="rotate-[1deg] border-[3px] border-black bg-[#d8b6ed] p-5 shadow-[6px_6px_0_#17121b]">
							<div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider">
								<Sparkles size={16} /> Generate a fit
							</div>

							<FilterRow label="Mood" options={MOODS} picked={moods} onToggle={toggleIn(setMoods)} onAny={() => setMoods([])} />
							<FilterRow label="Vibe" options={VIBES} picked={vibes} onToggle={toggleIn(setVibes)} onAny={() => setVibes([])} />
							<FilterRow label="Weather" options={WEATHER} picked={weathers} onToggle={toggleIn(setWeathers)} onAny={() => setWeathers([])} />

							<span className="mb-1 block text-[11px] font-black uppercase tracking-wider">
								Colors {colors.length ? `(${colors.length} picked)` : '— any'}
								{colors.length > 0 && (
									<button type="button" onClick={() => setColors([])} className="ml-2 underline">
										clear
									</button>
								)}
							</span>
							<div className="flex flex-wrap gap-2">
								{COLORS.map((c) => {
									const active = colors.includes(c);
									return (
										<button
											key={c}
											type="button"
											onClick={() => toggleIn(setColors)(c)}
											aria-pressed={active}
											aria-label={c}
											title={c}
											className={`h-9 w-9 border-2 border-black transition-transform hover:-translate-y-1 ${
												active ? 'shadow-[3px_3px_0_#e547a2]' : 'shadow-[2px_2px_0_#17121b]'
											}`}
											style={{ background: COLOR_HEX[c] }}
										>
											{active && <Check size={16} className="mx-auto text-white drop-shadow-[0_1px_0_#17121b]" />}
										</button>
									);
								})}
							</div>
							<div className="mt-4 flex flex-wrap gap-3">
								<button
									type="button"
									onClick={generateByMood}
									disabled={garments.length === 0}
									className="studio-button"
								>
									<Shuffle size={16} /> Generate outfit
								</button>
								<button
									type="button"
									onClick={saveOutfit}
									disabled={outfitBusy || pickedList.length === 0}
									className="studio-button bg-[#e547a2] text-white"
								>
									{outfitBusy ? 'Saving…' : outfitSaved ? 'Outfit saved!' : 'Save this look'}{' '}
									<Save size={16} />
								</button>
							</div>
							{outfitError && (
								<p role="alert" className="mt-3 font-bold text-red-700">{outfitError}</p>
							)}
							{garments.length === 0 && (
								<p className="mt-3 text-xs font-semibold text-[#5a4a5e]">
									Upload some pieces above first — your wardrobe is empty.
								</p>
							)}
						</div>

						<div>
							<h3 className="brand-type mb-4 flex items-center gap-2 text-3xl">
								<Shirt size={24} /> YOUR WARDROBE
							</h3>
							{garments.length === 0 ? (
								<div className="border-2 border-dashed border-black p-10 text-center">
									<Shirt className="mx-auto mb-3" size={36} />
									<p className="brand-type text-2xl">EMPTY CLOSET.</p>
									<p className="mt-2 text-sm font-medium">
										Add pieces at the upload desk above to start mixing.
									</p>
								</div>
							) : (
								<div className="space-y-5">
									{CATEGORIES.map((c) => {
										const items = byCategory[c];
										if (items.length === 0) return null;
										return (
											<div key={c}>
												<div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
													<span className="bg-[#17121b] px-2 py-1 text-white">{c}</span>
													<span className="text-[#7a617d]">{items.length} piece{items.length === 1 ? '' : 's'}</span>
												</div>
												<div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
													{items.map((g) => {
														const active = isPlaced(g);
														return (
															<button
																key={g.id}
																type="button"
																onClick={() => toggleGarment(g)}
																onPointerDown={(e) => startWardrobeDrag(e, g)}
																aria-pressed={active}
																title={`${g.name} · ${[...g.moods, ...g.vibes, ...g.weathers].join(', ')} — click to put on, or drag onto the doll`}
																className={`relative border-2 border-black bg-white p-1.5 text-left transition-transform hover:-translate-y-1 ${
																	active
																		? 'shadow-[4px_4px_0_#e547a2]'
																		: 'shadow-[3px_3px_0_#17121b]'
																}`}
															>
																<img
																	draggable={false}
																	src={g.imageUrl}
																	alt={g.name}
																	className="aspect-square w-full bg-[#eee8dc] object-contain"
																/>
																<span className="mt-1 block truncate text-[10px] font-black uppercase">
																	{g.name}
																</span>
																<span className="block truncate text-[9px] font-bold uppercase text-[#7a617d]">
																	{g.moods.join(' · ')}
																</span>
																{active && (
																	<span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-[#e547a2] text-white">
																		<Check size={12} />
																	</span>
																)}
															</button>
														);
													})}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			{ghost && (
				<img
					src={ghost.url}
					alt=""
					aria-hidden
					className="pointer-events-none fixed z-50 w-24 -translate-x-1/2 -translate-y-1/2 rotate-3 opacity-90 drop-shadow-[4px_5px_0_rgba(23,18,27,0.4)]"
					style={{ left: ghost.x, top: ghost.y }}
				/>
			)}
		</section>
	);
}
