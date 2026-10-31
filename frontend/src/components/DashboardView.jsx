import React from "react";
import { ST } from "../lib/mapData";
import { useWallet } from "../context/WalletContext";

export default function DashboardView({ plots, auditEvents, onSelectView, onFocusPlot }) {
  const { roles } = useWallet();

  // Determine user's active role label
  const activeRoleName = roles.registrar
    ? "Registrar"
    : roles.surveyor
    ? "Surveyor"
    : roles.court
    ? "Court officer"
    : roles.admin
    ? "Administrator"
    : "Citizen";

  const counts = {
    approved: plots.filter((p) => p.st === "approved").length,
    sale: plots.filter((p) => p.st === "sale").length,
    disputed: plots.filter((p) => p.st === "disputed").length,
    court: plots.filter((p) => p.st === "court").length,
    pending: plots.filter((p) => p.st === "pending").length,
  };

  // Build role-specific queue
  const queueItems = [];
  if (roles.registrar) {
    plots
      .filter((p) => p.st === "pending")
      .slice(0, 4)
      .forEach((p) => {
        queueItems.push({
          title: `${p.id} awaiting registrar sign-off`,
          action: (
            <button className="btn" onClick={() => onFocusPlot(p.id)}>
              REVIEW
            </button>
          ),
        });
      });
  }
  if (roles.surveyor) {
    plots
      .filter((p) => p.st === "pending")
      .slice(0, 4)
      .forEach((p) => {
        queueItems.push({
          title: `${p.id} boundary survey outstanding`,
          action: (
            <button className="btn alt" onClick={() => onFocusPlot(p.id)}>
              INSPECT
            </button>
          ),
        });
      });
  }
  plots
    .filter((p) => p.sale && (!p.sale.sellerOk || !p.sale.regOk))
    .slice(0, 2)
    .forEach((p) => {
      queueItems.push({
        title: `${p.id} escrow sale requires dual approval`,
        action: (
          <button className="btn alt" onClick={() => onSelectView("sales")}>
            OPEN SALES
          </button>
        ),
      });
    });

  return (
    <div>
      <h1 className="page-title">
        The registry at <i>a glance</i>
      </h1>

      {/* Ledger Stats */}
      <div className="ledger">
        {Object.keys(ST).map((stKey) => (
          <div key={stKey}>
            <b>{counts[stKey] || 0}</b>
            <span>{ST[stKey][0]}</span>
          </div>
        ))}
      </div>

      <button className="btn alt" style={{ margin: "10px 0 20px" }} onClick={() => onSelectView("map")}>
        OPEN THE MAP
      </button>

      {/* Role Queue */}
      <div className="k">Your queue · {activeRoleName}</div>
      {queueItems.length > 0 ? (
        queueItems.map((item, idx) => (
          <div key={idx} className="ev" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
            <span>{item.title}</span>
            <span>{item.action}</span>
          </div>
        ))
      ) : (
        <p className="sub" style={{ padding: "8px 0" }}>Nothing waiting for this role.</p>
      )}

      {/* Recent Activity */}
      <div className="k">Recent activity</div>
      {auditEvents.slice(0, 6).map((ev, idx) => (
        <div key={idx} className="ev">
          <time>{ev.time}</time>
          <span>
            {ev.actor} · {ev.text}
            {ev.security && (
              <span className="mono" style={{ color: "var(--bronze)", marginLeft: "8px" }}>
                ⚑ SECURITY
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
