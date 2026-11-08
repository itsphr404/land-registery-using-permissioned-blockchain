import React from "react";
import { config, deployment } from "../config";

export default function NetworkContractsPanel() {
  const contracts = deployment?.contracts || {};
  return (
    <div className="note">
      <div className="k">Network and contracts</div>
      <div className="lead"><span>Chain</span><i></i><span>{config.networkName} ({config.chainId})</span></div>
      {Object.entries(contracts).map(([name, contract]) => (
        <div className="lead" key={name}>
          <span>{name}</span>
          <i></i>
          <span>
            {config.explorerUrl
              ? <a href={`${config.explorerUrl}/address/${contract.address}`} target="_blank" rel="noreferrer">{contract.address}</a>
              : contract.address}
          </span>
        </div>
      ))}
      <div className="lead"><span>Deploy block</span><i></i><span>{deployment?.deployBlock || "Unavailable"}</span></div>
    </div>
  );
}
