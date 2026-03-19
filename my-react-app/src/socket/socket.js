import io from "socket.io-client";

// Detect socket server URL based on current host
const getSocketUrl = () => {
  const env =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_REACT_APP_SERVER_URL;

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // On localhost: use the backend port (or env override)
  if (isLocalhost) {
    return env || 'http://localhost:5001';
  }

  // On ngrok/remote: ALWAYS use the current page origin (no localhost override)
  return window.location.origin;
};

const SOCKET_SERVER_URL = getSocketUrl();
console.log('[Socket] Connecting to:', SOCKET_SERVER_URL);

let socket = null;

try {
  socket = io(SOCKET_SERVER_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  // Connection events
  socket.on("connect", () => {
    console.log("✅ Connected to server:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from server");
  });

  socket.on("connect_error", (error) => {
    console.warn("⚠️ Socket connection error (this is normal if backend isn't running):", error.message);
  });
} catch (error) {
  console.warn("Socket.io initialization error:", error.message);
  // Create a mock socket that does nothing
  socket = {
    emit: () => {},
    on: () => {},
    off: () => {},
    id: "mock-socket",
  };
}

export default socket;
