import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowUpRight, Scissors } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

/**
 * Auth card for the /login route. Toggles between sign-up and log-in, then
 * sends the visitor on to the workshop (or wherever `?to` points).
 */
export function LoginCard() {
	const { login, signup } = useAuth();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const to = params.get('to') || '/workshop';

	const [mode, setMode] = useState<'login' | 'signup'>('login');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function authenticate(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			if (mode === 'signup') await signup(email, password, { name });
			else await login(email, password);
			setPassword('');
			navigate(to, { replace: true });
		} catch (err) {
			setError(
				err instanceof ApiError && err.status === 429
					? err.message
					: mode === 'signup'
					? 'Could not create your account. Check your details or try another email.'
					: 'That email and password do not match. Try again.',
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="hero-paper relative overflow-hidden border-b-[3px] border-black">
			<div className="mx-auto flex min-h-[640px] max-w-[1500px] flex-col items-center justify-center px-5 py-16 md:px-10 md:py-24">
				<div className="relative w-full max-w-[460px]">
					<div className="absolute -left-5 -top-7 z-20 rotate-[-12deg] border-2 border-black bg-white px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_#17121b]">
						MEMBERS ONLY
					</div>
					<div className="absolute -right-3 -top-9 z-10 rotate-[18deg] text-[#e547a2]">
						<Scissors size={56} strokeWidth={1.8} />
					</div>

					<div className="relative rotate-[-1deg] border-[3px] border-black bg-white p-7 shadow-[10px_12px_0_#19141c] md:p-10">
						<Link
							to="/"
							className="brand-type mb-7 block text-2xl leading-none tracking-[-.08em] md:text-3xl"
						>
							CROP TOP<span className="text-[#e547a2]">.</span>
							<span className="block text-[10px] tracking-[.2em]">WARDROBE</span>
						</Link>

						<div className="mb-7 flex gap-6 border-b-2 border-black text-sm font-black uppercase tracking-widest">
							<button
								type="button"
								onClick={() => {
									setMode('login');
									setError('');
								}}
								className={`pb-3 ${mode === 'login' ? 'border-b-[5px] border-[#e547a2]' : 'opacity-50'}`}
							>
								Log in
							</button>
							<button
								type="button"
								onClick={() => {
									setMode('signup');
									setError('');
								}}
								className={`pb-3 ${mode === 'signup' ? 'border-b-[5px] border-[#e547a2]' : 'opacity-50'}`}
							>
								Join the club
							</button>
						</div>

						<h2 className="brand-type mb-6 text-4xl tracking-[-.05em]">
							{mode === 'signup' ? 'MAKE IT YOURS.' : 'WELCOME BACK.'}
						</h2>

						<form onSubmit={authenticate} className="space-y-5">
							{mode === 'signup' && (
								<label className="block text-xs font-black uppercase tracking-widest">
									Your name
									<input
										className="studio-input"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="What should we call you?"
										required
										maxLength={100}
									/>
								</label>
							)}
							<label className="block text-xs font-black uppercase tracking-widest">
								Email
								<input
									className="studio-input"
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
									required
								/>
							</label>
							<label className="block text-xs font-black uppercase tracking-widest">
								Password
								<input
									className="studio-input"
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									placeholder="At least 8 characters"
									minLength={8}
									required
								/>
							</label>

							{error && (
								<p role="alert" className="font-bold text-red-700">
									{error}
								</p>
							)}

							<button disabled={busy} className="studio-button w-full justify-center">
								{busy
									? 'One second…'
									: mode === 'signup'
										? 'Create my wardrobe'
										: 'Let me in'}
								<ArrowUpRight size={18} />
							</button>
						</form>

						<p className="mt-6 text-xs font-semibold leading-snug text-[#7a617d]">
							Your wardrobe and saved outfits belong to you. No shopping pressure, no
							rules, just possibilities.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
