import { useState, useEffect } from "react";

const API_BASE_URL = "http://localhost:8000";

/*
 * PRODUCTION READY STRUCTURE:
 * In production, replace MOCK_GALLERY with real JSON data from your backend.
 * Expected JSON structure for each image:
 * {
 *   id: number,           // unique image ID
 *   url: string,          // image URL
 *   roomId: number,       // room identifier for filtering
 *   roomName: string,     // human-readable room name
 *   timestamp: string,    // optional timestamp
 *   title: string         // optional image title
 * }
 *
 * The system will automatically:
 * - Group images by roomId and roomName
 * - Create dynamic filter sections (e.g., "Bathroom section", "Main room section")
 * - Filter images on the fly when sections are selected
 */

// Mock room data - this will come from your backend later
const MOCK_ROOMS = [
  { id: 1, name: "Living Room", type: "living" },
  { id: 2, name: "Kitchen", type: "kitchen" },
  { id: 3, name: "Bedroom 1", type: "bedroom" },
  { id: 4, name: "Bedroom 2", type: "bedroom" },
  { id: 5, name: "Bathroom", type: "bathroom" },
  { id: 6, name: "Toilet", type: "toilet" },
  { id: 7, name: "Hallway", type: "hallway" },
  { id: 8, name: "Storage", type: "storage" },
];

// Mock gallery images - in production this will come from your backend with real JSON data
const MOCK_GALLERY = [
  // Images with dynamic room IDs and names
  {
    id: 1,
    url: "https://via.placeholder.com/300x200/333333/FFFFFF?text=Plan+1",
    roomId: 5,
    roomName: "Bathroom",
    timestamp: "2024-01-01 10:30",
    title: "Bathroom Analysis 1",
  },
  {
    id: 2,
    url: "https://via.placeholder.com/300x200/666666/FFFFFF?text=Plan+2",
    roomId: 5,
    roomName: "Bathroom",
    timestamp: "2024-01-01 11:45",
    title: "Bathroom Analysis 2",
  },
  {
    id: 3,
    url: "https://via.placeholder.com/300x200/999999/FFFFFF?text=Plan+3",
    roomId: 1,
    roomName: "Main room",
    timestamp: "2024-01-01 14:20",
    title: "Main room Analysis 1",
  },
  {
    id: 4,
    url: "https://via.placeholder.com/300x200/CCCCCC/000000?text=Plan+4",
    roomId: 1,
    roomName: "Main room",
    timestamp: "2024-01-01 16:15",
    title: "Main room Analysis 2",
  },
  {
    id: 5,
    url: "https://via.placeholder.com/300x200/444444/FFFFFF?text=Plan+5",
    roomId: 5,
    roomName: "Bathroom",
    timestamp: "2024-01-01 10:35",
    title: "Bathroom Analysis 3",
  },
  {
    id: 6,
    url: "https://via.placeholder.com/300x200/555555/FFFFFF?text=Plan+6",
    roomId: 1,
    roomName: "Main room",
    timestamp: "2024-01-01 11:50",
    title: "Main room Analysis 3",
  },
  {
    id: 7,
    url: "https://via.placeholder.com/300x200/777777/FFFFFF?text=Plan+7",
    roomId: 5,
    roomName: "Bathroom",
    timestamp: "2024-01-01 14:25",
    title: "Bathroom Analysis 4",
  },
  {
    id: 8,
    url: "https://via.placeholder.com/300x200/888888/FFFFFF?text=Plan+8",
    roomId: 1,
    roomName: "Main room",
    timestamp: "2024-01-01 16:20",
    title: "Main room Analysis 4",
  },
  {
    id: 9,
    url: "https://via.placeholder.com/300x200/666666/FFFFFF?text=Plan+9",
    roomId: 2,
    roomName: "Kitchen",
    timestamp: "2024-01-01 10:40",
    title: "Kitchen Analysis 1",
  },
  {
    id: 10,
    url: "https://via.placeholder.com/300x200/777777/FFFFFF?text=Plan+10",
    roomId: 2,
    roomName: "Kitchen",
    timestamp: "2024-01-01 11:55",
    title: "Kitchen Analysis 2",
  },
];

