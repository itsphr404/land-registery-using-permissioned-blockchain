import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AREAS, ST } from "../lib/mapData";
import { boundsOf } from "../lib/geo";
import { attachAutoSpin, createGlobe, hasWebGL, loadMaplibre } from "../lib/maplibreLoader";
import { useWallet } from "../context/WalletContext";
import PlotCard from "./PlotCard";
import "./globe.css";

const STATUS_KEYS = Object.keys(ST);
const HOME_VIEW = { center: [-40, 25], zoom: 1.5 };

const isMine = (plot, account) =>
  Boolean(account) && plot.owners.some((owner) => owner.addr && owner.addr.toLowerCase() === account.toLowerCase());

// Globe version of the map page. Same sidebar (search, status filters, list) and the same parcel
// card as the district map. Parcels with a recorded location sit at that spot; parcels without one
// are shown at a stable demo placement and drawn hollow so nobody mistakes them for real positions.
export default function GlobeView({ plots, onSelectView, onFail }) {
  const { account } = useWallet();
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [tileProblem, setTileProblem] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [statusFilters, setStatusFilters] = useState({ approved: true, sale: true, disputed: true, court: true, pending: true });

  const containerRef = useRef(null);
  const spinnerRef = useRef(null);
  const markersRef = useRef(new Map());
  const libRef = useRef(null);
  const onFailRef = useRef(onFail);
  const plotsRef = useRef(plots);
  const selectRef = useRef(() => {});

  // Keep the latest props reachable from long-lived callbacks (marker clicks, async loading).
  useEffect(() => {
    onFailRef.current = onFail;
    plotsRef.current = plots;
  });

  // Create the globe once. maplibre-gl is fetched on demand; any failure hands control back to the district map.
  useEffect(() => {
    if (!hasWebGL()) {
      onFailRef.current?.("this browser has no WebGL support");
      return undefined;
    }
    let cancelled = false;
    let instance = null;
    let readyTimer = null;
    const markers = markersRef.current;

    loadMaplibre()
      .then((lib) => {
        if (cancelled || !containerRef.current) return;
        libRef.current = lib;
        instance = createGlobe(lib, containerRef.current, HOME_VIEW);
        const spinner = attachAutoSpin(instance);
        spinnerRef.current = spinner;
        setSpinning(spinner.isOn());
        instance.on("movestart", (event) => {
          if (event && event.originalEvent) setSpinning(false);
        });
        let tileErrors = 0;
        instance.on("error", (event) => {
          if (event && (event.sourceId === "base" || event.tile)) {
            tileErrors += 1;
            if (tileErrors >= 3) setTileProblem(true);
          }
        });
        instance.on("load", () => setReady(true));
        readyTimer = setTimeout(() => setReady(true), 8000); // never leave the loading overlay up forever
        setMap(instance);
      })
      .catch((error) => {
        if (!cancelled) onFailRef.current?.((error && error.message) || "the map library did not load");
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      if (spinnerRef.current) spinnerRef.current.stop();
      spinnerRef.current = null;
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      if (instance) instance.remove();
      libRef.current = null;
      setMap(null);
      setReady(false);
    };
  }, []);

  const stopSpin = useCallback(() => {
    if (spinnerRef.current) spinnerRef.current.stop();
    setSpinning(false);
  }, []);

  const selectPlot = useCallback(
    (id) => {
      const plot = plotsRef.current.find((item) => item.id === id);
      if (!plot) return;
      setSelectedId(id);
      setStatusFilters((previous) => ({ ...previous, [plot.st]: true }));
      stopSpin();
      if (map && plot.loc) {
        map.flyTo({
          center: [plot.loc.lng, plot.loc.lat],
          zoom: Math.max(map.getZoom(), plot.locKind === "recorded" ? 16 : 11),
          speed: 1.3,
          essential: true
        });
      }
    },
    [map, stopSpin]
  );
  useEffect(() => {
    selectRef.current = selectPlot;
  }, [selectPlot]);

  // Keep one DOM marker per parcel and refresh its look whenever anything it depends on changes.
  useEffect(() => {
    const lib = libRef.current;
    if (!map || !lib) return;
    const markers = markersRef.current;
    const seen = new Set();
    plots.forEach((plot) => {
      if (!plot.loc) return;
      seen.add(plot.id);
      let entry = markers.get(plot.id);
      if (!entry) {
        const element = document.createElement("button");
        element.type = "button";
        element.classList.add("gm", "g");
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          selectRef.current(plot.id);
        });
        const marker = new lib.Marker({ element, anchor: "center" }).setLngLat([plot.loc.lng, plot.loc.lat]).addTo(map);
        entry = { marker, element };
        markers.set(plot.id, entry);
      } else {
        entry.marker.setLngLat([plot.loc.lng, plot.loc.lat]);
      }
      const { element } = entry;
      STATUS_KEYS.forEach((key) => element.classList.toggle(key, key === plot.st));
      element.classList.toggle("demo", plot.locKind === "demo");
      element.classList.toggle("mine", isMine(plot, account));
      element.classList.toggle("sel", plot.id === selectedId);
      element.classList.toggle("off", !statusFilters[plot.st]);
      element.textContent = ST[plot.st] ? ST[plot.st][1] : "?";
      element.title = `${plot.id} · ${plot.addr}`;
      element.setAttribute(
        "aria-label",
        `${plot.id}, ${ST[plot.st] ? ST[plot.st][0] : plot.st}${plot.locKind === "demo" ? ", demo location" : ""}`
      );
    });
    markers.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    });
  }, [map, plots, statusFilters, selectedId, account]);

  const counts = useMemo(() => {
    const result = { approved: 0, sale: 0, disputed: 0, court: 0, pending: 0 };
    plots.forEach((plot) => {
      if (result[plot.st] !== undefined) result[plot.st] += 1;
    });
    return result;
  }, [plots]);

  const visiblePlots = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return plots
      .filter((plot) => {
        if (!statusFilters[plot.st]) return false;
        if (!query) return true;
        return (plot.id + plot.addr + plot.owners.map((owner) => owner.label).join(" ")).toLowerCase().includes(query);
      })
      .slice(0, 50);
  }, [plots, statusFilters, searchQuery]);

  const selectedPlot = useMemo(() => plots.find((plot) => plot.id === selectedId) || null, [plots, selectedId]);

  const handleSearch = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchMsg("");
      return;
    }
    const matchedArea = Object.keys(AREAS).find((name) => name.toLowerCase().includes(query));
    if (matchedArea) {
      const inArea = plots.filter((plot) => plot.area === matchedArea);
      const bounds = boundsOf(inArea.map((plot) => plot.loc));
      if (bounds && map) {
        stopSpin();
        map.fitBounds(bounds, { padding: 90, maxZoom: 9, duration: 1200 });
        setSearchMsg(`Showing ${inArea.length} plot${inArea.length === 1 ? "" : "s"} in ${matchedArea}`);
      } else {
        setSearchMsg(`No plots in ${matchedArea} yet.`);
      }
      return;
    }
    const matchedPlot = plots.find((plot) =>
      (plot.id + plot.addr + plot.owners.map((owner) => owner.label).join(" ")).toLowerCase().includes(query)
    );
    if (matchedPlot) {
      setSearchMsg(`Found ${matchedPlot.id}`);
      selectPlot(matchedPlot.id);
      return;
    }
    setSearchMsg(`No area or plot matches “${searchQuery}”.`);
  };

  const fitAll = () => {
    if (!map) return;
    stopSpin();
    const bounds = boundsOf(plots.filter((plot) => statusFilters[plot.st]).map((plot) => plot.loc));
    if (!bounds) {
      map.flyTo(HOME_VIEW);
      return;
    }
    map.fitBounds(bounds, { padding: 90, maxZoom: 6, duration: 1400 });
  };

  const toggleSpin = () => {
    const spinner = spinnerRef.current;
    if (!spinner) return;
    if (spinner.isOn()) {
      spinner.stop();
      setSpinning(false);
    } else {
      spinner.start();
      setSpinning(true);
    }
  };

  return (
    <div className="mapwrap">
      <div className="side">
        <div className="srch">
          <input
            id="q"
            type="search"
            placeholder="Search area, plot ID or owner"
            aria-label="Search map"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSearch()}
          />
          <button className="btn" onClick={handleSearch}>GO</button>
        </div>
        {searchMsg && <p className="mono" style={{ color: "var(--mute)", margin: "8px 0 0" }}>{searchMsg}</p>}

        <div className="chips" role="group" aria-label="Show plots by status">
          {STATUS_KEYS.map((key) => (
            <button
              key={key}
              className="chip"
              aria-pressed={statusFilters[key]}
              onClick={() => setStatusFilters((previous) => ({ ...previous, [key]: !previous[key] }))}
            >
              <span className={`g ${key}`}>{ST[key][1]}</span>
              {ST[key][0]} {counts[key] || 0}
            </button>
          ))}
        </div>
        <p className="globe-legend">
          <span className="g demo-sample">…</span> hollow = demo location (none recorded) · gold ring = your plot
        </p>

        <div className="res">
          {visiblePlots.map((plot) => (
            <button key={plot.id} className={selectedId === plot.id ? "selected" : ""} onClick={() => selectPlot(plot.id)}>
              <span className={`g ${plot.st}`}>{ST[plot.st][1]}</span>
              <span>
                <strong className="mono">{plot.id}</strong>
                <br />
                <span style={{ fontSize: "13px", color: "var(--mute)" }}>
                  {plot.addr} · {ST[plot.st][0]}{plot.locKind === "demo" ? " · demo location" : ""}
                </span>
              </span>
            </button>
          ))}
          {visiblePlots.length === 0 && <p className="sub" style={{ padding: "16px 0" }}>No plots for this filter.</p>}
        </div>
      </div>

      <div className="mapbox">
        <div ref={containerRef} className="globe" />
        {!ready && <div className="globe-loading">Loading globe…</div>}
        {tileProblem && (
          <div className="globe-warn" role="status">
            Map tiles are not loading. Check your connection. Plots can still be browsed in the list.
          </div>
        )}

        <div className="zoom">
          <button onClick={() => map && map.zoomIn()} aria-label="Zoom in">+</button>
          <button onClick={() => map && map.zoomOut()} aria-label="Zoom out">−</button>
          <button onClick={fitAll} style={{ fontSize: "11px" }}>ALL</button>
          <button onClick={toggleSpin} aria-pressed={spinning} aria-label="Toggle rotation" style={{ fontSize: "10px" }}>SPIN</button>
        </div>

        <span className="tag">drag to rotate · scroll to zoom</span>

        {selectedPlot && (
          <PlotCard key={selectedPlot.id} plot={selectedPlot} onClose={() => setSelectedId(null)} onSelectView={onSelectView} />
        )}
      </div>
    </div>
  );
}
