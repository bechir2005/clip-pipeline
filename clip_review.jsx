import { useState, useRef, useCallback } from "react";

// ---- Design tokens ----
// Charcoal editing-room backdrop, amber = approve/primary, clay = reject,
// sage = secondary/order. Mono for timecodes (genuinely data, not decor).
const C = {
  bg: "#1C1B1A",
  panel: "#242220",
  panelBorder: "#38352F",
  text: "#F2EEE7",
  textDim: "#A69E8F",
  amber: "#E8A33D",
  clay: "#C1503A",
  sage: "#8FA98A",
};

const SFX_OPTIONS = [
  { value: "", label: "No sound effect" },
  { value: "airhorn", label: "Airhorn" },
  { value: "vine_boom", label: "Vine boom" },
  { value: "record_scratch", label: "Record scratch" },
  { value: "cash_register", label: "Cash register" },
  { value: "sad_trombone", label: "Sad trombone" },
  { value: "crowd_cheer", label: "Crowd cheer" },
];

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyClip(url, i) {
  return {
    id: makeId(),
    url,
    label: `Clip ${i + 1}`,
    approved: null, // null = undecided, true/false after review
    order: i + 1,
    sfx: "",
    sfxTime: "",
    webcamZoom: false,
    zoomBox: { x: 0.7, y: 0.6, w: 0.25, h: 0.35 }, // relative 0-1 coords
  };
}

function DraggableZoomBox({ box, onChange }) {
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const clamp = (v) => Math.min(1 - box.w, Math.max(0, v));
  const clampY = (v) => Math.min(1 - box.h, Math.max(0, v));

  const handlePointerDown = (e) => {
    dragging.current = true;
    e.target.setPointerCapture(e.pointerId);
  };
  const handlePointerUp = () => {
    dragging.current = false;
  };
  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - box.w / 2;
      const relY = (e.clientY - rect.top) / rect.height - box.h / 2;
      onChange({ ...box, x: clamp(relX), y: clampY(relY) });
    },
    [box, onChange]
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "crosshair",
      }}
      onPointerMove={handlePointerMove}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          position: "absolute",
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          border: `2px solid ${C.amber}`,
          background: "rgba(232,163,61,0.15)",
          borderRadius: 4,
          cursor: "grab",
          boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: C.amber,
            whiteSpace: "nowrap",
          }}
        >
          drag to webcam
        </div>
      </div>
    </div>
  );
}

