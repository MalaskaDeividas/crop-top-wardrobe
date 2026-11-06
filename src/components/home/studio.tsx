import { useEffect, useState } from 'react';
import { ArrowUpRight, LogOut, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { api, type Avatar, type Garment, type Outfit } from '@/lib/api-client';
import { defaultPlace, LookPreview, type StageItem } from '@/components/workshop/doll-stage';
import { DollFigure, figureFrom } from '@/components/workshop/paper-avatar';

export function Studio() {
  const { user, isAuthed, isLoading, logout } = useAuth();
  const [garments, setGarments] = useState<Garment[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthed) {
      setGarments([]);
      setOutfits([]);
      setAvatar(null);
      return;
    }

    let active = true;
    Promise.all([
      api.garments.list(),
      api.outfits.list(),
      api.avatar.get().catch(() => null),
    ])
      .then(([items, looks, me]) => {
        if (active) {
          setGarments(items);
          setOutfits(looks);
          setAvatar(me);
        }
      })
      .catch(() => {
        if (active) setError('Could not load your saved looks. Try refreshing the page.');
      });

    return () => {
      active = false;
    };
  }, [isAuthed]);

  async function removeOutfit(id: string) {
    try {
      await api.outfits.remove(id);
      setOutfits((previous) => previous.filter((look) => look.id !== id));
    } catch {
      setError('Could not remove that look. Try again.');
    }
  }

  return (
    <section id="studio" className="relative bg-[#eee8dc] px-5 py-20 text-[#17121b] md:px-10 md:py-28">
      <div className="mx-auto max-w-[1380px]">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6 border-b-[3px] border-black pb-8">
          <div>
            <div className="mb-4 inline-block rotate-[-2deg] bg-[#e547a2] px-3 py-1 text-xs font-black uppercase tracking-[.18em]">YOUR LOOKS / 01</div>
            <h2 className="brand-type text-6xl leading-[.85] tracking-[-.07em] md:text-8xl">YOUR <span className="text-[#a765cf]">STUDIO.</span></h2>
          </div>
          <p className="max-w-[320px] font-semibold leading-snug">Make new outfits, remix your wardrobe, and save the looks that feel like you.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-5 border-[3px] border-black bg-[#d8b6ed] p-6 shadow-[8px_8px_0_#17121b] md:p-9">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[.18em]">Ready to get dressed?</p>
            <h3 className="brand-type text-4xl leading-[.9] tracking-[-.05em] md:text-6xl">MAKE A LOOK IN THE WORKSHOP.</h3>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {isAuthed && <span className="text-sm font-black uppercase tracking-wider">Hey, {user?.name || user?.email?.split('@')[0]}</span>}
            <Link to="/workshop" className="studio-button bg-[#17121b]">
              Open the workshop <ArrowUpRight size={18} />
            </Link>
            {isAuthed && <button onClick={logout} className="flex min-h-11 items-center gap-2 border-2 border-black bg-white px-3 py-2 text-xs font-black uppercase tracking-widest hover:bg-[#eee8dc]"><LogOut size={16} /> Log out</button>}
          </div>
        </div>

        <div className="mt-16 border-t-[3px] border-black pt-10">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <h3 className="brand-type text-4xl md:text-5xl">SAVED LOOKS <span className="text-[#a765cf]">({outfits.length})</span></h3>
            {isAuthed && <p className="text-sm font-black uppercase tracking-widest">Your private collection</p>}
          </div>

          {error && <p role="alert" className="mb-6 border-2 border-black bg-[#e547a2] p-4 font-bold">{error}</p>}
          {isLoading ? (
            <p className="border-2 border-dashed border-black p-10 text-center font-black uppercase tracking-widest">Opening your saved looks…</p>
          ) : !isAuthed ? (
            <div className="border-2 border-dashed border-black bg-white p-10 text-center">
              <p className="brand-type text-3xl">YOUR NEXT LOOK IS WAITING.</p>
              <p className="mt-2 font-semibold">Log in from the workshop to see and save your outfits.</p>
            </div>
          ) : outfits.length === 0 ? (
            <div className="border-2 border-dashed border-black bg-white p-10 text-center">
              <p className="brand-type text-3xl">NO SAVED LOOKS YET.</p>
              <p className="mt-2 font-semibold">Open the workshop above and make your first masterpiece.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {outfits.map((look) => (
                <div key={look.id} className="border-2 border-black bg-white p-4 shadow-[5px_5px_0_#17121b]">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="brand-type truncate text-2xl">{look.title}</h4>
                    <button aria-label={`Delete ${look.title}`} onClick={() => removeOutfit(look.id)}><Trash2 size={17} /></button>
                  </div>
                  {(() => {
                    // Pieces still in the wardrobe, placed where they were saved
                    // (older looks without a saved position use the default spot).
                    const items: StageItem[] = [];
                    let missing = 0;
                    (Array.isArray(look.items) ? look.items : []).forEach((entry, index) => {
                      const live = garments.find((piece) => piece.id === entry.id);
                      if (!live) {
                        missing += 1;
                        return;
                      }
                      items.push({ key: entry.id, name: live.name, imageUrl: live.imageUrl, category: live.category, place: entry.place ?? defaultPlace(entry.category, index) });
                    });
                    return (
                      <>
                        <div className="mt-4 bg-[#eee8dc] p-2">
                          <LookPreview className="mx-auto max-w-[200px]" items={items} figure={<DollFigure {...figureFrom(avatar)} />} />
                        </div>
                        {missing > 0 && (
                          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[#7a617d]">
                            {missing} piece{missing === 1 ? ' was' : 's were'} removed from your wardrobe
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
