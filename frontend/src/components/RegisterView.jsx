import React, { useState } from "react";
import { AREAS } from "../lib/mapData";

export default function RegisterView({ onRegisterPlot }) {
  const [area, setArea] = useState("Northfield");
  const [addr, setAddr] = useState("");
  const [owner, setOwner] = useState("");
  const [size, setSize] = useState("");
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (addr.trim().length < 6) errs.addr = "Enter a full physical address.";
    if (owner.trim().length < 3) errs.owner = "Enter the owner’s full name or Ethereum address.";
    if (!Number(size) || Number(size) <= 0) errs.size = "Enter a size above zero.";

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onRegisterPlot({
      area,
      addr: addr.trim(),
      owner: owner.trim(),
      size: `${size} m²`,
    });

    setAddr("");
    setOwner("");
    setSize("");
  };

  return (
    <div>
      <h1 className="page-title">
        Register a <i>plot</i>
      </h1>
      <p className="sub">
        The new plot will be lodged into the registry pipeline, awaiting verification by an authorized surveyor and registrar.
      </p>

      <form className="f" onSubmit={handleSubmit}>
        <label>
          AREA
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {Object.keys(AREAS).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label>
          ADDRESS
          <input
            type="text"
            placeholder="e.g. 14 Market St, Northfield"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
          {errors.addr && <span className="err">{errors.addr}</span>}
        </label>

        <label>
          OWNER FULL NAME / ADDRESS
          <input
            type="text"
            placeholder="e.g. Alice Rao or 0x15d3..."
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
          {errors.owner && <span className="err">{errors.owner}</span>}
        </label>

        <label>
          SIZE (m²)
          <input
            type="number"
            placeholder="e.g. 450"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
          {errors.size && <span className="err">{errors.size}</span>}
        </label>

        <div className="note">
          In F2: Submitting connects to LandRegistry.submitParcel(owners, shares, docHash, cid).
        </div>

        <div>
          <button type="submit" className="btn">
            SUBMIT PLOT
          </button>
        </div>
      </form>
    </div>
  );
}
