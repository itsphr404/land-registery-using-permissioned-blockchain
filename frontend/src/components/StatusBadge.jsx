import React from "react";

export const STATUS_META = {
  0: { label: "None", glyph: "—", bg: "bg-[#2a2824]", text: "text-[#a8a194]", border: "border-[#38352e]" },
  1: { label: "Submitted", glyph: "…", bg: "bg-[#25242c]", text: "text-[#a8a1b8]", border: "border-[#3e3b4a]" },
  2: { label: "Survey Verified", glyph: "✓", bg: "bg-[#16272e]", text: "text-[#58b0d8]", border: "border-[#1d4250]" },
  3: { label: "Registered", glyph: "✓", bg: "bg-[#16261f]", text: "text-[#58b988]", border: "border-[#204533]" },
  4: { label: "Under Sale", glyph: "ETH", bg: "bg-[#2b2414]", text: "text-[#e5b567]", border: "border-[#52411e]" },
};

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META[0];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border ${meta.bg} ${meta.text} ${meta.border}`}
    >
      <span className="font-bold opacity-80">{meta.glyph}</span>
      <span>{meta.label}</span>
    </span>
  );
}
