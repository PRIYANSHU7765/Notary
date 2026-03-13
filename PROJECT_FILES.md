# 📁 Project Files & Directory Structure

## Root Folder: `/Notary`

```
Notary/
├── my-react-app/                          # React Frontend (Main App)
├── server.js                              # Node.js Backend Server
├── package.json                           # Backend dependencies
├── README.md                              # Main documentation
├── SETUP_GUIDE.md                         # Quick setup instructions
├── FEATURES_SUMMARY.md                    # Feature overview & implementation
└── PROJECT_FILES.md                       # This file
```

---

## Frontend: `/Notary/my-react-app`

### Configuration Files
```
my-react-app/
├── package.json                           # NPM dependencies & scripts
├── vite.config.js                         # Vite build configuration
├── eslint.config.js                       # ESLint rules
├── index.html                             # HTML entry point
└── .gitignore                             # Git ignore rules
```

### Source Code: `/src`

#### Main Application Files
```
src/
├── main.jsx                               # Vite entry point
├── App.jsx                                # Root component (imports HomePage)
├── App.css                                # Global app styles
└── index.css                              # Base CSS variables
```

#### Pages (User Interface Screens)
```
src/pages/
├── HomePage.jsx                           # 🏠 Role selection page
│                                          # - Owner vs Notary buttons
│                                          # - Feature showcase
│                                          # - Animated gradient background
│
├── OwnerPage.jsx                          # 📄 Document Owner dashboard
│                                          # - Document upload
│                                          # - PDF viewer
│                                          # - Canvas board
│                                          # - Screen recorder
│                                          # - Session management
│
└── NotaryPage.jsx                         # ✍️ Notary dashboard
                                           # - Session joining
                                           # - Canvas for stamps
                                           # - Screen recorder
                                           # - Element tracking
```

#### Components (Reusable UI Elements)
```
src/components/
├── PdfViewer.jsx                          # 📑 PDF/Image document viewer
│                                          # - Multi-page navigation
│                                          # - Scale/zoom support
│                                          # - Error handling
│
├── CanvasBoard.jsx                        # 🎨 Main interactive canvas
│                                          # - Drag-drop signatures
│                                          # - Konva.js-based drawing
│                                          # - Element selection/deletion
│                                          # - Real-time sync
│
├── SignaturePad.jsx                       # ✏️ Signature drawing tool
│                                          # - Touch-friendly canvas
│                                          # - PNG export
│                                          # - Clear & save functions
│
├── SidebarAssets.jsx                      # 🎁 Asset management sidebar
│                                          # - Draggable assets
│                                          # - Custom signature generation
│                                          # - Asset filtering by role
│
└── ScreenRecorder.jsx                     # 🎥 WebRTC screen recording
                                           # - Start/stop controls
                                           # - Video playback
                                           # - Download functionality
                                           # - Audio permission handling
```

#### Socket.io Configuration
```
src/socket/
└── socket.js                              # 🔌 Socket.io client setup
                                           # - Connection management
                                           # - Event handlers
                                           # - Reconnection logic
```

#### Utilities (Helper Functions)
```
src/utils/
└── (future location for helper functions)
```

#### Static Assets
```
src/assets/
├── react.svg                              # React logo
├── vite.svg                               # Vite logo
└── hero.png                               # Hero image
```

---

## Backend: `/Notary/server.js`

**Single File Backend Server**

Key Features:
- Express.js HTTP server
- Socket.io WebSocket handling
- Session management
- User presence tracking
- Event broadcasting
- CORS configuration

Run with:
```bash
npm install express socket.io cors
node server.js
```

Server Features:
- Listens on `http://localhost:5000`
- `/health` endpoint for monitoring
- Session storage (in-memory)
- User connection/disconnection handling

---

## File Purpose Quick Reference

| File | Purpose | Technology |
|------|---------|------------|
| `HomePage.jsx` | Role selection UI | React |
| `OwnerPage.jsx` | Owner dashboard | React + Socket.io |
| `NotaryPage.jsx` | Notary dashboard | React + Socket.io |
| `PdfViewer.jsx` | PDF display | react-pdf |
| `CanvasBoard.jsx` | Signature placement | react-konva |
| `SignaturePad.jsx` | Signature drawing | react-signature-canvas |
| `SidebarAssets.jsx` | Asset management | React (HTML5 drag-drop) |
| `ScreenRecorder.jsx` | Session recording | MediaRecorder API |
| `socket.js` | Real-time sync | socket.io-client |
| `server.js` | Backend server | Express + Socket.io |
| `App.jsx` | Root component | React |
| `App.css` | Component styles | CSS3 |
| `index.css` | Global styles | CSS3 |
| `vite.config.js` | Build configuration | Vite |
| `package.json` | Dependencies | NPM |

---

## Installation & Dependencies

### Frontend Dependencies (`my-react-app/package.json`)

```json
{
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-pdf": "latest",           // PDF viewing
    "react-konva": "latest",         // Canvas drawing
    "konva": "latest",               // Konva library
    "react-dnd": "latest",           // Drag & drop (prepare)
    "react-dnd-html5-backend": "latest",  // Drag & drop backend
    "react-signature-canvas": "latest",   // Signature drawing
    "socket.io-client": "latest",    // Real-time communication
    "pdf-lib": "latest",             // PDF manipulation
    "pdfjs-dist": "latest",          // PDF.js worker
    "react-media-recorder": "latest", // Media recording
    "use-image": "latest"            // Image loading hook
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.0",
    "vite": "^8.0.0",
    "eslint": "^9.39.4"
  }
}
```

