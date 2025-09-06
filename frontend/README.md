# Frontend

React + Vite frontend for consuming streaming data from the FastAPI backend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at http://localhost:5173

## Features

- Real-time streaming using Server-Sent Events (SSE)
- Live image display with frame updates
- Real-time metrics dashboard
- Message log with timestamps
- Responsive design
- Connection status indicator
- Error handling and reconnection

## How it works

1. Click "Connect" to start receiving the stream from the backend
2. Watch live images being updated with frame numbers and animations
3. Monitor real-time metrics (CPU, Memory, FPS)
4. View processing messages in the message log
5. Click "Disconnect" to stop the stream

## Components

- `StreamViewer` - Main component handling the streaming connection and UI
- Uses EventSource API for Server-Sent Events
- Handles both JSON data and base64-encoded images
- Responsive grid layout for desktop and mobile

---

## Original Vite Template Info

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
