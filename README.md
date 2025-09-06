# Floorplan Upload Application

A simple web application for uploading and displaying floorplan images.

## Project Structure

- `backend/` - FastAPI backend server
- `frontend/` - React frontend with Vite and Tailwind CSS

## Quick Start

1. Run both backend and frontend:

```bash
./start.sh
```

Or run them separately:

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Usage

1. Open http://localhost:5173 in your browser
2. Upload a floorplan image by:
   - Dragging and dropping an image file
   - Or clicking "Browse Files" to select an image
3. The uploaded floorplan will be displayed
4. Click "Upload New Floorplan" to upload another image

## API Endpoints

- `POST /upload` - Upload an image file
- `GET /uploads/{filename}` - Retrieve uploaded images
