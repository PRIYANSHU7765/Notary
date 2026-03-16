import io from "socket.io-client";

// Detect socket server URL from environment or API base
const getSocketUrl = () => {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env && (env.includes('localhost') || env.includes('127.0.0.1'))) {
    // Extract just the origin from API URL
    try {
      const url = new URL(env);
      return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
    } catch (e) {
      // Fall through to defaults
    }
  }
  // Try common ports
  return 'http://localhost:5001';
};

const SOCKET_SERVER_URL = getSocketUrl();

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
