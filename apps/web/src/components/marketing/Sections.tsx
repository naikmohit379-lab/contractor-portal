import { FileText, Ruler, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";

const SERVICES = [
  { icon: Ruler, title: "Roof measurements", text: "Use verified site measurements or request a coordinate-based RoofV report when provider access is enabled." },
  { icon: FileText, title: "Estimates and quotations", text: "Prepare itemized customer estimates from your locally maintained material and labour prices." },
  { icon: Truck, title: "Supplier orders", text: "Build a material list, record purchase orders and follow deliveries and invoice variances." },
  { icon: ShieldCheck, title: "Operations tracking", text: "Assign follow-ups, keep job photos together and see the next task for each project." },
];

export function ServiceStrip() {
  return (
    <section id="services" className="border-y border-white/5 bg-ink-800">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="text-center">
            <Icon className="mx-auto text-ember" size={30} strokeWidth={1.5} aria-hidden />
            <h2 className="mt-3 text-xl font-bold">{title}</h2>
            <p className="mx-auto mt-2 max-w-[28ch] text-sm text-mist">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  "Create the job and verify the property address",
  "Enter a verified measurement or request a provider report",
  "Build and review the customer quotation",
  "Order materials once the scope is approved",
  "Coordinate the crew, supplier deliveries and job follow-ups",
  "Record payment status and close the job",
];

export function Workflow() {
  return (
    <section id="workflow" className="mx-auto max-w-7xl px-5 py-20">
      <h2 className="max-w-xl text-4xl font-bold sm:text-5xl">One job record. Every step, in order.</h2>
      <ol className="mt-10 grid gap-x-12 gap-y-5 md:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-start gap-4 border-t border-ink-600 pt-4">
            <span className="font-display text-3xl font-bold leading-none text-ember">{i + 1}</span>
            <span className="text-mist-strong">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Cta() {
  return (
    <section id="contact" className="mx-auto max-w-7xl px-5 py-20 text-center">
      <h2 className="text-4xl font-bold sm:text-5xl">Run your next job from one place.</h2>
      <p className="mx-auto mt-4 max-w-md text-mist-strong">Set up your company in a few minutes. No card needed to start.</p>
      <Link href="/register" className="btn btn-primary mt-8">Start free trial →</Link>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 text-center text-sm text-mist">
      <p>© {new Date().getFullYear()} RoofDesk. Built for Indian roofing contractors.</p>
    </footer>
  );
}
