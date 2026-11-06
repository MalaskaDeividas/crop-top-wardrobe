import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import { Hero } from '@/components/home/hero';
import { Story } from '@/components/home/story';
import { Studio } from '@/components/home/studio';
import { SiteFooter } from '@/components/site-footer';

export function meta({ matches, location }: Route.MetaArgs) {
  return seo({ matches, location }, { title: 'Crop Top Wardrobe — Get Dressed Loud', description: 'A cut-and-paste wardrobe for your real clothes. Upload your pieces, mix and match outfits, and save looks that feel like you.' });
}
export default function HomePage() { return <main><Hero/><Story/><Studio/><SiteFooter/></main>; }