### Backend Dependencies

```bash
npm install express socket.io cors
```

---

## How to Navigate the Code

### To understand the app flow:
1. Start: `src/Main.jsx` → `src/App.jsx`
2. Then: `src/pages/HomePage.jsx`
3. Choose: `src/pages/OwnerPage.jsx` OR `src/pages/NotaryPage.jsx`

### To understand real-time sync:
1. Check: `src/socket/socket.js`
2. Events: Search `socket.emit()` and `socket.on()`
3. Backend: `server.js` for server-side handling

### To modify canvas behavior:
1. Main: `src/components/CanvasBoard.jsx`
2. Styles: `src/App.css` (canvas-board class)
3. Konva: See react-konva documentation

### To add new signatures:
1. Edit: `src/components/SidebarAssets.jsx`
2. Add to `assets` array with new object
3. Drag from sidebar to canvas

### To change styling:
1. Global: `src/index.css`
2. App: `src/App.css`
3. Per-component: Inline styles or CSS classes

---

## File Size & Performance

### Production Build Sizes
```
dist/index.html            0.46 kB
dist/assets/index.css      2.98 kB (gzipped: 1.17 kB)
dist/assets/index.js     995.50 kB (gzipped: 300.24 kB)
```

**Note:** Large bundle size due to:
- react-pdf (includes PDF.js)
- konva.js (canvas library)
- socket.io-client

### Optimization Opportunities
- Code splitting with React.lazy()
- Dynamic imports for heavy libraries
- Image compression
- Tree-shaking unused code

---

## Environment Variables

Create `.env` in `my-react-app/`:
```env
VITE_REACT_APP_SERVER_URL=http://localhost:5000
VITE_REACT_APP_ENV=development
VITE_REACT_APP_VERSION=1.0.0
```

Access in code:
```javascript
const serverUrl = import.meta.env.VITE_REACT_APP_SERVER_URL;
```

---

## Git Structure Recommendation

```
.gitignore
├── node_modules/
├── dist/
├── .env
└── *.log
```

Suggested commits:
1. Initial setup
2. Component scaffolding
3. Socket.io integration
4. UI/styling
5. Features refinement

---

## Key Component Props

### OwnerPage
```jsx
<OwnerPage />
// No props - controlled by useState internally
```

### NotaryPage
```jsx
<NotaryPage sessionId={sessionId} />
// Optional: pre-populated sessionId
```

### PdfViewer
```jsx
<PdfViewer
  file={file}                    // File object or URL
  onLoadSuccess={callback}       // Called with pageCount
  containerHeight="600px"        // Container height
/>
```

### CanvasBoard
```jsx
<CanvasBoard
  elements={elements}            // Array of signature objects
  onElementAdd={callback}        // When element added
  onElementUpdate={callback}     // When element moved
  onElementRemove={callback}     // When element deleted
  canvasWidth={800}              // Canvas width
  canvasHeight={600}             // Canvas height
/>
```

### SignaturePad
```jsx
<SignaturePad
  onSignatureGenerated={callback} // Called with PNG data URL
  title="Draw Your Signature"     // Modal title
/>
```

### SidebarAssets
```jsx
<SidebarAssets
  userRole="owner"                // 'owner' or 'notary'
  onAssetGenerated={callback}     // When new asset created
/>
```

### ScreenRecorder
```jsx
<ScreenRecorder />
// No props - fully self-contained
```

---

## Common File Modifications

### Add a new stamp:
File: `src/components/SidebarAssets.jsx`
Find: `setAssets([...])`
Add new object to array

### Change server URL:
File: `src/socket/socket.js`
Find: `const SOCKET_SERVER_URL = ...`
Update URL

### Modify canvas size:
File: `src/pages/OwnerPage.jsx` & `NotaryPage.jsx`
Find: `<CanvasBoard canvasWidth={...} canvasHeight={...} />`
Update dimensions

### Change button styles:
File: `src/App.css`
Find: `button { ... }`
Modify CSS properties

---

## Debugging Tips

### Check Socket Connection:
```javascript
// In browser console
console.log(socket.connected)  // true/false
console.log(socket.id)         // socket ID
```

### Check Canvas Elements:
```javascript
console.log(elements)          // See all elements
```

### Check Network Requests:
DevTools → Network tab → Filter for "socket.io"

### Check Errors:
DevTools → Console tab → Look for red errors

---

## Next Steps for Development

1. ✅ Core features implemented
2. 🔄 Test locally with two browsers
3. 🎨 Customize stamps & signatures
4. 🔐 Add authentication (optional)
5. 📦 Deploy backend
6. 🚀 Deploy frontend
7. 📱 Add mobile optimization
8. 🧪 Add unit tests

---

**Happy Coding! 🚀**

For questions, refer to:
- README.md - Full documentation
- SETUP_GUIDE.md - Quick start
- FEATURES_SUMMARY.md - Feature details
