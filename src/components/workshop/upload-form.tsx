import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { api, ApiError, type Garment } from '@/lib/api-client';
import { prepareImage, uploadName } from '@/lib/image-resize';
import { WORN_LABELS, type CutoutMode } from '@/lib/cutout';
import { CutoutPanel, useCutout } from './cutout-panel';

const CATEGORIES = ['head', 'torso', 'legs', 'feet', 'accessory'] as const;
const COLORS = [
	'black', 'white', 'grey', 'red', 'pink', 'orange', 'yellow',
	'green', 'blue', 'purple', 'brown', 'beige', 'silver', 'gold', 'multi',
] as const;
const MOODS = ['confident', 'lazy', 'playful', 'rebellious', 'cozy', 'bold', 'soft', 'mysterious', 'happy', 'moody'] as const;
const VIBES = ['punk', 'preppy', 'streetwear', 'y2k', 'grunge', 'minimal', 'sporty', 'romantic', 'festival', 'office'] as const;
const WEATHER = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'hot', 'cold', 'mild', 'stormy', 'layering'] as const;

const PHOTO_TYPES: { value: CutoutMode; label: string }[] = [
	{ value: 'item', label: 'just the item' },
	{ value: 'worn', label: 'someone wearing it' },
];

const COLOR_HEX: Record<string, string> = {
	black: '#17121b', white: '#ffffff', grey: '#9a9a9a', red: '#d8392b',
	pink: '#e547a2', orange: '#e8841f', yellow: '#ecc31f', green: '#3fae5a',
	blue: '#3a6fd8', purple: '#8a4fd0', brown: '#7a4a2a', beige: '#d8c4a0',
	silver: '#c8c8d0', gold: '#d4af37', multi: 'linear-gradient(135deg,#e547a2,#a765cf,#3a6fd8)',
};

function ChipRow({
	options,
	value,
	onPick,
	multi = false,
}: {
	options: readonly string[];
	value: string | string[];
	onPick: (v: string) => void;
	multi?: boolean;
}) {
	const selected = (v: string) => (multi ? (value as string[]).includes(v) : value === v);
	return (
		<div className="flex flex-wrap gap-2">
			{options.map((opt) => (
				<button
					key={opt}
					type="button"
					onClick={() => onPick(opt)}
					aria-pressed={selected(opt)}
					className={`border-2 border-black px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-transform hover:-translate-y-0.5 ${
						selected(opt) ? 'bg-black text-white shadow-[3px_3px_0_#e547a2]' : 'bg-white shadow-[2px_2px_0_#17121b]'
					}`}
				>
					{opt}
				</button>
			))}
		</div>
	);
}

function TagLabel({ text, count }: { text: string; count: number }) {
	return (
		<span className="text-xs font-black uppercase tracking-wider">
			{text} <span className="text-[#5a4a5e]">— pick all that fit{count > 1 ? ` (${count})` : ''}</span>
		</span>
	);
}

