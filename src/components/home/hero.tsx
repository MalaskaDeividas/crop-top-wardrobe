import { ArrowDownRight, ArrowUpRight, Scissors, Sparkles } from 'lucide-react';

export function Hero() {
  return <section className="hero-paper relative overflow-hidden border-b-[3px] border-black">
    <div className="mx-auto max-w-[1500px] px-5 md:px-10">
      <header className="relative z-10 flex items-center justify-between border-b-2 border-black py-5">
        <a href="#top" className="brand-type text-[25px] leading-none tracking-[-.08em] md:text-[34px]">CROP TOP<span className="text-pink-600">.</span><br/><span className="text-[11px] tracking-[.17em] md:text-[13px]">WARDROBE</span></a>
        <nav className="hidden items-center gap-9 text-[12px] font-black uppercase tracking-[.14em] md:flex"><a href="#how" className="hover:underline">The idea</a><a href="#studio" className="hover:underline">Your wardrobe</a><a href="#about" className="hover:underline">The manifesto</a></nav>
        <a href="/workshop" className="rotate-[-2deg] border-2 border-black bg-[#e547a2] px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[4px_4px_0_#17121b] transition-transform hover:rotate-0">The workshop <ArrowUpRight className="ml-1 inline-block h-4 w-4"/></a>
      </header>
      <div id="top" className="relative grid min-h-[690px] items-center gap-8 py-14 md:min-h-[760px] md:grid-cols-[.95fr_1.05fr] md:py-20">
        <div className="relative z-10 max-w-[690px]">
          <div className="mb-8 inline-block rotate-[-3deg] bg-[#d0a8ed] px-3 py-2 text-[11px] font-black uppercase tracking-[.2em] shadow-[3px_3px_0_#17121b]">✳ THE ANTI-UNIFORM CLUB ✳</div>
          <h1 className="brand-type text-[clamp(4.8rem,10vw,10rem)] leading-[.75] tracking-[-.095em]">GET<br/><span className="relative inline-block text-[#e547a2]">DRESSED<span className="absolute -bottom-2 left-0 h-[9px] w-full rotate-[-2deg] bg-black md:-bottom-4 md:h-[14px]"/></span><br/>LOUD.</h1>
          <p className="mt-12 max-w-[440px] text-lg font-medium leading-snug md:text-xl">Your clothes. Your rules. A little cut, a little paste, a whole lot of you. Build outfits from the pieces you already own.</p>
          <a href="#studio" className="mt-9 inline-flex items-center gap-4 border-[3px] border-black bg-[#e547a2] px-7 py-4 text-sm font-black uppercase tracking-[.12em] shadow-[7px_7px_0_#17121b] transition-transform hover:-translate-y-1 active:translate-y-0">Open the wardrobe <ArrowUpRight className="h-5 w-5"/></a>
          <div className="mt-12 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.14em]"><span className="inline-block h-px w-12 bg-black"/>Scroll to make a mess <ArrowDownRight className="h-4 w-4"/></div>
        </div>
        <div className="relative mx-auto w-full max-w-[700px] md:ml-[-2%]">
          <div className="absolute -left-6 top-7 z-20 rotate-[-12deg] border-2 border-black bg-white px-4 py-2 text-sm font-black uppercase shadow-[3px_3px_0_#17121b]">LOOK NO. 001</div>
          <div className="absolute -right-2 bottom-10 z-20 rotate-[8deg] bg-[#d0a8ed] px-4 py-2 text-sm font-black uppercase shadow-[4px_4px_0_#17121b]">MIX IT UP ↗</div>
          <div className="absolute -left-8 -top-6 z-10 rotate-[-18deg] text-[#e547a2]"><Sparkles size={65} strokeWidth={2.5}/></div>
          <div className="absolute -right-3 -top-8 z-10 rotate-[23deg]"><Scissors size={68} strokeWidth={1.8}/></div>
          <div className="relative rotate-[3deg] border-[3px] border-black bg-white p-3 shadow-[14px_16px_0_#19141c] md:p-5"><div className="overflow-hidden border border-black"><img src="https://images.hostinger.com/117bcbc1-dc07-4ca9-86a6-33307aa978a1.png" alt="Cut-out punk clothing arranged as an editorial outfit collage" className="aspect-[4/3] w-full object-cover"/></div><div className="flex justify-between border-t-2 border-black pt-3 text-[10px] font-black uppercase tracking-[.22em]"><span>Cut / Paste / Repeat</span><span>Issue 001 — You</span></div></div>
          <span className="absolute -bottom-9 left-12 z-10 h-12 w-20 rotate-[-9deg] bg-[#d6bb80]/60 mix-blend-multiply"/>
        </div>
      </div>
    </div>
  </section>;
}
