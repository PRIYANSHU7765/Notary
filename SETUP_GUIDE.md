# ⚡ Quick Setup Guide

## Step 1: Terminal 1 - Start Backend Server

```bash
# From the Notary folder root
npm install express socket.io cors
node server.js
```

**Expected Output:**
```
╔════════════════════════════════════════════════════╗
║  🔏 Notarization Platform - Server                 ║
║  Server running on: http://localhost:5000          ║
║  Environment: development                          ║
╚════════════════════════════════════════════════════╝
```

---

## Step 2: Terminal 2 - Start Frontend Dev Server

```bash
# From the Notary/my-react-app folder
npm run dev
```

**Expected Output:**
```
  VITE v8.0.0  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

---

## Step 3: Open Browser & Test

1. **Open two browser windows/tabs:**
   - Tab 1: `http://localhost:5173`
   - Tab 2: `http://localhost:5173` (same or different browser)

2. **Tab 1 - Document Owner:**
   - Click "I am a Document Owner"
   - Upload a PDF or image
   - **Copy the Session ID** (shown in header)

3. **Tab 2 - Notary:**
   - Click "I am a Notary"
   - **Paste the Session ID** from Tab 1
   - Click "Join Session"

4. **Both tabs are now synced!**
   - Owner uploads document
   - Notary drags stamps
   - Both see updates in real-time

---

## 🎯 Testing Features

### Test 1: Drag & Drop Signatures
- **Notary:** Drag "Official Stamp" from sidebar → document
- **Owner:** Should see stamp appear instantly

### Test 2: Draw Signature
- Click "✏️ Draw Signature" button
- Draw in the canvas
- Click "Save Signature"
- Drag your new signature onto document

### Test 3: Real-time Sync
- **Owner:** Drag "Owner Signature" from sidebar
- **Notary:** Should see it appear instantly
- **Both:** Can delete (but only for their elements)

### Test 4: Screen Recording
- Click "🔴 Start Recording"
- Place some signatures
- Click "⏹️ Stop Recording"
- Click "⬇️ Download Recording" to save the session

---

## 📦 Project Dependencies

### Already Installed:
```json
{
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "react-pdf": "latest",
  "react-konva": "latest",
  "konva": "latest",
  "react-dnd": "latest",
  "react-dnd-html5-backend": "latest",
  "react-signature-canvas": "latest",
  "socket.io-client": "latest",
  "pdf-lib": "latest",
  "pdfjs-dist": "latest",
  "react-media-recorder": "latest",
  "use-image": "latest"
}
```

### Backend Dependencies (needed):
```bash
npm install express socket.io cors
```

---

## 🔧 Verify Installation

### Check Frontend:
```bash
cd my-react-app
npm list react-pdf react-konva socket.io-client
```

Should show all packages installed.

### Check Backend:
```bash
npm list express socket.io cors
```

---

## ❌ Common Issues & Solutions

### Issue: "Port 5173 already in use"
```bash
# Kill the process on port 5173
# Windows PowerShell:
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :5173
kill -9 <PID>
```

### Issue: "Socket.io connection refused"
- **Check:** Backend server is running on port 5000
- **Check:** Firewall allows localhost connections
- **Check:** Browser DevTools > Network shows WS/WebSocket connections

### Issue: "Cannot find module 'react-pdf'"
```bash
cd my-react-app
npm install
```

### Issue: "PDF viewer shows blank"
- Ensure PDF file is valid
- Check browser console for errors
- Try with a sample PDF first

---

## 🌐 Network Setup (Optional)

To test on multiple machines:

### Backend: Listen on all interfaces
Edit `server.js`:
```javascript
server.listen(PORT, '0.0.0.0', () => {
  // Now accessible on your IP: http://192.168.x.x:5000
});
```

### Frontend: Update Socket URL
Edit `src/socket/socket.js`:
```javascript
const SOCKET_SERVER_URL = "http://192.168.x.x:5000";
```

---

## 🎮 Demo Scenario

1. **Alice (Owner):**
   ```
   - Starts the app → Selects "Document Owner"
   - Uploads a document: "contract.pdf"
   - Session ID: notary-session-1234567890
   ```

2. **Bob (Notary):**
   ```
   - Starts the app → Selects "Notary"
   - Enters Session ID: notary-session-1234567890
   - Joins the session
   ```

3. **Live Collaboration:**
   ```
   Alice: Drags "Owner Signature" → Canvas
   Bob:   Instantly sees signature appear
   Bob:   Drags "Official Stamp" → Canvas
   Alice: Instantly sees stamp appear
   Bob:   Starts screen recording
   Both:  Place more signatures
   Bob:   Stops recording & downloads video
   ```

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                Browser Window 1 (Owner)            │
│  ┌──────────────────────────────────────────────┐  │
│  │  React App (OwnerPage)                       │  │
│  │  ├─ PdfViewer                               │  │
│  │  ├─ CanvasBoard                             │  │
│  │  ├─ SidebarAssets                           │  │
│  │  └─ ScreenRecorder                          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                      │ WebSocket
                      │ (Socket.io)
                      ▼
        ┌─────────────────────────────┐
        │  Node.js Backend            │
        │  (port 5000)                │
        │                             │
        │  ├─ Express Server          │
        │  ├─ Socket.io               │
        │  ├─ Session Management      │
        │  └─ Real-time Sync          │
        └─────────────────────────────┘
                      ▲
                      │ WebSocket
                      │ (Socket.io)
┌─────────────────────────────────────────────────────┐
│                Browser Window 2 (Notary)           │
│  ┌──────────────────────────────────────────────┐  │
│  │  React App (NotaryPage)                      │  │
│  │  ├─ CanvasBoard                             │  │
│  │  ├─ SidebarAssets                           │  │
│  │  ├─ ScreenRecorder                          │  │
│  │  └─ Session Tracker                         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Next Steps

1. ✅ Get the app running locally
2. ✅ Test with two browser windows
3. ✅ Try all features (drag, draw, record)
4. 🔄 Customize stamps and signatures
5. 🚀 Deploy to production (Vercel, Heroku, AWS)
6. 🔐 Add authentication & database
7. 📱 Create mobile app version

---

## 🎉 You're All Set!

The Digital Notarization Platform is ready to use. Enjoy! 🔏✍️

For detailed documentation, see **README.md**.

---

**Questions?** Check the troubleshooting section or console errors.
