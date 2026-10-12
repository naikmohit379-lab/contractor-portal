import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_70%_0%,#1c2531_0%,#0e131a_65%)] px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="panel p-6 sm:p-8">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-mist">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
