import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCoords, normalizeLoc, wrapLng } from "../lib/geo";
import { attachAutoSpin, createGlobe, hasWebGL, loadMaplibre } from "../lib/maplibreLoader";
import "./globe.css";

// Modal for choosing where a parcel is. Click the globe (or drag the pin), use the device location,
// or type coordinates. It is rendered into document.body so it is never inside the Register <form>
// (otherwise pressing Enter in a coordinate box would submit the registration).
export default function LocationPicker({ initial, onConfirm, onCancel }) {
  const [pin, setPin] = useState(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [accuracy, setAccuracy] = useState(null);
  const [message, setMessage] = useState("");
  const [mapNote, setMapNote] = useState("");
  const [latText, setLatText] = useState(initial ? String(initial.lat) : "");
  const [lngText, setLngText] = useState(initial ? String(initial.lng) : "");

  const containerRef = useRef(null);
  const dialogRef = useRef(null);
  const mapRef = useRef(null);
  const libRef = useRef(null);
  const markerRef = useRef(null);
  const spinnerRef = useRef(null);
  const placePinRef = useRef(() => false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  const placePin = useCallback((lat, lng, { fly = false, acc = null } = {}) => {
    const loc = normalizeLoc(lat, lng);
    if (!loc) return false;
    setPin(loc);
    setLatText(String(loc.lat));
    setLngText(String(loc.lng));
    setAccuracy(acc);
    const lib = libRef.current;
    const map = mapRef.current;
    if (lib && map) {
      if (!markerRef.current) {
        const marker = new lib.Marker({ draggable: true, color: "#D2A363" }).setLngLat([loc.lng, loc.lat]).addTo(map);
        marker.on("dragend", () => {
          const dropped = marker.getLngLat();
          placePinRef.current(dropped.lat, wrapLng(dropped.lng));
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat([loc.lng, loc.lat]);
      }
      if (fly) map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 16), essential: true });
    }
    return true;
  }, []);
  useEffect(() => {
    placePinRef.current = placePin;
  }, [placePin]);

  useEffect(() => {
    if (!hasWebGL()) {
      setMapNote("This device cannot draw the globe. Type the coordinates below instead.");
      return undefined;
    }
    let cancelled = false;
    let instance = null;
    loadMaplibre()
      .then((lib) => {
        if (cancelled || !containerRef.current) return;
        libRef.current = lib;
        const start = initial ? { center: [initial.lng, initial.lat], zoom: 14 } : undefined;
        instance = createGlobe(lib, containerRef.current, start);
        mapRef.current = instance;
        if (initial) {
          placePinRef.current(initial.lat, initial.lng);
        } else {
          spinnerRef.current = attachAutoSpin(instance);
        }
        instance.on("click", (event) => {
          if (spinnerRef.current) spinnerRef.current.stop();
          placePinRef.current(event.lngLat.lat, wrapLng(event.lngLat.lng));
        });
      })
      .catch(() => {
        if (!cancelled) setMapNote("The map could not load. Type the coordinates below instead.");
      });
    return () => {
      cancelled = true;
      if (spinnerRef.current) spinnerRef.current.stop();
      spinnerRef.current = null;
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = null;
      if (instance) instance.remove();
      mapRef.current = null;
      libRef.current = null;
    };
    // The picker is mounted fresh each time it opens, so reading `initial` once is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the dialog once when it opens, and close on Escape.
  useEffect(() => {
    if (dialogRef.current) dialogRef.current.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const useMyLocation = () => {
    if (!window.isSecureContext) {
      setMessage("Device location only works on a secure (https) page.");
      return;
    }
    if (!navigator.geolocation) {
      setMessage("This browser cannot provide a location. Click the map instead.");
      return;
    }
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: meters } = position.coords;
        if (spinnerRef.current) spinnerRef.current.stop();
        if (placePin(latitude, longitude, { fly: true, acc: Math.round(meters) })) {
          setMessage("");
        } else {
          setMessage("The device returned an unusable location. Click the map instead.");
        }
      },
      (error) => {
        setMessage(
          error.code === 1
            ? "Permission denied. Allow location access for this site, or click the map instead."
            : error.code === 3
            ? "Finding your location timed out. Try again outdoors, or click the map."
            : "Your location is not available right now. Click the map instead."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const applyTyped = () => {
    if (!placePin(latText, lngText, { fly: true })) {
      setMessage("Enter a latitude between -90 and 90 and a longitude between -180 and 180.");
    } else {
      setMessage("");
    }
  };

  const clearPin = () => {
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = null;
    setPin(null);
    setAccuracy(null);
    setLatText("");
    setLngText("");
  };

  return createPortal(
    <div className="lp-backdrop">
      <div className="lp" role="dialog" aria-modal="true" aria-label="Pick parcel location" tabIndex={-1} ref={dialogRef}>
        <div className="lp-head">
          <h3>Pick a location</h3>
          <button type="button" className="btn alt" onClick={onCancel}>CLOSE</button>
        </div>
        <p className="note lp-note">
          The coordinates are saved in the public parcel record and cannot be removed afterwards.
          During the pilot, use a test location and never a real home.
        </p>
        <div className="lp-map">
          <div ref={containerRef} className="globe" />
          {mapNote && <div className="globe-loading">{mapNote}</div>}
        </div>
        <div className="lp-body">
          <div className="lp-row">
            <button type="button" className="btn alt" onClick={useMyLocation}>USE MY LOCATION</button>
            <span className="mono lp-hint">or click the globe · drag the pin to adjust</span>
          </div>
          <div className="lp-row">
            <label>
              LATITUDE
              <input
                value={latText}
                inputMode="decimal"
                onChange={(event) => setLatText(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), applyTyped())}
              />
            </label>
            <label>
              LONGITUDE
              <input
                value={lngText}
                inputMode="decimal"
                onChange={(event) => setLngText(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), applyTyped())}
              />
            </label>
            <button type="button" className="btn alt" onClick={applyTyped}>SET PIN</button>
          </div>
          {message && <p className="note" role="status">{message}</p>}
          {pin && <p className="mono lp-coords">{formatCoords(pin)}</p>}
          {accuracy !== null && (
            <p className="mono lp-hint">
              Device accuracy about {accuracy} m.
              {accuracy > 100 ? " That is rough: check the pin and drag it to the right spot." : ""}
            </p>
          )}
          <div className="lp-row lp-actions">
            <button type="button" className="btn alt" onClick={clearPin} disabled={!pin}>CLEAR PIN</button>
            <button type="button" className="btn" onClick={() => pin && onConfirm(pin)} disabled={!pin}>USE THIS LOCATION</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