export function UploadForm() {
	const { user } = useAuth();
	const [name, setName] = useState('');
	const [category, setCategory] = useState<string>('head');
	const [colors, setColors] = useState<string[]>([]);
	// Tags: pick as many as fit (at least one each).
	const [moods, setMoods] = useState<string[]>(['confident']);
	const [vibes, setVibes] = useState<string[]>(['punk']);
	const [weathers, setWeathers] = useState<string[]>(['sunny']);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState('');
	const [photoType, setPhotoType] = useState<CutoutMode>('item');
	const [useCut, setUseCut] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [garments, setGarments] = useState<Garment[]>([]);
	const fileRef = useRef<HTMLInputElement>(null);
	// The AI re-runs when the photo changes, and for "worn" photos also when the
	// category changes, since that decides which piece of clothing to keep.
	const cut = useCutout(file, photoType, photoType === 'worn' ? WORN_LABELS[category] : []);

	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview);
		};
	}, [preview]);

	useEffect(() => {
		if (!user) return;
		let active = true;
		api.garments
			.list()
			.then((rows) => active && setGarments(rows))
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [user]);

	const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) =>
		setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
	const pickColor = toggleIn(setColors);

	function onFile(target: File | null) {
		setFile(target);
		setPreview(target ? URL.createObjectURL(target) : '');
		setUseCut(true);
	}

	async function upload(event: React.FormEvent) {
		event.preventDefault();
		if (!file || !user) {
			setError('Choose an image to add.');
			return;
		}
		const missing = [
			['color', colors],
			['mood', moods],
			['vibe', vibes],
			['weather', weathers],
		].find(([, list]) => (list as string[]).length === 0);
		if (missing) {
			setError(`Pick at least one ${missing[0]}.`);
			return;
		}
		setBusy(true);
		setError('');
		try {
			const data = new FormData();
			data.append('name', name.trim() || category);
			data.append('category', category);
			colors.forEach((c) => data.append('colors', c));
			moods.forEach((m) => data.append('mood', m));
			vibes.forEach((v) => data.append('vibe', v));
			weathers.forEach((w) => data.append('weather', w));
			const source = cut.status === 'done' && useCut ? cut.blob : file;
			const image = await prepareImage(source);
			data.append('image', image, uploadName(image, file));
			const created = await api.garments.create(data);
			setGarments((prev) => [created, ...prev]);
			setName('');
			setColors([]);
			onFile(null);
			if (fileRef.current) fileRef.current.value = '';
		} catch (err) {
			setError(
				err instanceof ApiError && err.status < 500
					? `Could not add this piece. ${err.message}`
					: 'Could not add this piece. Try again.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string) {
		try {
			await api.garments.remove(id);
			setGarments((prev) => prev.filter((g) => g.id !== id));
		} catch {
			setError('Could not remove that piece.');
		}
	}

	return (
		<section className="hero-paper border-t-[3px] border-black px-5 py-16 text-[#17121b] md:px-10 md:py-24">
			<div className="mx-auto max-w-[1380px]">
				<div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b-[3px] border-black pb-8">
					<div>
						<div className="mb-4 inline-block rotate-[-2deg] bg-[#e547a2] px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-white">
							THE UPLOAD DESK / 01
						</div>
						<h2 className="brand-type text-5xl leading-[.85] tracking-[-.07em] md:text-7xl">
							ADD A <span className="text-[#a765cf]">PIECE.</span>
						</h2>
					</div>
					<p className="max-w-[340px] font-semibold leading-snug">
						Tell us what it is, what colors it wears, and the mood it brings before it
						goes in the closet.
					</p>
				</div>

				<div className="grid gap-8 lg:grid-cols-[440px_1fr]">
					<form
						onSubmit={upload}
						className="h-fit rotate-[-1deg] border-[3px] border-black bg-[#d8b6ed] p-6 shadow-[7px_7px_0_#17121b]"
					>
						<div className="mb-6 flex items-center gap-3">
							<ImagePlus size={27} />
							<h3 className="brand-type text-3xl">THE FORM</h3>
						</div>

						<label className="block text-xs font-black uppercase tracking-wider">
							What is it called?
							<input
								className="studio-input"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={120}
								placeholder="My ripped denim jacket"
							/>
						</label>

						<div className="mt-5">
							<span className="text-xs font-black uppercase tracking-wider">Where does it go?</span>
							<ChipRow options={CATEGORIES} value={category} onPick={setCategory} />
						</div>

						<div className="mt-5">
							<span className="text-xs font-black uppercase tracking-wider">
								Colors — pick all that apply {colors.length > 0 && `(${colors.length})`}
							</span>
							<div className="mt-2 flex flex-wrap gap-2">
								{COLORS.map((c) => {
									const active = colors.includes(c);
									return (
										<button
											key={c}
											type="button"
											onClick={() => pickColor(c)}
											aria-pressed={active}
											aria-label={c}
											title={c}
											className={`h-9 w-9 border-2 border-black transition-transform hover:-translate-y-1 ${
												active ? 'shadow-[3px_3px_0_#e547a2]' : 'shadow-[2px_2px_0_#17121b]'
											}`}
											style={{ background: COLOR_HEX[c] }}
										>
											{active && <span className="block text-center text-sm font-black text-white drop-shadow-[0_1px_0_#17121b]">✓</span>}
										</button>
									);
								})}
							</div>
						</div>

						<div className="mt-5">
							<TagLabel text="Moods it gives you" count={moods.length} />
							<ChipRow options={MOODS} value={moods} onPick={toggleIn(setMoods)} multi />
						</div>

						<div className="mt-5">
							<TagLabel text="Vibes" count={vibes.length} />
							<ChipRow options={VIBES} value={vibes} onPick={toggleIn(setVibes)} multi />
						</div>

						<div className="mt-5">
							<TagLabel text="Weather it's for" count={weathers.length} />
							<ChipRow options={WEATHER} value={weathers} onPick={toggleIn(setWeathers)} multi />
						</div>

						<label className="mt-5 block text-xs font-black uppercase tracking-wider">
							Clothing photo
							<input
								ref={fileRef}
								className="studio-input file:mr-3 file:border-0 file:bg-black file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								onChange={(e) => onFile(e.target.files?.[0] || null)}
								required
							/>
						</label>
						<div className="mt-4">
							<span className="text-xs font-black uppercase tracking-wider">The photo shows</span>
							<ChipRow
								options={PHOTO_TYPES.map((t) => t.label)}
								value={PHOTO_TYPES.find((t) => t.value === photoType)!.label}
								onPick={(label) => setPhotoType(PHOTO_TYPES.find((t) => t.label === label)!.value)}
							/>
						</div>
						<CutoutPanel
							originalUrl={preview}
							state={cut}
							useCutout={useCut}
							onUseCutoutChange={setUseCut}
							notFoundMessage={(found) =>
								photoType === 'worn'
									? `Couldn't spot any ${category} clothing on the person.${
											found.length ? ` It did see: ${found.join(', ').toLowerCase()} — try a different "Where does it go?".` : ''
										} The original photo will be used.`
									: "The AI couldn't find a piece of clothing to cut out. The original photo will be used."
							}
						/>
						<p className="mt-2 text-xs font-semibold">
							JPG, PNG, WebP or GIF. The AI runs in your browser, so the photo never leaves your device until you add it.
						</p>

						{error && <p role="alert" className="mt-4 font-bold text-red-700">{error}</p>}
						<button disabled={busy || cut.status === 'working'} className="studio-button mt-6 w-full justify-center">
							{busy ? 'Adding…' : cut.status === 'working' ? 'Cutting out…' : 'Add to wardrobe'} <Plus size={18} />
						</button>
					</form>

					<div>
						<h3 className="brand-type mb-5 text-4xl">
							UPLOADED <span className="text-[#a765cf]">({garments.length})</span>
						</h3>
						{garments.length === 0 ? (
							<div className="border-2 border-dashed border-black p-12 text-center">
								<ImagePlus className="mx-auto mb-4" size={40} />
								<p className="brand-type text-3xl">YOUR BLANK CANVAS.</p>
								<p className="mt-2 font-medium">Fill the form and add your first piece.</p>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
								{garments.map((g, i) => (
									<div
										key={g.id}
										className={`relative border-2 border-black bg-white p-2 shadow-[4px_4px_0_#17121b] ${
											i % 2 ? 'rotate-[1deg]' : 'rotate-[-1deg]'
										}`}
									>
										<img
											src={g.imageUrl}
											alt={g.name}
											className="aspect-square w-full bg-[#eee8dc] object-contain"
										/>
										<span className="mt-2 block truncate text-xs font-black uppercase">{g.name}</span>
										<span className="text-[10px] font-bold uppercase text-[#7a617d]">{g.category}</span>
										<div className="mt-1 flex flex-wrap gap-1">
											{(g.colors || []).map((c) => (
												<span
													key={c}
													aria-label={c}
													className="h-3 w-3 border border-black"
													style={{ background: COLOR_HEX[c] || '#ccc' }}
												/>
											))}
										</div>
										<div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold uppercase text-[#5a4a5e]">
											{[...g.moods, ...g.vibes, ...g.weathers].map((tag, i) => (
												<span key={`${tag}-${i}`} className="border border-[#5a4a5e] px-1">
													{tag}
												</span>
											))}
										</div>
										<button
											className="absolute bottom-2 right-2 bg-white p-1 hover:text-red-600"
											aria-label={`Delete ${g.name}`}
											onClick={() => remove(g.id)}
										>
											<Trash2 size={15} />
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
