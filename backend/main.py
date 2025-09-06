from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
import uuid
import json
import asyncio
import time
from typing import List, Dict
import random
from pathlib import Path

app = FastAPI()

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Mount static files to serve uploaded images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# In-memory storage for processed images (in production, use a database)
processed_images: List[Dict] = []
active_connections = set()
processing_stats = {
    "total_uploaded": 0,
    "total_processed": 0,
    "currently_processing": 0,
    "start_time": time.time()
}

# Mock room types for demonstration
ROOM_TYPES = [
    {"id": 1, "name": "Living Room"},
    {"id": 2, "name": "Kitchen"},
    {"id": 3, "name": "Bathroom"},
    {"id": 4, "name": "Bedroom"},
    {"id": 5, "name": "Main room"},
]

@app.get("/")
async def root():
    return {"message": "Floorplan Upload API", "streaming": True}

@app.get("/health")
async def health_check():
    uptime = time.time() - processing_stats["start_time"]
    return {
        "status": "healthy",
        "streaming": {
            "active": True,
            "connections": len(active_connections),
            "endpoint": "/stream"
        },
        "processing": {
            "total_uploaded": processing_stats["total_uploaded"],
            "total_processed": processing_stats["total_processed"],
            "currently_processing": processing_stats["currently_processing"],
            "images_in_gallery": len(processed_images)
        },
        "uptime_seconds": round(uptime, 2),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/upload")
async def upload_floorplan(file: UploadFile = File(...), style: str = ""):
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    
    # Save the uploaded file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Update stats
    processing_stats["total_uploaded"] += 1
    
    # Start background processing (simulate room detection) with style
    asyncio.create_task(process_image_rooms(unique_filename, style))
    
    return {
        "message": "File uploaded successfully - processing started",
        "filename": unique_filename,
        "file_url": f"/uploads/{unique_filename}",
        "style": style,
        "processing": True,
        "estimated_processing_time": "10-15 seconds"
    }

async def process_image_rooms(filename: str, style: str = ""):
    """
    Simulate room detection and processing.
    In production, this would be your actual AI/ML room detection logic.
    """
    processing_stats["currently_processing"] += 1
    base_url = f"/uploads/{filename}"
    
    print(f"🔄 Starting processing for {filename} with style: '{style}'")
    
    # Simulate initial processing delay
    await asyncio.sleep(2)
    
    # Generate mock processed room images
    for i, room in enumerate(ROOM_TYPES):
        # Simulate processing time for each room
        await asyncio.sleep(random.uniform(1, 3))
        
        # Create processed image data
        processed_image = {
            "id": len(processed_images) + 1,
            "url": base_url,  # In production, this would be the processed room image URL
            "roomId": room["id"],
            "roomName": room["name"],
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "title": f"{room['name']} Analysis {i+1}",
            "style": style,  # Include the style in the processed image data
            "originalFilename": filename,
            "processingComplete": True
        }
        
        # Add to processed images
        processed_images.append(processed_image)
        processing_stats["total_processed"] += 1
        
        print(f"✅ Processed: {room['name']} for {filename} (style: {style})")
    
    processing_stats["currently_processing"] -= 1
    print(f"🎉 Completed processing for {filename}")

@app.get("/stream")
async def stream_processed_images():
    """
    Server-Sent Events endpoint for streaming processed images
    """
    async def event_generator():
        connection_id = uuid.uuid4()
        active_connections.add(connection_id)
        last_sent = 0
        
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Stream connected', 'timestamp': time.time()})}\n\n"
            
            while True:
                # Check for new processed images
                new_images = processed_images[last_sent:]
                
                if new_images:
                    # Send new images as SSE
                    for image in new_images:
                        data = json.dumps({**image, 'type': 'new_image'})
                        yield f"data: {data}\n\n"
                        last_sent += 1
                
                # Send periodic status updates
                status_data = {
                    'type': 'status',
                    'processing_count': processing_stats["currently_processing"],
                    'total_images': len(processed_images),
                    'timestamp': time.time()
                }
                yield f"data: {json.dumps(status_data)}\n\n"
                
                await asyncio.sleep(1)  # Check every second
                
        except Exception as e:
            print(f"❌ Streaming error for connection {connection_id}: {e}")
        finally:
            active_connections.discard(connection_id)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.get("/images")
async def get_all_images():
    """
    Get all processed images (for initial load)
    """
    return {
        "images": processed_images, 
        "count": len(processed_images),
        "processing_stats": processing_stats
    }

@app.delete("/images")
async def clear_images():
    """
    Clear all processed images (for testing)
    """
    global processed_images
    processed_images = []
    processing_stats["total_processed"] = 0
    return {"message": "All images cleared"}

@app.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)