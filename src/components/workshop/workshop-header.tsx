import { Link, useNavigate } from 'react-router';
import { ArrowUpRight, LogOut, Scissors } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export function WorkshopHeader({ name }: { name?: string }) {
	const { logout } = useAuth();
	const navigate = useNavigate();
	return (
		<header className="border-b-[3px] border-black bg-[#17121b] px-5 py-5 text-white md:px-10">
			<div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-4">
				<Link to="/" className="brand-type text-2xl leading-none tracking-[-.08em] md:text-3xl">
					CROP TOP<span className="text-[#e547a2]">.</span>
					<span className="block text-[10px] tracking-[.2em]">WARDROBE</span>
				</Link>
				<div className="flex items-center gap-5 text-[11px] font-black uppercase tracking-widest">
					<span className="hidden items-center gap-2 sm:flex">
						<Scissors size={15} /> The Workshop
					</span>
					{name && <span className="hidden text-[#c9bdca] md:inline">Hey, {name}</span>}
					<Link
						to="/#studio"
						className="flex items-center gap-1 hover:text-[#e547a2]"
					>
						Studio <ArrowUpRight size={14} />
					</Link>
					<button
						onClick={async () => {
							await logout();
							navigate('/login');
						}}
						className="flex items-center gap-2 border-2 border-white px-3 py-2 hover:bg-[#e547a2] hover:text-white"
					>
						<LogOut size={15} /> Log out
					</button>
				</div>
			</div>
		</header>
	);
}
