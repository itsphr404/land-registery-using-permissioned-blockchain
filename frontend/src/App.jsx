import React, { useState, useMemo } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { VIEWS, generateDistrictPlots } from "./lib/mapData";
import { ADDRESS_LABELS } from "./config";
import { useParcels } from "./hooks/useParcels";
import MapView from "./components/MapView";
import DashboardView from "./components/DashboardView";
import RegistryView from "./components/RegistryView";
import SalesView from "./components/SalesView";
import RegisterView from "./components/RegisterView";
import { CorrectionsView, SharesView, AuditView } from "./components/ExtraViews";
import NetworkBanner from "./components/NetworkBanner";

const BASE_DISTRICT_PLOTS = generateDistrictPlots();

const INITIAL_AUDIT = [
  { time: "2026-10-28 13:49", actor: "System", text: "Deployed RoleManager, LandRegistry, TitleEscrow to Hardhat local node", security: true },
  { time: "2026-10-28 13:49", actor: "Seeder", text: "Created 5 on-chain parcels across all lifecycle stages", security: false },
  { time: "2026-10-28 13:49", actor: "Dave", text: "Deposited 1.0 ETH into TitleEscrow for Parcel #5", security: true },
  { time: "2026-10-28 13:49", actor: "Carol", text: "Consented to sale and listed Parcel #5", security: false },
  { time: "2026-10-28 13:49", actor: "Registrar", text: "Approved registration of Parcel #1 and #2", security: true },
  { time: "2026-10-28 13:49", actor: "Surveyor", text: "Verified boundary survey for Parcel #4", security: false },
];

function TerraApp() {
  const [activeTab, setActiveTab] = useState("map");
  const [auditEvents, setAuditEvents] = useState(INITIAL_AUDIT);
  const [toastMessage, setToastMessage] = useState(null);

  const { account, status, roles, connect, switchNetwork, error } = useWallet();
  const { parcels: onChainParcels } = useParcels();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Merge live on-chain parcels with the district map
  const plots = useMemo(() => {
    const list = [...BASE_DISTRICT_PLOTS];

    if (onChainParcels && onChainParcels.length > 0) {
      onChainParcels.forEach((onChainP, index) => {
        if (index < list.length) {
          const target = list[index];

          // Map on-chain status code to map status
          let st = "pending";
          if (onChainP.status === 3) st = "approved";
          else if (onChainP.status === 4) st = "sale";
          else if (onChainP.status === 2) st = "approved";
          else if (onChainP.status === 1) st = "pending";

          const ownersStr = onChainP.owners
            .map((addr, i) => {
              const label = ADDRESS_LABELS[addr.toLowerCase()] || `${addr.slice(0, 6)}...`;
              const isMe = account && addr.toLowerCase() === account.toLowerCase();
              return `${label} (${onChainP.shares[i]}%)${isMe ? " [YOU]" : ""}`;
            })
            .join(", ");

          target.id = `PARCEL-${onChainP.id}`;
          target.owner = ownersStr;
          target.st = st;

          if (onChainP.status === 4 && onChainP.deal) {
            target.sale = {
              buyer: ADDRESS_LABELS[onChainP.deal.buyer.toLowerCase()] || `${onChainP.deal.buyer.slice(0, 6)}...`,
              price: `${onChainP.deal.price} ETH`,
              funded: onChainP.deal.status === 2,
              sellerOk: onChainP.deal.sellerApproved,
              regOk: onChainP.deal.registrarApproved,
            };
          }
        }
      });
    }

    return list;
  }, [onChainParcels, account]);

  const handleRegisterNewPlot = (newPlotData) => {
    showToast(`Plot ${newPlotData.addr} submitted to registry pipeline.`);
    setAuditEvents((prev) => [
      {
        time: new Date().toISOString().slice(0, 16).replace("T", " "),
        actor: account ? (ADDRESS_LABELS[account.toLowerCase()] || "Citizen") : "Citizen",
        text: `Lodged new parcel: ${newPlotData.addr}`,
        security: false,
      },
      ...prev,
    ]);
    setActiveTab("map");
  };

  const activeRoleLabel = roles.registrar
    ? "Registrar"
    : roles.surveyor
    ? "Surveyor"
    : roles.court
    ? "Court Officer"
    : roles.admin
    ? "Admin"
    : roles.issuer
    ? "Issuer"
    : "Citizen";

  const userDisplayName = account
    ? (ADDRESS_LABELS[account.toLowerCase()] || `${account.slice(0, 6)}...${account.slice(-4)}`)
    : null;

  return (
    <div>
      {/* Top Banner from zip */}
      <div className="banner">
        <span>
          TERRA REGISTRY · LIVE ON-CHAIN EXPLORER · HARDHAT LOCAL NODE (31337)
        </span>
        <span className="mono">
          {account ? (
            <span>
              Connected: <strong>{userDisplayName}</strong> ({activeRoleLabel})
            </span>
          ) : (
            <span>Wallet not connected · Public Read-Only Mode</span>
          )}
        </span>
      </div>

      <NetworkBanner />

      {/* Error alert bar */}
      {error && (
        <div style={{ background: "var(--red)", color: "#fff", padding: "8px 20px", fontSize: "12px", fontFamily: "var(--mono)" }}>
          ⚠ {error}
        </div>
      )}

      {/* Main Header with Brand and Tabs */}
      <header>
        <div className="brand" style={{ cursor: "pointer" }} onClick={() => setActiveTab("map")}>
          Terra Registry<i>land title registry</i>
        </div>

        <nav id="nav" aria-label="Sections">
          {Object.entries(VIEWS).map(([viewKey, viewLabel]) => (
            <button
              key={viewKey}
              className={`tab-btn ${activeTab === viewKey ? "active" : ""}`}
              onClick={() => setActiveTab(viewKey)}
            >
              {viewLabel}
            </button>
          ))}
        </nav>

        {/* Role / Wallet Action Button */}
        <div className="role-box">
          {status === "ready" && account ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="stamp st-approved" style={{ margin: 0, fontSize: "10px" }}>
                {activeRoleLabel}
              </span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: "bold" }}>
                {userDisplayName}
              </span>
            </div>
          ) : status === "wrong-network" ? (
            <button
              className="btn"
              style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }}
              onClick={switchNetwork}
            >
              SWITCH TO HARDHAT (31337)
            </button>
          ) : (
            <button className="btn" onClick={connect}>
              CONNECT WALLET
            </button>
          )}
        </div>
      </header>

      {/* Active Tab Main View */}
      <main className="app-main">
        {activeTab === "map" && (
          <MapView plots={plots} onSelectView={setActiveTab} />
        )}
        {activeTab === "dashboard" && (
          <DashboardView
            plots={plots}
            auditEvents={auditEvents}
            onSelectView={setActiveTab}
            onFocusPlot={() => setActiveTab("map")}
          />
        )}
        {activeTab === "registry" && (
          <RegistryView plots={plots} onFocusPlot={() => setActiveTab("map")} />
        )}
        {activeTab === "sales" && (
          <SalesView plots={plots} onFocusPlot={() => setActiveTab("map")} />
        )}
        {activeTab === "register" && (
          <RegisterView onRegisterPlot={handleRegisterNewPlot} />
        )}
        {activeTab === "corrections" && <CorrectionsView />}
        {activeTab === "shares" && <SharesView />}
        {activeTab === "audit" && <AuditView events={auditEvents} />}
      </main>

      {/* Toast notification */}
      {toastMessage && (
        <div className="toast" role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <TerraApp />
    </WalletProvider>
  );
}
