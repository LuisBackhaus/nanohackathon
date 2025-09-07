import { useEffect, useMemo, useRef, useState } from "react";

// ——— Configure this if your backend runs elsewhere ———
const API_BASE_URL = "http://localhost:8000";

// Utility helpers
const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const b64ToDataUrl = (b64) => `data:image/png;base64,${b64}`;

export default function App() {
  // Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [desiredStyle, setDesiredStyle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Viewer state
  const [uploadedImageUrl, setUploadedImageUrl] = useState(""); // original floor plan preview
  const [showViewer, setShowViewer] = useState(false);

  // Streaming state
  const eventSourceRef = useRef(null);
  const [streamStatus, setStreamStatus] = useState("Ready");
  const [statusLog, setStatusLog] = useState([]); // array of strings
  const [styleDescription, setStyleDescription] = useState("");

  // Rooms: id -> { id, name, dimensions }
  const [rooms, setRooms] = useState({});

  // Images: unified model rendered in the gallery
  // { id, url, title, roomId, roomName, kind, timestamp }
  const [images, setImages] = useState([]);

  // Filters
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | roomId | "__full__"

  // Derived: counts & sections
  const imagesByRoom = useMemo(() => {
    const map = new Map();
    for (const img of images) {
      const key = img.roomId || "__unknown__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(img);
    }
    return map; // Map<roomId, Image[]>
  }, [images]);

  const roomSections = useMemo(() => {
    // Build from rooms we know about + any room IDs present in images
    const set = new Map();

    // Include final assembly pseudo-room if present
    if (imagesByRoom.has("__full__")) {
      set.set("__full__", {
        id: "__full__",
        name: "Full Property",
        count: imagesByRoom.get("__full__").length,
      });
    }

    // Include known rooms
    Object.values(rooms).forEach((r) => {
      const count = imagesByRoom.get(r.id)?.length || 0;
      if (count > 0) set.set(r.id, { id: r.id, name: r.name, count });
    });

    // Include any other rooms that only appear in images
    for (const [rid, arr] of imagesByRoom.entries()) {
      if (rid === "__full__") continue;
      if (!set.has(rid)) {
        const name = rooms[rid]?.name || "Room";
        set.set(rid, { id: rid, name, count: arr.length });
      }
    }

    return Array.from(set.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms, imagesByRoom]);

  // ———————————————————————————————————————————————
  // Upload handlers
  // ———————————————————————————————————————————————
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", selectedFile);
      // Backend expects a string; empty string is OK and treated as provided.
      form.append("style", desiredStyle);

      const resp = await fetch(`${API_BASE_URL}/upload`, { method: "POST", body: form });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`${resp.status}: ${t}`);
      }
      const json = await resp.json();
      // The backend returns { file_url: "/uploads/<name>" }
      setUploadedImageUrl(`${API_BASE_URL}${json.file_url}`);
      setStreamStatus("Processing uploaded image…");
      setShowViewer(true); // triggers stream connect in useEffect below
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetAll = () => {
    // Close any open stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Reset state
    setSelectedFile(null);
    setDesiredStyle("");
    setUploadedImageUrl("");
    setShowViewer(false);
    setStreamStatus("Ready");
    setStatusLog([]);
    setStyleDescription("");
    setRooms({});
    setImages([]);
    setActiveFilter("all");
    setError("");
  };

  // ———————————————————————————————————————————————
  // Streaming (SSE)
  // ———————————————————————————————————————————————
  useEffect(() => {
    if (!showViewer) return;

    // Guard: avoid multiple connections
    if (eventSourceRef.current) return;

    const es = new EventSource(`${API_BASE_URL}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStreamStatus("Live Stream Active");
    };

    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        // Two shapes exist:
        // 1) initial: { type: "connected", message: "…" }
        // 2) streamed: { type: <event>, data: {...}, timestamp }
        const { type } = payload;

        if (type === "connected") {
          setStreamStatus("Connected");
          return;
        }

        // Standard pipeline events
        const data = payload.data || {};

        switch (type) {
          case "status": {
            const msg = data.message || "Working…";
            setStreamStatus(msg);
            setStatusLog((old) => [msg, ...old].slice(0, 100));
            break;
          }

          case "style_description": {
            const desc = data.description || "";
            setStyleDescription(desc);
            break;
          }

          case "room_detected": {
            const { id, name, dimensions } = data;
            setRooms((prev) => ({ ...prev, [id]: { id, name, dimensions } }));
            break;
          }

          case "unfurnished_view": {
            const roomId = data.roomId;
            const roomName = rooms[roomId]?.name || "Room";
            const imageUrl = b64ToDataUrl(data.image);
            setImages((prev) => [
              ...prev,
              {
                id: uid(),
                url: imageUrl,
                title: `${roomName} – Unfurnished Isometric`,
                roomId,
                roomName,
                kind: "unfurnished_view",
                timestamp: new Date().toISOString(),
              },
            ]);
            break;
          }

          case "furnished_view": {
            const roomId = data.roomId;
            const roomName = rooms[roomId]?.name || "Room";
            const imageUrl = b64ToDataUrl(data.image);
            const title = data.title || `${roomName} – Furnished View`;
            setImages((prev) => [
              ...prev,
              {
                id: uid(),
                url: imageUrl,
                title,
                roomId,
                roomName,
                kind: "furnished_view",
                timestamp: new Date().toISOString(),
              },
            ]);
            break;
          }

          case "interior_shot": {
            const roomId = data.roomId;
            const roomName = rooms[roomId]?.name || "Room";
            const imageUrl = b64ToDataUrl(data.image);
            const title = data.title || `${roomName} – Interior`;
            setImages((prev) => [
              ...prev,
              {
                id: uid(),
                url: imageUrl,
                title,
                roomId,
                roomName,
                kind: "interior_shot",
                timestamp: new Date().toISOString(),
              },
            ]);
            break;
          }

          case "final_assembly": {
            const imageUrl = b64ToDataUrl(data.image);
            const title = data.title || "Full Property – Assembled View";
            setImages((prev) => [
              ...prev,
              {
                id: uid(),
                url: imageUrl,
                title,
                roomId: "__full__",
                roomName: "Full Property",
                kind: "final_assembly",
                timestamp: new Date().toISOString(),
              },
            ]);
            break;
          }

          case "error": {
            const msg = data.message || "An error occurred";
            setError(msg);
            setStreamStatus("Error");
            break;
          }

          default:
            // Unknown event – ignore but keep in log for debugging
            if (type) setStatusLog((old) => [`[${type}]`, ...old].slice(0, 100));
            break;
        }
      } catch (e) {
        // If a single bad message arrives, keep the stream alive
        setStatusLog((old) => [`[parse-error] ${e?.message || e}`, ...old].slice(0, 100));
      }
    };

    es.onerror = () => {
      setStreamStatus("Connection Error (retrying…)");
      // Close & retry after a short delay
      try { es.close(); } catch {}
      eventSourceRef.current = null;
      setTimeout(() => {
        if (showViewer && !eventSourceRef.current) {
          // re-open
          const next = new EventSource(`${API_BASE_URL}/stream`);
          eventSourceRef.current = next;
          // reattach listeners by recursively re-running logic
          // simplest way: reload page state by toggling showViewer
          setShowViewer((s) => s); // noop to re-render
        }
      }, 1500);
    };

    return () => {
      try { es.close(); } catch {}
      eventSourceRef.current = null;
    };
  }, [showViewer, rooms]); // re-run if viewer opens

  // ———————————————————————————————————————————————
  // Gallery helpers
  // ———————————————————————————————————————————————
  const filteredImages = useMemo(() => {
    if (activeFilter === "all") return images;
    return images.filter((img) => img.roomId === activeFilter);
  }, [images, activeFilter]);

  const groupedForAll = useMemo(() => {
    // When "All Images" is selected, show sections:
    // 1) Full Property (if any)
    // 2) Each room alphabetically
    const blocks = [];

    if (imagesByRoom.has("__full__")) {
      blocks.push({
        id: "__full__",
        name: "Full Property",
        images: imagesByRoom.get("__full__"),
      });
    }

    const roomBlocks = [];
    for (const [rid, arr] of imagesByRoom.entries()) {
      if (rid === "__full__") continue;
      const name = rooms[rid]?.name || "Room";
      roomBlocks.push({ id: rid, name, images: arr });
    }

    roomBlocks.sort((a, b) => a.name.localeCompare(b.name));
    return [...blocks, ...roomBlocks];
  }, [imagesByRoom, rooms]);

  const activeFilterName = useMemo(() => {
    if (activeFilter === "all") return "All Images";
    if (activeFilter === "__full__") return "Full Property";
    return rooms[activeFilter]?.name || "Room";
  }, [activeFilter, rooms]);

  // ———————————————————————————————————————————————
  // UI Components
  // ———————————————————————————————————————————————
  const UploadCard = (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-8">
        <div
          className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ease-in-out ${
            isDragging
              ? "border-gray-600 bg-gray-100 scale-[1.02] shadow-md"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isUploading ? (
            <div className="space-y-4">
              <div className="relative">
                <div className="animate-spin h-12 w-12 border-4 border-gray-200 border-t-black rounded-full mx-auto"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 bg-black rounded-full animate-pulse"></div>
                </div>
              </div>
              <div>
                <p className="text-black font-semibold text-lg">Uploading your floorplan…</p>
                <p className="text-gray-600 text-sm mt-1">Please wait while we process your file</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="mx-auto w-20 h-20 bg-black rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div>
                <p className="text-2xl font-semibold text-gray-800 mb-2">
                  {selectedFile ? `Selected: ${selectedFile.name}` : "Drop your floorplan here"}
                </p>
                <p className="text-gray-600 mb-6">
                  {selectedFile ? "File ready – set style and submit" : "or browse to choose a file"}
                </p>

                <label htmlFor="file-upload" className="cursor-pointer group">
                  <span
                    className={`hover:bg-gray-800 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 inline-flex items-center space-x-2 shadow-lg hover:shadow-xl ${
                      selectedFile ? "bg-green-600 hover:bg-green-700" : "bg-black"
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>{selectedFile ? "Change File" : "Choose File"}</span>
                  </span>
                </label>
                <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>

              <div className="mt-6">
                <label htmlFor="style-input" className="block text-sm font-medium text-gray-700 mb-2">
                  Desired Style (Optional)
                </label>
                <input
                  id="style-input"
                  type="text"
                  value={desiredStyle}
                  onChange={(e) => setDesiredStyle(e.target.value)}
                  placeholder="e.g., Modern, Minimalist, Classic, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                />
              </div>

              {selectedFile && (
                <div className="mt-6">
                  <button
                    onClick={handleSubmit}
                    className="w-full bg-black hover:bg-gray-800 text-white px-8 py-4 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    Submit Floorplan
                  </button>
                </div>
              )}

              <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span>JPG</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span>PNG</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span>GIF</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-8 pb-8">
          <div className="mt-4 bg-gray-50 border-l-4 border-gray-600 rounded-lg p-4">
            <div className="flex">
              <svg className="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <p className="text-gray-900 font-semibold">Upload Failed</p>
                <p className="text-gray-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const Sidebar = (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Floorplan Analyzer</h1>
      </div>
      <nav className="flex-1 p-6">
        <div className="space-y-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              activeFilter === "all" ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            All Images ({images.length})
          </button>

          {roomSections.length > 0 && (
            <div className="pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Room Sections</p>
              <div className="space-y-1">
                {roomSections.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveFilter(r.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      activeFilter === r.id ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {r.name} ({r.count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status & Controls */}
        <div className="mt-8 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Stream</div>
          <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>{streamStatus}</span>
              <span className={`inline-flex h-2 w-2 rounded-full ${
                streamStatus.toLowerCase().includes("error") ? "bg-red-500" : streamStatus.includes("Active") || streamStatus.includes("Connected") ? "bg-green-500" : "bg-gray-400"
              }`} />
            </div>
          </div>
          <button
            onClick={resetAll}
            className="w-full mt-2 text-left px-3 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Start Over
          </button>
        </div>

        {statusLog.length > 0 && (
          <div className="mt-8">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Activity</div>
            <div className="h-40 overflow-auto text-xs bg-gray-50 border border-gray-200 rounded p-2 space-y-1">
              {statusLog.map((line, i) => (
                <div key={i} className="text-gray-700">• {line}</div>
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  );

  const StyleCard = styleDescription ? (
    <div className="mb-6 border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Style Description</h3>
        <button
          onClick={() => navigator.clipboard.writeText(styleDescription)}
          className="text-xs px-3 py-1 rounded bg-gray-900 text-white hover:bg-black"
        >
          Copy
        </button>
      </div>
      <div className="p-4 text-sm leading-6 text-gray-700 whitespace-pre-wrap">{styleDescription}</div>
    </div>
  ) : null;

  const GalleryGrid = ({ list }) => (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {list.map((image) => (
        <div key={image.id} className="group relative">
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
            <img src={image.url} alt={image.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
          </div>
          <div className="mt-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-gray-900">{image.title}</h3>
              <p className="text-xs text-gray-500">{image.roomName}</p>
            </div>
            <div className="flex items-center gap-1">
              <a href={image.url} download className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Save</a>
              <a href={image.url} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Open</a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const Viewer = (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {Sidebar}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top preview of original floorplan */}
          {uploadedImageUrl && (
            <div className="bg-white border-b border-gray-200">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">Uploaded Floorplan</span>
                  <span className="text-xs text-gray-500">Live processing updates will appear below</span>
                </div>
                <div className="text-xs text-gray-500">Style: {desiredStyle || "(not specified)"}</div>
              </div>
              {/* <div className="px-6 pb-4 h-max-12">
                <img src={uploadedImageUrl} alt="Uploaded Floorplan" className="max-h-72 rounded-md border border-gray-200 shadow-sm" />
              </div> */}
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">{activeFilterName}</h2>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{activeFilter === "all" ? images.length : filteredImages.length} images</span>
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-200">
                    <span className={`h-2 w-2 rounded-full ${
                      streamStatus.toLowerCase().includes("error") ? "bg-red-500" : streamStatus.includes("Active") || streamStatus.includes("Connected") ? "bg-green-500" : "bg-gray-400"
                    }`}></span>
                    <span>{streamStatus}</span>
                  </span>
                </div>
              </div>

              {// StyleCard
              }

              {activeFilter === "all" ? (
                <div className="space-y-12">
                  {groupedForAll.map((section) => (
                    <div key={section.id}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{section.name} Section</h3>
                        <span className="text-sm text-gray-500">{section.images.length} images</span>
                      </div>
                      <GalleryGrid list={section.images} />
                    </div>
                  ))}

                  {groupedForAll.length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-gray-400 mb-4">
                        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">No images yet — processing will stream results here.</p>
                    </div>
                  )}
                </div>
              ) : (
                <GalleryGrid list={filteredImages} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ———————————————————————————————————————————————
  // Render
  // ———————————————————————————————————————————————
  if (showViewer) return Viewer;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">Floorplan Upload</h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Upload your architectural floorplan and visualize it as rooms and photorealistic renders — streamed live as the pipeline progresses.
            </p>
          </div>
          {UploadCard}
        </div>
      </div>
    </div>
  );
}