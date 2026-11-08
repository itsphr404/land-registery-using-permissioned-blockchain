import React, { useEffect, useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { VIEWS } from "./lib/mapData";
import { ADDRESS_LABELS, config } from "./config";
import { useParcels } from "./hooks/useParcels";
import MapView from "./components/MapView";
import DashboardView from "./components/DashboardView";
import RegistryView from "./components/RegistryView";
import SalesView from "./components/SalesView";
import RegisterView from "./components/RegisterView";
import { CorrectionsView, SharesView, AuditView } from "./components/ExtraViews";
import NetworkBanner from "./components/NetworkBanner";
import { useAudit } from "./hooks/useAudit";
import { usePendingWithdrawal } from "./hooks/usePendingWithdrawal";
import { VaultProvider } from "./context/VaultContext";
import { setTransactionNotifier } from "./lib/transactions";

function TerraApp() {
  const [activeTab, setActiveTab] = useState("map");
  const [toastMessage, setToastMessage] = useState(null);

  const { account, status, roles, connect, switchNetwork, error } = useWallet();
  const { parcels: plots, refresh: refreshParcels } = useParcels();
  const { formatted: owed, refresh: refreshOwed } = usePendingWithdrawal(account);
  const { events: auditEvents } = useAudit();

  const showToast = (toast) => {
    setToastMessage(toast);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    setTransactionNotifier(({ phase, hash }) => {
      showToast({ phase, hash });
      if (phase === "confirmed") refreshParcels();
    });
    return () => setTransactionNotifier(null);
  }, [refreshParcels]);

  const handleRegisterNewPlot = (newPlotData) => {
    showToast(`Plot ${newPlotData.addr} submitted to registry pipeline.`);
    setActiveTab("map");
    refreshParcels();
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
    <VaultProvider account={account}>
    <div>
      {/* Top Banner from zip */}
      <div className="banner">
        <span>
          TERRA REGISTRY · LIVE ON-CHAIN EXPLORER · {config.networkName} ({config.chainId})
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
          {Object.entries(VIEWS)
            .filter(([viewKey]) => config.chainId === 31337 || !["corrections", "shares"].includes(viewKey))
            .map(([viewKey, viewLabel]) => (
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
        {plots.length === 0 && activeTab !== "register" ? (
          <p className="sub" style={{ padding: "24px 0" }}>No parcels on this network yet. Register the first one.</p>
        ) : null}
        {activeTab === "map" && plots.length > 0 && (
          <MapView plots={plots} onSelectView={setActiveTab} />
        )}
        {activeTab === "dashboard" && (
          <DashboardView
            plots={plots}
            auditEvents={auditEvents}
            onSelectView={setActiveTab}
            onFocusPlot={() => setActiveTab("map")}
            onConfirmed={refreshParcels}
            owed={owed}
            onOwedConfirmed={refreshOwed}
          />
        )}
        {activeTab === "registry" && (
          <RegistryView plots={plots} onFocusPlot={() => setActiveTab("map")} />
        )}
        {activeTab === "sales" && (
          <SalesView plots={plots} onFocusPlot={() => setActiveTab("map")} onConfirmed={refreshParcels} owed={owed} onOwedConfirmed={refreshOwed} />
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
          {toastMessage.phase === "pending"
            ? "Waiting for confirmation, this can take a little while on a public network."
            : <>Transaction confirmed: {toastMessage.hash}{" "}
              {config.explorerUrl && <a href={`${config.explorerUrl}/tx/${toastMessage.hash}`} target="_blank" rel="noreferrer">View on Etherscan</a>}
            </>}
        </div>
      )}
    </div>
    </VaultProvider>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <TerraApp />
    </WalletProvider>
  );
}
