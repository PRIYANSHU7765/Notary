# ⚡ Quick Reference Guide

## 🚀 Start the Project (3 Steps)

### Terminal 1: Start Backend
```bash
cd Notary
npm install express socket.io cors
node server.js
```
**Output:** `Server running on http://localhost:5000`

### Terminal 2: Start Frontend
```bash
cd Notary/my-react-app
npm run dev
```
**Output:** `Local: http://localhost:5173`

### Terminal 3: (Optional) Watch Builds
```bash
npm run build
```

---

## 📋 Testing the App

### Open Two Browser Windows
- **Window 1:** `http://localhost:5173` (OWNER)
- **Window 2:** `http://localhost:5173` (NOTARY)

### Quick Test Flow
1. **Window 1:** Choose "I am a Document Owner"
2. **Window 1:** Upload a PDF
3. **Window 1:** Copy the Session ID
4. **Window 2:** Choose "I am a Notary"
5. **Window 2:** Paste Session ID → Join
6. **Window 2:** Drag a stamp onto the canvas
7. **Window 1:** See stamp appear instantly ✨

---

## 🎮 Feature Shortcuts

| Feature | How To | Key Behind |
|---------|--------|-----------|
| **Draw Signature** | Click "✏️ Draw Signature" | Opens modal |
| **Place Signature** | Drag from sidebar → Canvas | HTML5 drag-drop |
| **Delete Element** | Click element → Press Delete | Keyboard event |
| **Record Session** | Click "🔴 Start Recording" | MediaRecorder API |
| **Share Session** | Copy/Paste Session ID | Socket.io room |
| **Real-time Sync** | Any action → See on other user | WebSocket event |

---

## 📁 Key File Locations

| Need To... | Edit File | Line ~# |
|------------|-----------|--------|
| Change server URL | `src/socket/socket.js` | 5 |
| Add custom stamp | `src/components/SidebarAssets.jsx` | 26 |
| Modify canvas size | `src/pages/OwnerPage.jsx` | 140 |
| Change button color | `src/App.css` | 17 |
| Add new page | `src/pages/NewPage.jsx` | - |
| Configure Socket events | `server.js` | 50 |

---

## 🔌 Socket.io Cheat Sheet

### Send Event (Client)
```javascript
socket.emit('elementAdded', {
  id: Date.now().toString(),
  x: 100,
  y: 200,
  image: 'data:image/png;base64,...',
  type: 'signature',
  user: 'owner'
});
```

### Listen for Event (Client)
```javascript
socket.on('elementAdded', (element) => {
  console.log('Signature added:', element);
});
```

### Send from Server
```javascript
io.to(roomId).emit('elementAdded', element);
```

---

## 🎨 Component Quick Reference

### Import a Component
```jsx
import CanvasBoard from '../components/CanvasBoard';
```

### Use a Component
```jsx
<CanvasBoard 
  elements={elements}
  onElementAdd={handleAdd}
  onElementUpdate={handleUpdate}
  onElementRemove={handleRemove}
/>
```

### Create State
```jsx
const [elements, setElements] = useState([]);
const [sessionId, setSessionId] = useState(null);
```

### Use Effect (Socket Events)
```jsx
useEffect(() => {
  socket.on('elementAdded', (element) => {
    setElements(prev => [...prev, element]);
  });
  return () => socket.off('elementAdded');
}, []);
```

---

## 💾 Common NPM Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Install new package
npm install package-name

# Uninstall package
npm uninstall package-name
```

---

## 🔧 Debugging Commands

### Check Socket Connection (Browser Console)
```javascript
// Check if connected
console.log(socket.connected);

// Check socket ID
console.log(socket.id);

// Send test message
socket.emit('test', { data: 'hello' });

