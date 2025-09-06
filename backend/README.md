# Backend

FastAPI backend for streaming images and JSON data.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
python main.py
```

The server will start on http://localhost:8000

## Endpoints

- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /stream` - Streaming endpoint that returns interleaved JSON and image data

## Features

- CORS enabled for frontend communication
- Server-Sent Events (SSE) for real-time streaming
- Generated demo images with frame numbers and animations
- JSON metadata with metrics and timestamps
- Base64 encoded images for easy frontend consumption
