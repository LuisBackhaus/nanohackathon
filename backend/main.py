from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
import uuid
import json
import asyncio
import time
from typing import List, Dict, Any, Tuple
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import io
import base64
import dataclasses
from dotenv import load_dotenv

# --- GenAI Imports ---
from google import genai
from pydantic import BaseModel, Field

# --- Environment and Configuration ---
load_dotenv()
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY not found in environment variables. Please set it in a .env file.")

# Configure the GenAI Client
client = genai.Client(api_key=API_KEY)
NANO_BANANA = "gemini-2.5-flash-image-preview"

# --- FastAPI App Setup ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# --- In-memory storage for streaming ---
# In a production environment, consider a more robust solution like Redis pub/sub
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[asyncio.Queue] = []

    async def connect(self, queue: asyncio.Queue):
        self.active_connections.append(queue)

    def disconnect(self, queue: asyncio.Queue):
        self.active_connections.remove(queue)

    async def broadcast(self, data: str):
        for queue in self.active_connections:
            await queue.put(data)

manager = ConnectionManager()

# --- Pydantic Models for GenAI ---
class RoomSegment(BaseModel):
    """Represents a single detected room from the floor plan."""
    label: str = Field(description="A descriptive name for the room (e.g., 'Living Room', 'Bedroom 1').")
    box_2d: list[int] = Field(description="The 2D bounding box coordinates [y0, x0, y1, x1].")
    dimensions: str = Field(description="The inferred dimensions of the room as a string (e.g., '13ft 4in x 9ft 0in').")

# --- Helper Functions from Notebook ---
@dataclasses.dataclass(frozen=True)
class RoomData:
  """A class to hold room data from bounding box detection."""
  y0: int
  x0: int
  y1: int
  x1: int
  label: str
  dimensions: str

def parse_json_output(json_output: str):
    """Parses JSON output from the model, removing markdown fencing."""
    if "```json" in json_output:
        json_output = json_output.split("```json")[1].split("```")[0]
    try:
        return json.loads(json_output)
    except json.JSONDecodeError:
        print(f"Warning: Could not parse JSON: {json_output}")
        return []

def parse_room_data(predicted_str: str, *, img_height: int, img_width: int, expand_percent: int = 5) -> list[RoomData]:
  """Parses the model's string output to a list of RoomData objects."""
  items = parse_json_output(predicted_str)
  rooms = []
  for item in items:
    try:
        y0, x0, y1, x1 = [int(c) for c in item["box_2d"]]
        y0 = int(y0 / 1000 * img_height)
        x0 = int(x0 / 1000 * img_width)
        y1 = int(y1 / 1000 * img_height)
        x1 = int(x1 / 1000 * img_width)

        if y0 >= y1 or x0 >= x1: continue

        if expand_percent > 0:
            dx = (x1 - x0) * (expand_percent / 100) / 2
            dy = (y1 - y0) * (expand_percent / 100) / 2
            x0 = max(0, int(x0 - dx))
            y0 = max(0, int(y0 - dy))
            x1 = min(img_width, int(x1 + dx))
            y1 = min(img_height, int(y1 + dy))

        rooms.append(RoomData(y0, x0, y1, x1, item.get("label", "Unknown"), item.get("dimensions", "N/A")))
    except (KeyError, IndexError, ValueError) as e:
        print(f"Skipping an item due to parsing error: {e}")
        continue
  return rooms

def image_to_base64(image: Image.Image, format="PNG") -> str:
    """Converts a PIL Image to a base64 string."""
    buffered = io.BytesIO()
    image.save(buffered, format=format)
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

async def stream_event(event_type: str, data: Dict[str, Any]):
    """Helper to format and broadcast a server-sent event."""
    payload = {"type": event_type, "data": data, "timestamp": time.time()}
    await manager.broadcast(f"data: {json.dumps(payload)}\n\n")

