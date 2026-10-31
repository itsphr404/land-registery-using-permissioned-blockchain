import React from "react";

const ROLE_STYLES = {
  admin: { label: "Admin", bg: "bg-[#2b1c2e]", text: "text-[#d670d6]", border: "border-[#4a2650]" },
  registrar: { label: "Registrar", bg: "bg-[#142921]", text: "text-[#4ec990]", border: "border-[#1d4737]" },
  surveyor: { label: "Surveyor", bg: "bg-[#14232e]", text: "text-[#4ea8de]", border: "border-[#1d3d52]" },
  court: { label: "Court", bg: "bg-[#2e1719]", text: "text-[#e26d75]", border: "border-[#4f2427]" },
  issuer: { label: "Issuer", bg: "bg-[#252033]", text: "text-[#9d8bf0]", border: "border-[#3d3357]" },
  citizen: { label: "Citizen", bg: "bg-[#21201d]", text: "text-[#c2bcaf]", border: "border-[#38352e]" },
};

export default function RoleBadges({ roles }) {
  const activeRoles = Object.entries(roles || {})
    .filter(([_, has]) => has)
    .map(([r]) => r.toLowerCase());

  if (activeRoles.length === 0) {
    const style = ROLE_STYLES.citizen;
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${style.bg} ${style.text} ${style.border}`}
      >
        {style.label}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeRoles.map((roleKey) => {
        const style = ROLE_STYLES[roleKey] || ROLE_STYLES.citizen;
        return (
          <span
            key={roleKey}
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${style.bg} ${style.text} ${style.border}`}
          >
            {style.label}
          </span>
        );
      })}
    </div>
  );
}
