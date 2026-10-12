import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import { RoofPlan } from "./RoofPlan";

const TRUST = ["Role-based access", "Full audit trail", "Hosted-field payments"];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_80%_20%,#1c2531_0%,#0e131a_60%)]">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-20">
        <div>
          <p className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-wide">
            <span className="h-2.5 w-2.5 rounded-full bg-ember" aria-hidden />
            Built for roofing contractors
          </p>
          <h1 className="text-[clamp(3rem,9vw,5.75rem)] font-bold leading-[0.92]">
            Roof scan to
            <br />
            <span className="text-ember">final payment.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-mist-strong">
            Measure from the sky, file the insurance claim, order the shingles and collect every lien waiver from one job record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">Start free trial →</Link>
            <a href="#modules" className="btn btn-ghost">See the modules ›</a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check size={16} className="text-ember" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <RoofPlan className="w-full" />
          <aside className="panel absolute -bottom-6 right-0 w-64 bg-ink-800/95 p-4 shadow-2xl backdrop-blur sm:right-4" aria-label="Sample measurement report">
            <p className="text-xs text-mist">Sample report, 14 Oak Ridge Ln</p>
            <p className="mt-1 font-display text-3xl font-bold">2,847 sq ft</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {[["Squares", "28.5"], ["Pitch", "7/12"], ["Waste", "12%"]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-mist">{k}</dt>
                  <dd className="text-base font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 pb-8">
        <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-ink-500 bg-ink-800/80 px-4 py-2 text-sm text-mist-strong">
          <MapPin size={16} className="text-ember" aria-hidden /> Made for US storm-restoration and re-roof crews
        </p>
      </div>
    </section>
  );
}
