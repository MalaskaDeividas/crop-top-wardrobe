import type { Route } from './+types/workshop';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { WorkshopHeader } from '@/components/workshop/workshop-header';
import { UploadForm } from '@/components/workshop/upload-form';
import { OutfitStudio } from '@/components/workshop/outfit-studio';
import { SiteFooter } from '@/components/site-footer';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'The Workshop — Crop Top Wardrobe',
			description:
				'Upload your clothing pieces with color, mood, vibe and weather tags, and customize your paper avatar.',
		},
	);
}

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="min-h-[60vh] bg-[#eee8dc]" />;
}

export default function WorkshopPage({ loaderData }: Route.ComponentProps) {
	const user = loaderData?.user;
	return (
		<main>
			<WorkshopHeader name={user?.name || user?.email?.split('@')[0]} />
			<UploadForm />
			<OutfitStudio />
			<SiteFooter />
		</main>
	);
}
