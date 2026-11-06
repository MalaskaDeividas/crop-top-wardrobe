import type { Route } from './+types/login';
import { seo } from '@/lib/seo';
import { LoginCard } from '@/components/auth/login-card';
import { SiteFooter } from '@/components/site-footer';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Log in — Crop Top Wardrobe',
			description:
				'Sign in or join Crop Top Wardrobe to upload your pieces, customize your paper avatar, and save your own looks.',
		},
	);
}

export default function LoginPage() {
	return (
		<main>
			<LoginCard />
			<SiteFooter />
		</main>
	);
}
