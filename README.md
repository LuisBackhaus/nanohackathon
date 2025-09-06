# Hackathon Streaming Project

A full-stack application demonstrating real-time streaming of images and JSON data using FastAPI and React.

## Architecture

```
nanohackathon/
├── backend/           # FastAPI server
│   ├── main.py       # Main application with streaming endpoint
│   ├── requirements.txt
│   └── README.md
├── frontend/         # React + Vite client
│   ├── src/
│   │   ├── components/
│   │   │   ├── StreamViewer.jsx
│   │   │   └── StreamViewer.css
│   │   ├── App.jsx
│   │   └── App.css
│   ├── package.json
│   └── README.md
└── README.md
```

## Features

- **Backend (FastAPI)**:
  - Streaming endpoint using Server-Sent Events (SSE)
  - Interleaved JSON and image data streaming
  - Generated demo images with animations
  - CORS enabled for frontend communication
  - Health check endpoints

- **Frontend (React + Vite)**:
  - Real-time streaming client using EventSource API
  - Live image display with frame updates
  - Real-time metrics dashboard
  - Message logging with timestamps
  - Responsive design
  - Connection management

## Quick Start

### 1. Start the Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend will be available at: http://localhost:8000

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at: http://localhost:5173

### 3. Demo the Streaming

1. Open the frontend in your browser
2. Click "Connect" to start the stream
3. Watch live images and metrics update in real-time
4. Monitor the message log for processing updates

## API Endpoints

- `GET /` - API information and available endpoints
- `GET /health` - Health check
- `GET /stream` - Streaming endpoint (SSE format)

## Technology Stack

- **Backend**: FastAPI, Uvicorn, Pillow, Python 3.8+
- **Frontend**: React 18, Vite, CSS3
- **Communication**: Server-Sent Events (SSE)
- **Image Format**: JPEG with Base64 encoding

## Development Notes

- The streaming endpoint generates demo images with frame numbers and moving animations
- JSON data includes metrics like CPU usage, memory usage, and FPS
- Images and JSON are interleaved in the stream for demonstration
- The demo runs for 100 frames (about 50 seconds at 2 FPS)
- CORS is configured to allow localhost:5173 connections

## Customization

To adapt this for your hackathon project:

1. **Backend**: Replace the demo image generation in `main.py` with your actual data source
2. **Frontend**: Modify the `StreamViewer` component to handle your specific data format
3. **Styling**: Update the CSS to match your project's design requirements
4. **Data Processing**: Add your own logic for processing and displaying the streamed data

## Troubleshooting

- Make sure both backend and frontend are running on the correct ports
- Check browser console for CORS or connection errors
- Verify the backend is accessible at http://localhost:8000/health
- For production deployment, update CORS settings and URLs accordingly
