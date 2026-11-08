import React, { useState } from "react";
import { ST } from "../lib/mapData";

export default function RegistryView({ plots, onFocusPlot }) {
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = plots.filter((p) => {
    if (filterStatus && p.st !== filterStatus) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.id + p.addr + p.owners.map((o) => o.label).join(" ")).toLowerCase().includes(q);
  });

  return (
    <div>
      <h1 className="page-title">
        Property <i>registry</i>
      </h1>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "14px 0" }}>
        <input
          type="search"
          placeholder="Search ID, address or owner"
          aria-label="Search records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: "220px" }}
        />
        <select
          aria-label="Filter status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.keys(ST).map((s) => (
            <option key={s} value={s}>
              {ST[s][0]}
            </option>
          ))}
        </select>
      </div>

      <div className="row h">
        <span>ID</span>
        <span>Location</span>
        <span>Owner</span>
        <span>Status</span>
      </div>

      {filtered.slice(0, 40).map((p) => (
        <button
          key={p.id}
          className="row"
          onClick={() => onFocusPlot(p.id)}
          title="Click to view on map"
        >
          <span className="mono">{p.id}</span>
          <span>{p.addr}</span>
          <span>{p.owners.map((o) => `${o.label} (${o.share}%)`).join(", ")}</span>
          <span>
            <span className={`g ${p.st}`} style={{ marginRight: "6px" }}>
              {ST[p.st][1]}
            </span>
            {ST[p.st][0]}
          </span>
        </button>
      ))}

      {filtered.length === 0 && (
        <p className="sub" style={{ padding: "16px 0" }}>
          No records match your query.
        </p>
      )}

      <p className="mono" style={{ color: "var(--mute)", marginTop: "16px" }}>
        Select a row to fly to the plot on the interactive satellite map.
      </p>
    </div>
  );
}
