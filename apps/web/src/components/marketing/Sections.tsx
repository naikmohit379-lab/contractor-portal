import { FileText, Ruler, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { AnimatedListItem, InteractiveCard, Reveal } from "@/components/ui/Motion";

const MODULES = [
  { icon: Ruler, title: "Aerial measurements", text: "Order a roof report by address and get facets, pitch and linear feet straight into the job." },
  { icon: FileText, title: "Claim estimating", text: "Line-item estimates, photo evidence, versions and supplements for every insurance claim." },
  { icon: Truck, title: "Supplier orders", text: "Turn the approved estimate into a material list, send the PO and track the delivery." },
  { icon: ShieldCheck, title: "Lien waiver tracking", text: "Request, sign and verify waivers for every payment so draws are never held up." },
];

export function ModuleStrip() {
  return (
    <section id="modules" className="border-y border-white/5 bg-ink-800">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ icon: Icon, title, text }) => (
          <InteractiveCard key={title} delay={0.06 * MODULES.findIndex((item) => item.title === title)} className="group rounded-xl border border-transparent p-5 text-center transition-colors hover:border-ink-500 hover:bg-ink-900/50">
            <Icon className="mx-auto text-ember transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" size={30} strokeWidth={1.5} aria-hidden />
            <h2 className="mt-3 text-xl font-bold">{title}</h2>
            <p className="mx-auto mt-2 max-w-[28ch] text-sm text-mist">{text}</p>
          </InteractiveCard>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  "Create the job and verify the property address",
  "Order the aerial report and review the roof plan",
  "Build the estimate and submit the claim packet",
  "Order materials once the scope is approved",
  "Request waivers before each payment is released",
  "Collect final payment and close the job",
];

export function Workflow() {
  return (
    <section id="workflow" className="mx-auto max-w-7xl px-5 py-20">
      <Reveal><h2 className="max-w-xl text-4xl font-bold sm:text-5xl">One job record. Every step, in order.</h2></Reveal>
      <ol className="mt-10 grid gap-x-12 gap-y-5 md:grid-cols-2">
        {STEPS.map((s, i) => (
          <AnimatedListItem key={s} delay={i * 0.05} className="group flex items-start gap-4 border-t border-ink-600 pt-4 transition-colors hover:border-ember">
            <span className="font-display text-3xl font-bold leading-none text-ember">{i + 1}</span>
            <span className="text-mist-strong transition-transform duration-300 group-hover:translate-x-1">{s}</span>
          </AnimatedListItem>
        ))}
      </ol>
    </section>
  );
}

const MATRIX = {
  columns: ["Deposit", "Draw 1", "Final"],
  rows: [
    { party: "Shingle supplier", cells: ["signed", "signed", "requested"] },
    { party: "Roofing crew", cells: ["signed", "requested", "not due"] },
    { party: "Gutter sub", cells: ["signed", "overdue", "not due"] },
  ],
};
const CELL: Record<string, string> = {
  signed: "bg-ok/15 text-ok",
  requested: "bg-warn/15 text-warn",
  overdue: "bg-bad/15 text-bad",
  "not due": "bg-ink-700 text-mist",
};

export function WaiverBoard() {
  return (
    <section id="waivers" className="bg-ink-800 py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-2">
        <Reveal>
        <div>
          <h2 className="text-4xl font-bold sm:text-5xl">Know who still owes you a waiver.</h2>
          <p className="mt-5 max-w-md text-mist-strong">
            Every payment shows which suppliers, crews and subs have signed. Release a draw only when the paperwork is in, or get a warning when it is not.
          </p>
        </div>
        </Reveal>
        <InteractiveCard className="panel overflow-x-auto p-4" role="region" label="Sample waiver status board" tabIndex={0}>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-mist">
                <th className="pb-3 font-medium">Party</th>
                {MATRIX.columns.map((c) => (
                  <th key={c} className="pb-3 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.rows.map((r) => (
                <tr key={r.party} className="border-t border-ink-600">
                  <td className="py-3 pr-3 font-medium">{r.party}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="py-3 pr-2">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-semibold capitalize ${CELL[c]}`}>{c}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </InteractiveCard>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section id="contact" className="mx-auto max-w-7xl px-5 py-20 text-center">
      <Reveal>
        <h2 className="text-4xl font-bold sm:text-5xl">Run your next job from one place.</h2>
        <p className="mx-auto mt-4 max-w-md text-mist-strong">Set up your company in a few minutes. No card needed to start.</p>
        <Link href="/register" className="btn btn-primary mt-8">Start free trial →</Link>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 text-center text-sm text-mist">
      <p>© {new Date().getFullYear()} RoofDesk. Lien waiver forms are templates, not legal advice.</p>
    </footer>
  );
}