function ClipCard({ clip, index, total, onUpdate, onMove }) {
  const decided = clip.approved !== null;
  const isTrashed = clip.approved === false;

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${isTrashed ? C.panelBorder : C.panelBorder}`,
        borderRadius: 10,
        padding: 16,
        marginBottom: 14,
        opacity: isTrashed ? 0.45 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Preview column */}
        <div style={{ flex: "0 0 260px" }}>
          <div
            style={{
              position: "relative",
              width: 260,
              height: 146,
              background: "#000",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <video
              src={clip.url}
              controls
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {clip.webcamZoom && (
              <DraggableZoomBox
                box={clip.zoomBox}
                onChange={(zoomBox) => onUpdate(clip.id, { zoomBox })}
              />
            )}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: C.textDim,
              marginTop: 6,
            }}
          >
            {clip.label}
          </div>
        </div>

        {/* Controls column */}
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          {/* Approve / trash */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => onUpdate(clip.id, { approved: true })}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${clip.approved === true ? C.amber : C.panelBorder}`,
                background: clip.approved === true ? C.amber : "transparent",
                color: clip.approved === true ? "#1C1B1A" : C.text,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Keep
            </button>
            <button
              onClick={() => onUpdate(clip.id, { approved: false })}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${clip.approved === false ? C.clay : C.panelBorder}`,
                background: clip.approved === false ? C.clay : "transparent",
                color: clip.approved === false ? "#1C1B1A" : C.text,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Trash
            </button>
          </div>

          {!isTrashed && (
            <>
              {/* Order */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Position in final video</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => onMove(clip.id, -1)}
                    disabled={index === 0}
                    style={stepperBtn}
                  >
                    –
                  </button>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: C.sage,
                      minWidth: 24,
                      textAlign: "center",
                    }}
                  >
                    {index + 1}
                  </span>
                  <button
                    onClick={() => onMove(clip.id, 1)}
                    disabled={index === total - 1}
                    style={stepperBtn}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* SFX */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Sound effect</label>
                <select
                  value={clip.sfx}
                  onChange={(e) => onUpdate(clip.id, { sfx: e.target.value })}
                  style={selectStyle}
                >
                  {SFX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {clip.sfx && (
                  <input
                    type="text"
                    placeholder="timestamp e.g. 0:07 (optional)"
                    value={clip.sfxTime}
                    onChange={(e) =>
                      onUpdate(clip.id, { sfxTime: e.target.value })
                    }
                    style={{ ...selectStyle, marginTop: 6 }}
                  />
                )}
              </div>

              {/* Webcam zoom */}
              <div>
                <label
                  style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={clip.webcamZoom}
                    onChange={(e) =>
                      onUpdate(clip.id, { webcamZoom: e.target.checked })
                    }
                  />
                  Zoom on webcam at end of clip
                </label>
                {clip.webcamZoom && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    Drag the box on the preview onto the webcam
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  color: C.textDim,
  marginBottom: 6,
};

const selectStyle = {
  width: "100%",
  padding: "7px 8px",
  borderRadius: 6,
  border: `1px solid ${C.panelBorder}`,
  background: "#1A1918",
  color: C.text,
  fontSize: 13,
};

const stepperBtn = {
  width: 26,
  height: 26,
  borderRadius: 5,
  border: `1px solid ${C.panelBorder}`,
  background: "transparent",
  color: C.text,
  cursor: "pointer",
  fontSize: 15,
  lineHeight: "1",
};

export default function ClipReviewApp() {
  const [clips, setClips] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [exported, setExported] = useState(null);

  const loadUrls = () => {
    const urls = urlInput
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    setClips(urls.map((u, i) => emptyClip(u, i)));
    setExported(null);
  };

  const updateClip = (id, patch) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const moveClip = (id, dir) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const kept = clips.filter((c) => c.approved === true);
  const undecided = clips.filter((c) => c.approved === null).length;

  const exportManifest = () => {
    const manifest = {
      generated_at: new Date().toISOString(),
      clips: kept.map((c, i) => ({
        id: c.id,
        url: c.url,
        order: i + 1,
        sfx: c.sfx || null,
        sfx_time: c.sfxTime || null,
        webcam_zoom: c.webcamZoom
          ? { enabled: true, crop: c.zoomBox, apply_at: "end" }
          : { enabled: false },
      })),
    };
    setExported(JSON.stringify(manifest, null, 2));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "28px 20px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Archivo', 'Inter', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: "-0.01em",
            marginBottom: 4,
          }}
        >
          Clip triage
        </h1>
        <p style={{ color: C.textDim, marginTop: 0, marginBottom: 20, fontSize: 14 }}>
          Paste clip URLs from storage, then keep, order, and mark up each one.
        </p>

        {clips.length === 0 ? (
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <label style={labelStyle}>Clip URLs (one per line)</label>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={"https://your-bucket.s3.amazonaws.com/clip_001.mp4\nhttps://your-bucket.s3.amazonaws.com/clip_002.mp4"}
              rows={6}
              style={{
                ...selectStyle,
                fontFamily: "'JetBrains Mono', monospace",
                resize: "vertical",
              }}
            />
            <button
              onClick={loadUrls}
              disabled={!urlInput.trim()}
              style={{
                marginTop: 10,
                padding: "9px 16px",
                borderRadius: 7,
                border: "none",
                background: C.amber,
                color: "#1C1B1A",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Load clips
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                fontSize: 13,
                color: C.textDim,
              }}
            >
              <span>
                {kept.length} kept · {undecided} undecided · {clips.length} total
              </span>
              <button
                onClick={() => {
                  setClips([]);
                  setUrlInput("");
                  setExported(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: C.textDim,
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                start over
              </button>
            </div>

            {clips.map((clip, i) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                index={kept.findIndex((c) => c.id === clip.id) >= 0 ? kept.findIndex((c) => c.id === clip.id) : i}
                total={kept.length || clips.length}
                onUpdate={updateClip}
                onMove={moveClip}
              />
            ))}

            <button
              onClick={exportManifest}
              disabled={kept.length === 0}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: kept.length ? C.sage : C.panelBorder,
                color: "#1C1B1A",
                fontWeight: 700,
                fontSize: 14,
                cursor: kept.length ? "pointer" : "not-allowed",
                marginTop: 8,
              }}
            >
              Export manifest ({kept.length} clip{kept.length !== 1 ? "s" : ""})
            </button>

            {exported && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>manifest.json — copy this to the render script</label>
                <textarea
                  readOnly
                  value={exported}
                  rows={12}
                  style={{
                    ...selectStyle,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
