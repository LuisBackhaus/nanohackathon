from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import asyncio
import json
import io
import base64
from PIL import Image, ImageDraw, ImageFont
import time
from typing import Generator

app = FastAPI(title="Streaming API", description="API for streaming images and JSON data")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_demo_image(frame_number: int, width: int = 400, height: int = 300) -> bytes:
    """Generate a simple demo image with frame number"""
    img = Image.new('RGB', (width, height), color=(70, 130, 180))
    draw = ImageDraw.Draw(img)
    
    # Try to use a font, fallback to default if not available
    try:
        font = ImageFont.truetype("Arial.ttf", 40)
    except:
        font = ImageFont.load_default()
    
    # Draw frame number and timestamp
    text = f"Frame {frame_number}"
    timestamp = f"Time: {time.strftime('%H:%M:%S')}"
    
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Center the text
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    draw.text((x, y), text, fill=(255, 255, 255), font=font)
    draw.text((10, 10), timestamp, fill=(255, 255, 255))
    
    # Add some animation - a moving circle
    circle_x = (frame_number * 5) % width
    draw.ellipse([circle_x - 10, height - 40, circle_x + 10, height - 20], fill=(255, 0, 0))
    
    # Convert to bytes
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='JPEG')
    return img_buffer.getvalue()

def stream_data() -> Generator[str, None, None]:
    """Generator that yields interleaved JSON and image data"""
    frame_count = 0
    
    while True:
        # Yield JSON data
        json_data = {
            "type": "data",
            "frame": frame_count,
            "timestamp": time.time(),
            "message": f"Processing frame {frame_count}",
            "metrics": {
                "cpu_usage": 45.2 + (frame_count % 20),
                "memory_usage": 78.5 + (frame_count % 15),
                "fps": 30
            }
        }
        
        yield f"data: {json.dumps(json_data)}\n\n"
        
        # Generate and yield image data
        img_bytes = generate_demo_image(frame_count)
        img_base64 = base64.b64encode(img_bytes).decode('utf-8')
        
        image_data = {
            "type": "image",
            "frame": frame_count,
            "data": f"data:image/jpeg;base64,{img_base64}",
            "timestamp": time.time()
        }
        
        yield f"data: {json.dumps(image_data)}\n\n"
        
        frame_count += 1
        time.sleep(0.5)  # 2 FPS for demo purposes
        
        # Stop after 100 frames for demo
        if frame_count >= 100:
            break

@app.get("/")
async def root():
    return {"message": "Streaming API Server", "endpoints": ["/stream", "/health"]}

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": time.time()}

@app.get("/stream")
async def stream_endpoint():
    """
    Streaming endpoint that returns interleaved JSON and image data
    Uses Server-Sent Events (SSE) format
    """
    return StreamingResponse(
        stream_data(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
