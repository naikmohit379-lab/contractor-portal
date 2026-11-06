"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface SearchResults {
  jobs: { id: string; jobNumber: string; customerName: string; address: string; stage: string }[];
  documents: { id: string; jobId: string; jobNumber: string; customerName: string; filename: string; kind: string; caption: string; tags: string[] }[];
}

export default function SearchPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSubmitted(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const results = useQuery({
    queryKey: ["global-search", submitted],
    queryFn: () => api<SearchResults>("/search?q=" + encodeURIComponent(submitted)),
    enabled: submitted.length >= 2,
    retry: false,
  });
  const hasResults = (results.data?.jobs.length ?? 0) + (results.data?.documents.length ?? 0) > 0;

  return (
    <section className="space-y-6" aria-labelledby="search-title">
      <header>
        <p className="eyebrow">Roofora</p>
        <h1 id="search-title" className="display-title">{t("search.title")}</h1>
      </header>
      <div className="panel space-y-2 p-4">
        <label htmlFor="global-search" className="label">{t("search.label")}</label>
        <div className="relative">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
          <input id="global-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-describedby="search-help" placeholder={t("search.placeholder")} className="field pl-10" />
        </div>
        <p id="search-help" className="text-sm text-mist">{t("search.hint")}</p>
      </div>

      {submitted.length >= 2 && results.isFetching && <p role="status" className="text-sm text-mist">{t("search.loading")}</p>}
      {results.isError && <p role="alert" className="text-sm text-bad">{(results.error as Error).message}</p>}
      {submitted.length >= 2 && results.isSuccess && !hasResults && <p className="panel p-5 text-mist">{t("search.noResults")}</p>}

      {!!results.data?.jobs.length && <section aria-labelledby="search-jobs" className="space-y-3">
        <h2 id="search-jobs" className="text-lg font-semibold">{t("search.jobs")}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {results.data.jobs.map((job) => <li key={job.id}>
            <Link href={"/jobs/" + job.id} className="panel block p-4 transition-colors hover:border-ember focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember">
              <span className="font-semibold text-ember">{job.jobNumber}</span>
              <span className="mt-1 block font-medium">{job.customerName}</span>
              <span className="mt-1 block text-sm text-mist">{job.address}</span>
              <span className="mt-2 block text-xs text-mist">{job.stage}</span>
            </Link>
          </li>)}
        </ul>
      </section>}

      {!!results.data?.documents.length && <section aria-labelledby="search-files" className="space-y-3">
        <h2 id="search-files" className="text-lg font-semibold">{t("search.documents")}</h2>
        <ul className="space-y-2">
          {results.data.documents.map((doc) => <li key={doc.id}>
            <Link href={"/jobs/" + doc.jobId + "?tab=photos"} className="panel flex items-start gap-3 p-4 transition-colors hover:border-ember focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember">
              <FileText size={18} aria-hidden className="mt-0.5 shrink-0 text-ember" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{doc.filename}</span>
                <span className="mt-1 block text-sm text-mist">{doc.jobNumber} · {doc.customerName}{doc.caption ? " · " + doc.caption : ""}</span>
                {doc.tags.length > 0 && <span className="mt-1 block text-xs text-mist">{doc.tags.join(", ")}</span>}
              </span>
            </Link>
          </li>)}
        </ul>
      </section>}
    </section>
  );
}
