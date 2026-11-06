type BodyType = 'female' | 'male';

type Props = {
	bodyType: BodyType;
	hairColor: string;
	eyeColor: string;
	skinColor: string;
};

export const SKIN_TONES: Record<string, string> = {
	light: '#f8d9c0',
	fair: '#f1c6a5',
	tan: '#e0a878',
	olive: '#c98e5e',
	brown: '#8a5a3b',
	deep: '#5c3a24',
};

export const HAIR_COLORS: Record<string, string> = {
	black: '#1a1a1a',
	brown: '#5a3a22',
	blonde: '#e8c870',
	red: '#b5421f',
	pink: '#e547a2',
	blue: '#3a6fd8',
	purple: '#8a4fd0',
	white: '#f0f0f0',
	grey: '#9a9a9a',
	green: '#3fae5a',
};

export const EYE_COLORS: Record<string, string> = {
	brown: '#5a3a1a',
	blue: '#3a6fd8',
	green: '#3fae5a',
	hazel: '#8a6a2a',
	grey: '#7a7a7a',
	black: '#1a1a1a',
	amber: '#c8861a',
};

/**
 * Collage cut-out figure — B&W stage photo with hot-pink paper shapes.
 *
 * Still hosted on Hostinger's CDN, which may stop serving it once the Hostinger
 * project is gone. Download it to `public/paper-doll.png` and set this to
 * '/paper-doll.png' so Cloudflare serves it with the rest of the site.
 */
export const AVATAR_PNG =
	'/paper-doll.png';

/**
 * PNG collage avatar (like a magazine cut-out). Hair / eye / skin swatches
 * tint the figure with CSS filters so the saved avatar prefs still matter.
 */
export function PaperAvatar({ hairColor, eyeColor, skinColor }: Props) {
	const hair = HAIR_COLORS[hairColor] ?? HAIR_COLORS.brown;
	const eye = EYE_COLORS[eyeColor] ?? EYE_COLORS.brown;
	const skin = SKIN_TONES[skinColor] ?? SKIN_TONES.fair;

	// Map swatches → subtle filter stack so the B&W collage picks up color mood
	const hue =
		hairColor === 'pink' || hairColor === 'red'
			? 320
			: hairColor === 'blue' || hairColor === 'purple'
				? 260
				: hairColor === 'green'
					? 120
					: hairColor === 'blonde'
						? 40
						: 0;
	const warm =
		skinColor === 'deep' || skinColor === 'brown'
			? 0.85
			: skinColor === 'light' || skinColor === 'fair'
				? 1.08
				: 1;
	const sat = eyeColor === 'blue' || eyeColor === 'green' ? 1.15 : 1;

	return (
		<div
			className="relative h-full w-full"
			role="img"
			aria-label={`Collage avatar with ${hairColor} hair, ${eyeColor} eyes and ${skinColor} skin`}
		>
			{/* torn-paper shadow */}
			<div
				className="pointer-events-none absolute inset-x-[12%] bottom-[2%] h-4 rounded-[100%] bg-[#17121b] opacity-25 blur-[2px]"
				aria-hidden
			/>

			{/* pink paper silhouette behind the cut-out */}
			<div
				className="pointer-events-none absolute inset-[4%] -rotate-2 bg-[#ff4db8] opacity-90"
				style={{
					clipPath:
						'polygon(18% 4%, 72% 0%, 96% 18%, 88% 48%, 100% 78%, 70% 100%, 28% 96%, 4% 72%, 10% 40%, 0% 16%)',
				}}
				aria-hidden
			/>

			<img
				src={AVATAR_PNG}
				alt=""
				draggable={false}
				className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[4px_6px_0_#17121b55]"
				style={{
					filter: `hue-rotate(${hue}deg) brightness(${warm}) saturate(${sat}) contrast(1.05)`,
				}}
			/>

			{/* tiny color chips so saved prefs stay visible on the frame */}
			<div
				className="absolute bottom-2 left-2 z-20 flex gap-1 border-2 border-black bg-white p-1 shadow-[2px_2px_0_#17121b]"
				aria-hidden
			>
				<span className="h-3 w-3 border border-black" style={{ background: hair }} title="hair" />
				<span className="h-3 w-3 border border-black" style={{ background: eye }} title="eyes" />
				<span className="h-3 w-3 border border-black" style={{ background: skin }} title="skin" />
			</div>
		</div>
	);
}

/** The user's own cut-out photo, on the same pink paper backing as the collage. */
export function PhotoAvatar({ src }: { src: string }) {
	return (
		<div className="relative h-full w-full" role="img" aria-label="Your own photo avatar">
			<div
				className="pointer-events-none absolute inset-x-[12%] bottom-[2%] h-4 rounded-[100%] bg-[#17121b] opacity-25 blur-[2px]"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-[4%] -rotate-2 bg-[#ff4db8] opacity-90"
				style={{
					clipPath:
						'polygon(18% 4%, 72% 0%, 96% 18%, 88% 48%, 100% 78%, 70% 100%, 28% 96%, 4% 72%, 10% 40%, 0% 16%)',
				}}
				aria-hidden
			/>
			<img
				src={src}
				alt=""
				draggable={false}
				className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[4px_6px_0_#17121b55]"
			/>
		</div>
	);
}

type FigureSettings = Props & { figure?: 'collage' | 'photo'; photoUrl?: string | null };

/** Whichever figure the user picked: their photo if chosen and uploaded, else the collage. */
export function DollFigure({ figure, photoUrl, ...collage }: FigureSettings) {
	if (figure === 'photo' && photoUrl) return <PhotoAvatar src={photoUrl} />;
	return <PaperAvatar {...collage} />;
}

/** Figure settings from a saved avatar (or the defaults when there is none). */
export function figureFrom(a: { bodyType: BodyType; hairColor: string; eyeColor: string; skinColor: string; figure: 'collage' | 'photo'; photoUrl: string | null } | null): FigureSettings {
	if (!a) return DEFAULT_FIGURE;
	return { bodyType: a.bodyType, hairColor: a.hairColor, eyeColor: a.eyeColor, skinColor: a.skinColor, figure: a.figure, photoUrl: a.photoUrl };
}

/** Defaults for visitors who haven't saved an avatar yet. */
export const DEFAULT_FIGURE: FigureSettings = {
	bodyType: 'female',
	hairColor: 'brown',
	eyeColor: 'brown',
	skinColor: 'fair',
	figure: 'collage',
	photoUrl: null,
};