// Listen for response
socket.on('test', (data) => console.log(data));
```

### Check React State (Browser Console)
```javascript
// Requires React DevTools Extension
// Click the React DevTools icon
// Select component in tree
// View state in "Hooks" tab
```

### Check Network Requests
1. Open DevTools (F12)
2. Go to Network tab
3. Look for WebSocket connections
4. Filter by "socket.io"

---

## 🎯 Most Important Code Patterns

### Pattern 1: Handle Drag & Drop
```jsx
const handleDrop = (e) => {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('application/json'));
  onElementAdd(data);
};
```

### Pattern 2: Real-time Sync
```jsx
socket.on('elementAdded', (element) => {
  setElements(prev => [...prev, element]);
});
```

### Pattern 3: Update Element Position
```jsx
const handleUpdate = (id, { x, y }) => {
  const updated = { ...element, x, y };
  setElements(prev => prev.map(el => el.id === id ? updated : el));
  socket.emit('elementUpdated', updated);
};
```

### Pattern 4: Delete Element
```jsx
const handleDelete = (id) => {
  setElements(prev => prev.filter(el => el.id !== id));
  socket.emit('elementRemoved', id);
};
```

---

## 📱 Browser Support

✅ **Recommended:**
- Chrome/Chromium 90+
- Firefox 88+
- Edge 90+

⚠️ **Limited Support:**
- Safari (WebRTC recording may not work)

❌ **Not Supported:**
- Internet Explorer
- Old mobile browsers

---

## 🚨 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "Cannot connect to server" | Make sure backend is running on port 5000 |
| "Port 5173 already in use" | Kill process: `netstat -ano \| findstr :5173` |
| "Canvas appears blank" | Check browser console for errors |
| "PDF won't load" | Ensure PDF file is valid, not corrupted |
| "Signatures not syncing" | Check socket connection in console |
| "Recording not working" | Grant screen capture permission, use HTTPS |
| "Dragging doesn't work" | Check if element has `draggable` prop |

---

## 📊 Project Structure (Minimal)

```
Notary/
├── server.js ........................ Backend server
├── my-react-app/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── HomePage.jsx ........ Role selection
│   │   │   ├── OwnerPage.jsx ....... Owner dashboard
│   │   │   └── NotaryPage.jsx ...... Notary dashboard
│   │   ├── components/
│   │   │   ├── CanvasBoard.jsx ..... Main canvas
│   │   │   ├── PdfViewer.jsx ....... PDF display
│   │   │   ├── SignaturePad.jsx .... Signature drawing
│   │   │   ├── SidebarAssets.jsx ... Asset management
│   │   │   └── ScreenRecorder.jsx .. Video recording
│   │   ├── socket/
│   │   │   └── socket.js ........... Socket.io setup
│   │   ├── App.jsx ................. Root component
│   │   └── main.jsx ................ Entry point
│   └── package.json ................ Dependencies
└── README.md ........................ Full documentation
```

---

## 🎓 Learning Resources

| Topic | Resource |
|-------|----------|
| React Hooks | [react.dev/reference/react](https://react.dev/reference/react) |
| Socket.io | [socket.io/docs](https://socket.io/docs) |
| Konva Canvas | [konvajs.org/docs](https://konvajs.org/docs) |
| react-pdf | [react-pdf docs](https://projects.wojtekmaj.pl/react-pdf/) |
| Vite | [vite.dev](https://vite.dev) |
| Express | [expressjs.com](https://expressjs.com) |

---

## 🔐 Production Checklist

- [ ] Environment variables set
- [ ] Backend deployed (Heroku, AWS, etc.)
- [ ] Frontend deployed (Vercel, Netlify, etc.)
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Error logging enabled
- [ ] Authentication added
- [ ] Input validation enabled
- [ ] Rate limiting enabled
- [ ] Security headers configured

---

## 📞 Need Help?

1. **Check the docs:**
   - README.md (full documentation)
   - FEATURES_SUMMARY.md (feature details)
   - PROJECT_FILES.md (file structure)

2. **Debug in browser:**
   - Open DevTools (F12)
   - Check Console for errors
   - Check Network for WebSocket
   - Check React DevTools state

3. **Check server logs:**
   - Look at terminal running `node server.js`
   - Check for connection messages
   - Check for socket events

4. **Test manually:**
   - Open two browser windows
   - Test each feature separately
   - Verify real-time sync
   - Check error handling

---

## 🎉 Success Criteria

Your app is working correctly when:
- ✅ Owner can upload document
- ✅ Notary can join with Session ID
- ✅ Both see same document
- ✅ Dragging signature syncs instantly
- ✅ Recording starts and stops
- ✅ Video downloads successfully
- ✅ No console errors
- ✅ Socket connection shows in Network tab

---

## 🚀 Next Steps

1. **Get it running locally** (this guide)
2. **Customize stamps** (edit SidebarAssets.jsx)
3. **Deploy backend** (Heroku/AWS/Railway)
4. **Deploy frontend** (Vercel/Netlify)
5. **Add authentication** (optional but recommended)
6. **Add database** (MongoDB for records)
7. **Add testing** (Jest/React Testing Library)
8. **Monitor performance** (Sentry/LogRocket)

---

**Quick Start:** Follow the "🚀 Start the Project" section above!

**Questions?** See README.md or SETUP_GUIDE.md

**Happy Notarizing! 🔏✍️**
