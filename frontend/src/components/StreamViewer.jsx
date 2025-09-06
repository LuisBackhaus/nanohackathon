import React, { useState, useEffect, useRef } from 'react';
import './StreamViewer.css';

const StreamViewer = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentImage, setCurrentImage] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  const connectToStream = () => {
    try {
      setError(null);
      eventSourceRef.current = new EventSource('http://localhost:8000/stream');
      
      eventSourceRef.current.onopen = () => {
        console.log('Connected to stream');
        setIsConnected(true);
      };

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'data') {
            setCurrentFrame(data.frame);
            setMetrics(data.metrics);
            setMessages(prev => [
              ...prev.slice(-9), // Keep last 10 messages
              {
                id: data.frame,
                message: data.message,
                timestamp: new Date(data.timestamp * 1000).toLocaleTimeString()
              }
            ]);
          } else if (data.type === 'image') {
            setCurrentImage(data.data);
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      eventSourceRef.current.onerror = (event) => {
        console.error('Stream error:', event);
        setError('Connection lost. Please try reconnecting.');
        setIsConnected(false);
      };

    } catch (err) {
      setError('Failed to connect to stream');
      console.error('Connection error:', err);
    }
  };

  const disconnectFromStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setIsConnected(false);
      setCurrentImage(null);
      setMessages([]);
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="stream-viewer">
      <header className="stream-header">
        <h1>Streaming Demo</h1>
        <div className="controls">
          <button 
            onClick={isConnected ? disconnectFromStream : connectToStream}
            className={`btn ${isConnected ? 'btn-danger' : 'btn-primary'}`}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
          <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </header>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="stream-content">
        <div className="image-section">
          <h2>Live Stream</h2>
          <div className="image-container">
            {currentImage ? (
              <img src={currentImage} alt={`Frame ${currentFrame}`} />
            ) : (
              <div className="placeholder">
                {isConnected ? 'Waiting for images...' : 'Connect to see live stream'}
              </div>
            )}
          </div>
          <div className="frame-info">
            Frame: {currentFrame}
          </div>
        </div>

        <div className="data-section">
          <div className="metrics">
            <h3>Live Metrics</h3>
            <div className="metric-grid">
              <div className="metric">
                <span className="metric-label">CPU Usage</span>
                <span className="metric-value">{metrics.cpu_usage?.toFixed(1)}%</span>
              </div>
              <div className="metric">
                <span className="metric-label">Memory Usage</span>
                <span className="metric-value">{metrics.memory_usage?.toFixed(1)}%</span>
              </div>
              <div className="metric">
                <span className="metric-label">FPS</span>
                <span className="metric-value">{metrics.fps}</span>
              </div>
            </div>
          </div>

          <div className="messages">
            <h3>Messages</h3>
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg.id} className="message">
                  <span className="message-time">{msg.timestamp}</span>
                  <span className="message-text">{msg.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;
