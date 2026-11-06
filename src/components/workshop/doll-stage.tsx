import { forwardRef, useRef } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, RotateCcw, Trash2 } from 'lucide-react';
import type { Placement } from '@/lib/api-client';

/**
 * The "paper you" stage: the avatar figure with clothing cut-outs on top that
 * can be dragged, rotated, resized and layered. Positions are stored as % of
 * the stage (which is always 2:3), so a look renders the same at any size —
 * in the builder and in the small saved-look previews.
 */

export type LayerMove = 'front' | 'forward' | 'backward' | 'back';

export type StageItem = { key: string; name: string; imageUrl: string; category: string; place: Placement };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** Stage width ÷ height. */
export const STAGE_ASPECT = 2 / 3;

/** Where a piece lands by default, and the tallest it may start (both in % of the stage). */
export const ZONE_PLACE: Record<string, Omit<Placement, 'z'> & { maxH: number }> = {
	head: { x: 49, y: 14, w: 42, r: -3, maxH: 16 },
	torso: { x: 48, y: 42, w: 52, r: 1, maxH: 30 },
	legs: { x: 49, y: 67, w: 46, r: -1, maxH: 30 },
	feet: { x: 49, y: 87, w: 42, r: 2, maxH: 14 },
	accessory: { x: 76, y: 22, w: 28, r: 8, maxH: 18 },
};

export function defaultPlace(category: string, z: number): Placement {
	const { maxH: _, ...zone } = ZONE_PLACE[category] ?? ZONE_PLACE.torso;
	return { ...zone, z };
}

/** Shrinks a freshly placed piece so it fits its body zone, once its shape is known. */
export function fitToZone(place: Placement, category: string, imageAspect: number): Placement {
	const maxH = (ZONE_PLACE[category] ?? ZONE_PLACE.torso).maxH;
	const heightPct = (place.w * STAGE_ASPECT) / imageAspect;
	return heightPct > maxH ? { ...place, w: round(Math.max(8, (maxH * imageAspect) / STAGE_ASPECT)) } : place;
}

type DragState = {
	key: string;
	mode: 'move' | 'rotate' | 'resize';
	pointerX: number;
	pointerY: number;
	start: Placement;
	rect: DOMRect;
	cx: number;
	cy: number;
	startAngle: number;
	startDist: number;
};

type Props = {
	figure: React.ReactNode;
	items: StageItem[];
	editable?: boolean;
	selected?: string | null;
	onSelect?: (key: string | null) => void;
	onChange?: (key: string, place: Placement) => void;
	onRemove?: (key: string) => void;
	onLayer?: (key: string, direction: LayerMove) => void;
	onReset?: (key: string) => void;
	onImageLoad?: (key: string, aspect: number) => void;
	className?: string;
};

