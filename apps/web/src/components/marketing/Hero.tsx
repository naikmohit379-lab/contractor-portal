import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import { RoofPlan } from "./RoofPlan";
import { AmbientGlow, Floating, InteractiveCard, Reveal } from "@/components/ui/Motion";

const TRUST = ["Role-based access", "Full audit trail", "Hosted-field payments"];

export function Hero() {
  return (
    <section className="hero-sky relative isolate overflow-hidden">
      <AmbientGlow className="pointer-events-none absolute -right-24 top-4 z-0 h-72 w-72 rounded-full bg-sky-light/30 blur-3xl" />
      <AmbientGlow className="pointer-events-none absolute -left-32 top-1/3 z-0 h-64 w-64 rounded-full bg-sky/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[12%] z-0 select-none text-center font-display text-[clamp(7rem,24vw,22rem)] font-bold leading-none tracking-[-0.08em] text-white/[0.09]">ROOFDESK</div>
      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-14 lg:min-h-[660px] lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <Reveal>
          <p className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-wide text-white">
            <span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ember" /></span>
            Built for roofing contractors
          </p>
          <h1 className="text-outline-glow text-[clamp(3rem,9vw,5.75rem)] font-bold leading-[0.92]">
            Roof scan to
            <br />
            <span className="text-ember">final payment.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-white/85">
            Measure from the sky, file the insurance claim, order the shingles and collect every lien waiver from one job record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary group shadow-xl shadow-ember/20">Start free trial <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-1.5">→</span></Link>
            <a href="#modules" className="btn border border-white/50 bg-white/10 text-white backdrop-blur-md hover:bg-white/20">See the modules <span aria-hidden>↓</span></a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-white/90">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check size={16} className="text-ember" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.12}>
        <div className="relative">
          <Floating className="drop-shadow-[0_24px_36px_rgba(0,0,0,0.25)] transition-transform duration-500 hover:scale-[1.02]">
            <RoofPlan className="w-full" />
          </Floating>
          <InteractiveCard className="panel absolute -bottom-6 right-0 w-64 border-white/30 bg-ink-900/90 p-4 shadow-2xl backdrop-blur-xl sm:right-4" label="Sample measurement report">
            <p className="text-xs text-mist">Sample report, 14 Oak Ridge Ln</p>
            <p className="mt-1 font-display text-3xl font-bold text-white">2,847 sq ft</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {[["Squares", "28.5"], ["Pitch", "7/12"], ["Waste", "12%"]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-mist">{k}</dt>
                  <dd className="text-base font-semibold text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </InteractiveCard>
        </div>
        </Reveal>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 pb-10">
        <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/25 bg-ink-900/40 px-4 py-2 text-sm text-white/85 backdrop-blur-md">
          <MapPin size={16} className="text-ember" aria-hidden /> Made for US storm-restoration and re-roof crews
        </p>
      </div>
    </section>
  );
}