function App() {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all"); // Track current filter (can be "all" or a roomId)
  const [showRoomView, setShowRoomView] = useState(false);

  // New state for streaming
  const [streamingImages, setStreamingImages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState("Ready");
  const [processingCount, setProcessingCount] = useState(0);
  const [desiredStyle, setDesiredStyle] = useState(""); // New state for style input
  const [selectedFile, setSelectedFile] = useState(null); // Store selected file before upload

  // Start streaming when room view is shown
  useEffect(() => {
    if (showRoomView) {
      startStreaming();
      loadExistingImages();
    }

    return () => {
      stopStreaming();
    };
  }, [showRoomView]);

  const startStreaming = () => {
    setIsStreaming(true);
    setStreamingStatus("Connecting...");

    const eventSource = new EventSource(`${API_BASE_URL}/stream`);

    eventSource.onopen = () => {
      console.log("🔥 Streaming connection opened");
      setStreamingStatus("Live Stream Active");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("✅ Stream connected:", data.message);
          return;
        }

        if (data.type === "status") {
          setProcessingCount(data.processing_count);
          return;
        }

        if (data.type === "new_image" && data.id && data.roomId) {
          console.log("📡 New image streamed:", data);
          setStreamingImages((prev) => {
            // Avoid duplicates
            const exists = prev.find((img) => img.id === data.id);
            if (exists) return prev;
            return [...prev, data];
          });
        }
      } catch (error) {
        console.error("❌ Error parsing streamed data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ Streaming error:", error);
      setStreamingStatus("Connection Error");
      eventSource.close();

      // Retry connection after 5 seconds
      setTimeout(() => {
        if (showRoomView) {
          startStreaming();
        }
      }, 5000);
    };

    // Store reference for cleanup
    window.streamingConnection = eventSource;
  };

  const stopStreaming = () => {
    if (window.streamingConnection) {
      window.streamingConnection.close();
      window.streamingConnection = null;
    }
    setIsStreaming(false);
    setStreamingStatus("Disconnected");
  };

  const loadExistingImages = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/images`);
      if (response.ok) {
        const data = await response.json();
        setStreamingImages(data.images);
        console.log("📦 Loaded existing images:", data.images.length);
      }
    } catch (error) {
      console.error("❌ Error loading existing images:", error);
    }
  };

    const handleFileUpload = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    console.log("📁 Starting file upload:", {
      name: file.name,
      size: file.size,
      type: file.type,
      style: desiredStyle
    });

    setIsUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("style", desiredStyle);

    try {
      console.log("🚀 Sending request to:", `${API_BASE_URL}/upload`);
      
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      console.log("📨 Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Upload failed with error:", errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Upload successful:", result);
      
      setUploadedImage(`${API_BASE_URL}${result.file_url}`);
      
      // Show processing status
      setStreamingStatus("Processing uploaded image...");
      
      // Automatically transition to room view after successful upload
      setTimeout(() => {
        setShowRoomView(true);
      }, 1500);
    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(`Failed to upload image: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    setSelectedFile(file); // Store file instead of uploading immediately
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file); // Store file instead of uploading immediately
  };

  const handleSubmit = () => {
    if (selectedFile) {
      handleFileUpload(selectedFile);
    }
  };

  const resetUpload = () => {
    setUploadedImage(null);
    setError("");
    setShowRoomView(false);
    setSelectedRoom(null);
  };

  const handleRoomSelect = (roomId) => {
    setSelectedRoom(roomId);
    setActiveFilter(roomId);
  };

  const handleShowAllImages = () => {
    setSelectedRoom(null);
    setActiveFilter("all");
  };

  // Get unique room sections from the gallery data
  const getRoomSections = () => {
    const roomMap = new Map();
    streamingImages.forEach((image) => {
      if (!roomMap.has(image.roomId)) {
        roomMap.set(image.roomId, {
          id: image.roomId,
          name: image.roomName,
          count: 0,
        });
      }
      roomMap.get(image.roomId).count++;
    });
    return Array.from(roomMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  };

  // Get images grouped by room sections for "All Images" view
  const getImagesBySection = () => {
    const sections = new Map();
    streamingImages.forEach((image) => {
      if (!sections.has(image.roomId)) {
        sections.set(image.roomId, {
          id: image.roomId,
          name: image.roomName,
          images: [],
        });
      }
      sections.get(image.roomId).images.push(image);
    });
    return Array.from(sections.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  };

  // Get filtered images based on active filter
  const getFilteredImages = () => {
    if (activeFilter === "all") {
      return streamingImages;
    }
    return streamingImages.filter((image) => image.roomId === activeFilter);
  };

  // Get image count for a specific room ID
  const getRoomImageCount = (roomId) => {
    return streamingImages.filter((image) => image.roomId === roomId).length;
  };

  const getCurrentDisplayImage = () => {
    if (selectedRoom) {
      // For now, return the same image. Later this will be the isolated room image
      return uploadedImage;
    }
    return uploadedImage;
  };

  if (showRoomView && uploadedImage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex h-screen">
          {/* Left sidebar */}
          <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <h1 className="text-xl font-semibold text-gray-900">
                Floorplan Analyzer
              </h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-6">
              <div className="space-y-2">
                <button
                  onClick={handleShowAllImages}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    activeFilter === "all"
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  All Images ({streamingImages.length})
                </button>

                <div className="pt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Room Sections
                  </p>
                  <div className="space-y-1">
                    {getRoomSections().map((room) => (
                      <button
                        key={room.id}
                        onClick={() => handleRoomSelect(room.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          activeFilter === room.id
                            ? "bg-gray-900 text-white"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {room.name} ({room.count})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </nav>
          </div>

          {/* Main content area */}
          <div className="flex-1 flex flex-col">
            {uploadedImage ? (
              <div className="flex-1 overflow-auto" id="main-content">
                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-semibold text-gray-900">
                      {activeFilter === "all"
                        ? "All Images"
                        : `${
                            getRoomSections().find(
                              (room) => room.id === activeFilter
                            )?.name || "Room"
                          } Section`}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {getFilteredImages().length} images
                    </span>
                  </div>

                  {activeFilter === "all" ? (
                    // Show sections when "All Images" is selected
                    <div className="space-y-12">
                      {getImagesBySection().map((section) => (
                        <div key={section.id}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {section.name} Section
                            </h3>
                            <span className="text-sm text-gray-500">
                              {section.images.length} images
                            </span>
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {section.images.map((image, index) => (
                              <div key={index} className="group relative">
                                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                                  <img
                                    src={image.url}
                                    alt={image.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </div>
                                <div className="mt-3">
                                  <h3 className="text-sm font-medium text-gray-900">
                                    {image.title}
                                  </h3>
                                  <p className="text-xs text-gray-500">
                                    {image.roomName}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    // Show flat grid when specific room is selected
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {getFilteredImages().map((image, index) => (
                        <div key={index} className="group relative">
                          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                            <img
                              src={image.url}
                              alt={image.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          </div>
                          <div className="mt-3">
                            <h3 className="text-sm font-medium text-gray-900">
                              {image.title}
                            </h3>
                            <p className="text-xs text-gray-500">
                              {image.roomName}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {getFilteredImages().length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-gray-400 mb-4">
                        <svg
                          className="mx-auto h-12 w-12"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">
                        No images found for this room type
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div
                  className="w-full max-w-md mx-auto p-8"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                      isDragging
                        ? "border-gray-400 bg-gray-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="text-gray-400 mb-4">
                      <svg
                        className="mx-auto h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>

                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Upload your floorplan
                    </h3>

                    <p className="text-sm text-gray-500 mb-4">
                      Drag and drop your image here, or click to select
                    </p>

                    <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      Choose file
                    </label>

                    {isUploading && (
                      <div className="mt-4">
                        <div className="text-sm text-gray-600">
                          Uploading...
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Original upload interface
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Floorplan Upload
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Upload your architectural floorplan and visualize it instantly.
              Supports various image formats for seamless integration.
            </p>
          </div>

          {!uploadedImage ? (
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
                        <p className="text-black font-semibold text-lg">
                          Uploading your floorplan...
                        </p>
                        <p className="text-gray-600 text-sm mt-1">
                          Please wait while we process your file
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="mx-auto w-20 h-20 bg-black rounded-full flex items-center justify-center shadow-lg">
                        <svg
                          className="w-10 h-10 text-white"
                          stroke="currentColor"
                          fill="none"
                          viewBox="0 0 48 48"
                        >
                          <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>

                      <div>
                        <p className="text-2xl font-semibold text-gray-800 mb-2">
                          {selectedFile ? `Selected: ${selectedFile.name}` : 'Drop your floorplan here'}
                        </p>
                        <p className="text-gray-600 mb-6">
                          {selectedFile ? 'File ready - set style and submit' : 'or browse to choose a file'}
                        </p>

                        <label
                          htmlFor="file-upload"
                          className="cursor-pointer group"
                        >
                          <span className={`hover:bg-gray-800 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 inline-flex items-center space-x-2 shadow-lg hover:shadow-xl ${
                            selectedFile ? 'bg-green-600 hover:bg-green-700' : 'bg-black'
                          }`}>
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                              />
                            </svg>
                            <span>{selectedFile ? 'Change File' : 'Choose File'}</span>
                          </span>
                        </label>

                        <input
                          id="file-upload"
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleFileChange}
                        />
                      </div>

                      {/* Style Input Field */}
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

                      {/* Submit Button */}
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
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-100 px-8 py-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-gray-700"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Upload Successful!
                    </h2>
                    <p className="text-gray-700">
                      Processing floorplan and detecting rooms...
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-8">
                <div className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
                  <div className="flex justify-center">
                    <img
                      src={uploadedImage}
                      alt="Uploaded Floorplan"
                      className="max-w-full h-auto rounded-lg shadow-md border border-gray-200"
                      style={{ maxHeight: "400px" }}
                    />
                  </div>
                </div>

                <div className="text-center">
                  <div className="inline-flex items-center space-x-2 text-gray-700 bg-gray-100 px-4 py-2 rounded-full border border-gray-200">
                    <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full"></div>
                    <span className="text-sm font-medium">
                      Analyzing rooms...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 bg-gray-50 border-l-4 border-gray-600 rounded-lg p-6 shadow-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-gray-900 font-semibold">Upload Failed</p>
                  <p className="text-gray-700 text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
