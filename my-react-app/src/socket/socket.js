import io from "socket.io-client";

const getStoredAuthToken = () => {
  try {
    const authUser = JSON.parse(window.localStorage.getItem('notary.authUser') || 'null');
    return authUser?.token || '';
  } catch {
    return '';
  }
};

// Detect socket server URL based on current host and env variables
const getSocketUrl = () => {
  const env =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_REACT_APP_SERVER_URL;

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const localSocketCandidates = ['http://localhost:5001', 'http://localhost:5000', 'http://localhost:5002'];

  const fallbackUrls = [
    ...(isLocalhost ? localSocketCandidates : []),
    env,
    window.location.origin,
    ...(!isLocalhost ? localSocketCandidates : []),
  ].filter((url) => !!url);

  if (fallbackUrls.length === 0) {
    console.warn('[Socket] No socket URL candidate found; defaulting to window.origin');
    return window.location.origin;
  }

  if (isLocalhost) {
    const normalizedEnv = String(env || '').trim().toLowerCase();
    const envIsLocal = localSocketCandidates.some((candidate) => candidate.toLowerCase() === normalizedEnv);
    return envIsLocal ? env : localSocketCandidates[0];
  }

  return env || window.location.origin;
};

const SOCKET_SERVER_URL = getSocketUrl();
console.log('[Socket] Socket URL candidate:', SOCKET_SERVER_URL);

let socket = null;

try {
  socket = io(SOCKET_SERVER_URL, {
    auth: (cb) => cb({ token: getStoredAuthToken() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    transports: ['websocket', 'polling'],
    timeout: 20000,
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
    // Show more user-friendly message in console, but keep retrying
    setTimeout(() => {
      if (socket?.disconnected) {
        console.log('[Socket] reconnect attempt (connect_error)');
        socket.connect();
      }
    }, 1500);
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