# --- Main Pipeline Logic ---
async def run_full_pipeline(image_bytes: bytes, style: str):
    """The main pipeline function, adapted from the notebook."""
    try:
        original_plan_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = original_plan_image.size
        await stream_event("status", {"message": "Step 1: Detecting rooms..."})

        # 1. Detect rooms
        segmentation_prompt = """
Analyze the provided floor plan. Identify every enclosed area.
For each area, provide a bounding box and infer its dimensions from any text labels present.
If a space contains multiple functions without walls (e.g., kitchen and dining), label it as a single combined space like "Kitchen/Dining Area".
The walls are the determining factor for separate rooms. Do combine the kitchen and living room if no wall separates them.
Include walls, doors and windows in the bounding box.
"""
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[segmentation_prompt, original_plan_image],
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": List[RoomSegment],
                "temperature": 0.4,
            },
        )
        room_detections = parse_room_data(response.text, img_height=h, img_width=w)
        
        # 2. Process detections and create room list
        rooms = []
        for rd in room_detections:
            room_id = str(uuid.uuid4())[:8]
            room_info = {
                "id": room_id,
                "name": rd.label,
                "dimensions": rd.dimensions,
                "bbox": (rd.x0, rd.y0, rd.x1, rd.y1),
                "isolated_plan": original_plan_image.crop((rd.x0, rd.y0, rd.x1, rd.y1))
            }
            rooms.append(room_info)
            await stream_event("room_detected", {"id": room_id, "name": rd.label, "dimensions": rd.dimensions})
        
        await stream_event("status", {"message": "Step 2: Generating style description..."})

        # 3. Generate style description
        style_prompt = f"Generate a detailed, concise description for a '{style}' interior design style. Focus on: color palette, furniture style (materials, shapes), lighting and accessories. This will guide image generation. Do not add any intro or outro."
        response = await client.aio.models.generate_content(model="gemini-2.5-flash", contents=style_prompt)
        style_description = response.text
        await stream_event("style_description", {"description": style_description})

        # 4. Generate views for each room
        for room in rooms:
            await stream_event("status", {"message": f"Processing room: {room['name']}..."})
            
            # 4a. Unfurnished isometric view
            unfurnished_iso_prompt = f"Generate a clean, unfurnished 3D isometric view of the room shown in this cropped floor plan. The room is the '{room['name']}' and its dimensions are approximately {room['dimensions']}. Only model the room itself. Walls are the boundaries. Show only the walls and floor. Do not include any furniture, decorations, or ceiling. The background must be plain white. Do not add any text or labels. Pay close attention to the placement of doors and windows from the plan."
            response = await client.aio.models.generate_content(model=NANO_BANANA, contents=[unfurnished_iso_prompt, room["isolated_plan"]])
            unfurnished_iso_img = response.parts[0].as_image()
            room["unfurnished_iso_img"] = unfurnished_iso_img
            await stream_event("unfurnished_view", {"roomId": room["id"], "image": image_to_base64(unfurnished_iso_img)})

            # 4b. Furnished isometric view
            furnish_prompt = f"Take this unfurnished 3D isometric view of the '{room['name']}' and furnish it completely according to the style description below. The final image must be a photorealistic, beautifully decorated room. Maintain perfect consistency with the room's structure (walls, windows).\n\nStyle Description:\n{style_description}"
            response = await client.aio.models.generate_content(model=NANO_BANANA, contents=[furnish_prompt, unfurnished_iso_img])
            furnished_iso_img = response.parts[0].as_image()
            room["furnished_iso_img"] = furnished_iso_img
            await stream_event("furnished_view", {"roomId": room["id"], "image": image_to_base64(furnished_iso_img), "title": f"{room['name']} - Furnished View"})

            # 4c. Interior eye-level views
            interior_shot_prompt = f"Based on this furnished isometric view of the '{room['name']}', generate 2 photorealistic, human-eye-level images from inside the room, each from a different angle. These should look like professional real estate photos. Maintain extreme consistency in style, furniture, and colors with the provided isometric view. Place yourself as a human in the room, looking around. RESPECTING THIS VIEW ANGLE AND LAYOUT IS CRUCIAL."
            response = await client.aio.models.generate_content(model=NANO_BANANA, contents=[interior_shot_prompt, furnished_iso_img])
            for i, part in enumerate(response.parts):
                if image := part.as_image():
                    await stream_event("interior_shot", {"roomId": room["id"], "image": image_to_base64(image), "title": f"{room['name']} - Interior Shot {i+1}"})

        # 5. Final assembled view
        await stream_event("status", {"message": "Step 5: Assembling final property view..."})
        assembly_prompt_parts = [
            "Assemble a single, complete 3D isometric view of the entire property. Use the original floor plan for the overall layout and positioning. Use the following furnished isometric room views to fill in the details for each corresponding room. The final image must be a cohesive, photorealistic, and beautifully decorated view of the entire floor, with all rooms furnished as shown in their individual images. Ensure all rooms are correctly placed and oriented relative to each other, as per the original floor plan.",
            original_plan_image
        ]
        for room in rooms:
            if "furnished_iso_img" in room:
                assembly_prompt_parts.append(room["furnished_iso_img"])
        
        response = await client.aio.models.generate_content(model=NANO_BANANA, contents=assembly_prompt_parts)
        final_image = response.parts[0].as_image()
        await stream_event("final_assembly", {"image": image_to_base64(final_image), "title": "Full Property - Assembled View"})

        await stream_event("status", {"message": "Pipeline complete!"})

    except Exception as e:
        print(f"An error occurred in the pipeline: {e}")
        await stream_event("error", {"message": str(e)})


# --- API Endpoints ---
@app.post("/upload")
async def upload_floorplan(background_tasks: asyncio.Task, file: UploadFile = File(...), style: str = Form(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    contents = await file.read()
    
    # Save original file for reference
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    with open(file_path, "wb") as f:
        f.write(contents)
        
    # Start the pipeline in the background
    background_tasks.add_task(run_full_pipeline, contents, style)
    
    return {
        "message": "File uploaded successfully - processing started",
        "filename": unique_filename,
        "file_url": f"/uploads/{unique_filename}"
    }

@app.get("/stream")
async def stream_events(request: Request):
    """Server-Sent Events endpoint for streaming pipeline results."""
    queue = asyncio.Queue()
    await manager.connect(queue)

    async def event_generator():
        try:
            # Send a connection confirmation message
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Stream connected'})}\n\n"
            while True:
                # Wait for a new message from the pipeline
                data = await queue.get()
                if await request.is_disconnected():
                    break
                yield data
        except asyncio.CancelledError:
            print("Client disconnected.")
        finally:
            manager.disconnect(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/")
async def root():
    return {"message": "Floorplan Generation API", "status": "running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)