export const DollStage = forwardRef<HTMLDivElement, Props>(function DollStage(
	{ figure, items, editable = false, selected = null, onSelect, onChange, onRemove, onLayer, onReset, onImageLoad, className = '' },
	ref,
) {
	const drag = useRef<DragState | null>(null);
	const stageEl = useRef<HTMLDivElement | null>(null);
	const ordered = [...items].sort((a, b) => a.place.z - b.place.z);
	const selectedItem = editable ? items.find((i) => i.key === selected) : undefined;
	const layerIndex = selectedItem ? ordered.indexOf(selectedItem) : -1; // 0 = furthest back
	const atFront = layerIndex === ordered.length - 1;
	const atBack = layerIndex === 0;

	function setRefs(node: HTMLDivElement | null) {
		stageEl.current = node;
		if (typeof ref === 'function') ref(node);
		else if (ref) ref.current = node;
	}

	function begin(event: React.PointerEvent<HTMLDivElement>, item: StageItem) {
		if (!editable || !stageEl.current || event.button > 0) return;
		event.stopPropagation();
		event.preventDefault();
		onSelect?.(item.key);
		const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle;
		const rect = stageEl.current.getBoundingClientRect();
		const cx = rect.left + (item.place.x / 100) * rect.width;
		const cy = rect.top + (item.place.y / 100) * rect.height;
		drag.current = {
			key: item.key,
			mode: handle === 'rotate' ? 'rotate' : handle === 'resize' ? 'resize' : 'move',
			pointerX: event.clientX,
			pointerY: event.clientY,
			start: item.place,
			rect,
			cx,
			cy,
			startAngle: (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI,
			startDist: Math.max(8, Math.hypot(event.clientX - cx, event.clientY - cy)),
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function move(event: React.PointerEvent<HTMLDivElement>) {
		const d = drag.current;
		if (!d) return;
		const { start, rect } = d;
		let next = start;
		if (d.mode === 'move') {
			next = {
				...start,
				x: round(clamp(start.x + ((event.clientX - d.pointerX) / rect.width) * 100, -20, 120)),
				y: round(clamp(start.y + ((event.clientY - d.pointerY) / rect.height) * 100, -20, 120)),
			};
		} else if (d.mode === 'rotate') {
			const angle = (Math.atan2(event.clientY - d.cy, event.clientX - d.cx) * 180) / Math.PI;
			let r = start.r + angle - d.startAngle;
			r = ((((r + 180) % 360) + 360) % 360) - 180;
			if (event.shiftKey) r = Math.round(r / 15) * 15;
			else if (Math.abs(r) < 3) r = 0; // gentle snap to upright
			next = { ...start, r: round(r) };
		} else {
			const dist = Math.hypot(event.clientX - d.cx, event.clientY - d.cy);
			next = { ...start, w: round(clamp((start.w * dist) / d.startDist, 6, 150)) };
		}
		onChange?.(d.key, next);
	}

	function end() {
		drag.current = null;
	}

	function keyboard(event: React.KeyboardEvent<HTMLDivElement>, item: StageItem) {
		if (!editable) return;
		const step = event.shiftKey ? 5 : 1;
		const p = item.place;
		const keys: Record<string, () => void> = {
			ArrowLeft: () => onChange?.(item.key, { ...p, x: round(p.x - step) }),
			ArrowRight: () => onChange?.(item.key, { ...p, x: round(p.x + step) }),
			ArrowUp: () => onChange?.(item.key, { ...p, y: round(p.y - step) }),
			ArrowDown: () => onChange?.(item.key, { ...p, y: round(p.y + step) }),
			'+': () => onChange?.(item.key, { ...p, w: round(clamp(p.w * 1.05, 6, 150)) }),
			'=': () => onChange?.(item.key, { ...p, w: round(clamp(p.w * 1.05, 6, 150)) }),
			'-': () => onChange?.(item.key, { ...p, w: round(clamp(p.w / 1.05, 6, 150)) }),
			'[': () => onChange?.(item.key, { ...p, r: round(p.r - step * 3) }),
			']': () => onChange?.(item.key, { ...p, r: round(p.r + step * 3) }),
			PageUp: () => onLayer?.(item.key, event.shiftKey ? 'front' : 'forward'),
			PageDown: () => onLayer?.(item.key, event.shiftKey ? 'back' : 'backward'),
			Delete: () => onRemove?.(item.key),
			Backspace: () => onRemove?.(item.key),
			Escape: () => onSelect?.(null),
		};
		const action = keys[event.key];
		if (action) {
			event.preventDefault();
			action();
		}
	}

	return (
		<div className={className}>
			<div
				ref={setRefs}
				className="relative mx-auto aspect-[2/3] w-full select-none"
				onPointerDown={() => editable && onSelect?.(null)}
			>
				<div className="absolute inset-0">{figure}</div>
				{ordered.map((item) => {
					const isSelected = editable && item.key === selected;
					return (
						<div
							key={item.key}
							role={editable ? 'button' : undefined}
							tabIndex={editable ? 0 : -1}
							aria-label={editable ? `${item.name}. Drag to move; arrow keys nudge, [ and ] rotate, + and - resize, Page Up/Down change layer, Delete removes.` : item.name}
							aria-pressed={editable ? isSelected : undefined}
							onPointerDown={(e) => begin(e, item)}
							onPointerMove={move}
							onPointerUp={end}
							onPointerCancel={end}
							onFocus={() => editable && onSelect?.(item.key)}
							onKeyDown={(e) => keyboard(e, item)}
							className={`absolute outline-none ${editable ? 'cursor-grab touch-none active:cursor-grabbing' : 'pointer-events-none'}`}
							style={{
								left: `${item.place.x}%`,
								top: `${item.place.y}%`,
								width: `${item.place.w}%`,
								transform: `translate(-50%, -50%) rotate(${item.place.r}deg)`,
								zIndex: 20 + item.place.z,
							}}
						>
							<img
								src={item.imageUrl}
								alt=""
								draggable={false}
								onLoad={(e) => {
									const img = e.currentTarget;
									if (img.naturalWidth && img.naturalHeight) onImageLoad?.(item.key, img.naturalWidth / img.naturalHeight);
								}}
								className="pointer-events-none block h-auto w-full drop-shadow-[3px_4px_0_rgba(23,18,27,0.35)]"
							/>
							{isSelected && (
								<>
									<span className="pointer-events-none absolute -inset-1 border-2 border-dashed border-[#e547a2]" aria-hidden />
									<span
										data-handle="rotate"
										title="Drag to rotate (hold Shift to snap)"
										className="absolute -top-8 left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-alias items-center justify-center rounded-full border-2 border-black bg-white text-[11px] font-black shadow-[2px_2px_0_#17121b]"
									>
										↻
									</span>
									<span className="pointer-events-none absolute -top-3 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-black" aria-hidden />
									<span
										data-handle="resize"
										title="Drag to resize"
										className="absolute -bottom-3 -right-3 h-5 w-5 cursor-nwse-resize border-2 border-black bg-[#e547a2] shadow-[2px_2px_0_#17121b]"
									/>
								</>
							)}
						</div>
					);
				})}
			</div>

			{editable && (
				<div className="mt-3 flex min-h-9 flex-wrap items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider">
					{selectedItem ? (
						<div className="flex w-full flex-col items-center gap-2">
							<span className="max-w-full truncate">
								{selectedItem.name}
								{ordered.length > 1 && (
									<span className="ml-2 text-[#7a617d]">
										layer {layerIndex + 1} of {ordered.length}
										{atFront ? ' · on top' : atBack ? ' · at the back' : ''}
									</span>
								)}
							</span>
							<div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Layer">
								<StageButton label="To front" title="Bring to front (Shift+Page Up)" disabled={atFront} onClick={() => onLayer?.(selectedItem.key, 'front')} icon={<ArrowUpToLine size={13} />} />
								<StageButton label="Forward" title="Bring forward one layer (Page Up)" disabled={atFront} onClick={() => onLayer?.(selectedItem.key, 'forward')} icon={<ArrowUp size={13} />} />
								<StageButton label="Backward" title="Send backward one layer (Page Down)" disabled={atBack} onClick={() => onLayer?.(selectedItem.key, 'backward')} icon={<ArrowDown size={13} />} />
								<StageButton label="To back" title="Send to back (Shift+Page Down)" disabled={atBack} onClick={() => onLayer?.(selectedItem.key, 'back')} icon={<ArrowDownToLine size={13} />} />
							</div>
							<div className="flex flex-wrap justify-center gap-1.5">
								<StageButton label="Reset" title="Put it back in its default spot" onClick={() => onReset?.(selectedItem.key)} icon={<RotateCcw size={13} />} />
								<StageButton label="Take off" title="Take it off the doll (Delete)" onClick={() => onRemove?.(selectedItem.key)} icon={<Trash2 size={13} />} danger />
							</div>
						</div>
					) : (
						<span className="text-center text-[#7a617d]">
							{items.length ? 'Tap a piece to move, turn, resize or layer it' : 'Drag or tap pieces from your wardrobe'}
						</span>
					)}
				</div>
			)}
		</div>
	);
});

function StageButton({
	label,
	title,
	icon,
	onClick,
	danger = false,
	disabled = false,
}: {
	label: string;
	title: string;
	icon: React.ReactNode;
	onClick: () => void;
	danger?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			disabled={disabled}
			className={`flex h-8 items-center justify-center gap-1.5 border-2 border-black bg-white px-2 shadow-[2px_2px_0_#17121b] transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-35 disabled:shadow-none ${
				danger ? 'enabled:hover:bg-red-100' : 'enabled:hover:bg-[#f6d6ea]'
			}`}
		>
			{icon}
			{label}
		</button>
	);
}

/** Read-only stage for saved looks. */
export function LookPreview({ figure, items, className }: { figure: React.ReactNode; items: StageItem[]; className?: string }) {
	return <DollStage figure={figure} items={items} className={className} />;
}
