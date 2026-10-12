/** Hip roof in plan view with facet areas and pitch. The outline draws itself once on load. */
export function RoofPlan({ className = "" }: { className?: string }) {
  const draw = { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 } as const;
  return (
    <svg viewBox="0 0 520 420" className={className} role="img" aria-label="Roof plan showing four facets, ridge and hips with measured areas">
      {/* facets */}
      <g className="fill-ink-700 stroke-ink-500" strokeWidth="1">
        <polygon points="60,80 460,80 340,210 180,210" />
        <polygon points="60,340 460,340 340,210 180,210" className="fill-ink-800" />
        <polygon points="60,80 180,210 60,340" className="fill-ink-600/70" />
        <polygon points="460,80 340,210 460,340" className="fill-ink-600/70" />
      </g>
      {/* ridge and hips, drawn on load */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M180 210 H340" className="stroke-ember animate-draw" strokeWidth="5" style={draw} />
        <path d="M60 80 180 210 M460 80 340 210 M60 340 180 210 M460 340 340 210" className="stroke-ember-300 animate-draw" strokeWidth="2.5" style={draw} />
        <path d="M60 80 H460 V340 H60 Z" className="stroke-white animate-draw" strokeWidth="2.5" style={draw} />
      </g>
      {/* facet labels */}
      <g className="animate-rise" fontFamily="var(--font-body)" fill="#fff" textAnchor="middle">
        <text x="260" y="128" fontSize="15" fontWeight="600">A  684 sq ft</text>
        <text x="260" y="146" fontSize="12" fill="#a3adb9">7/12 pitch</text>
        <text x="260" y="286" fontSize="15" fontWeight="600">C  702 sq ft</text>
        <text x="260" y="304" fontSize="12" fill="#a3adb9">7/12 pitch</text>
        <text x="116" y="214" fontSize="13" fontWeight="600">B  431</text>
        <text x="404" y="214" fontSize="13" fontWeight="600">D  436</text>
      </g>
      {/* dimension line */}
      <g className="animate-rise stroke-mist" strokeWidth="1.2" fill="none">
        <path d="M60 372 H460 M60 365 V379 M460 365 V379" />
      </g>
      <text x="260" y="396" textAnchor="middle" fontSize="13" fill="#c8d0d9" fontFamily="var(--font-body)" className="animate-rise">
        Eave 40 ft | Ridge 16 ft
      </text>
    </svg>
  );
}
