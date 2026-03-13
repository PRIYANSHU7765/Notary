# 🔏 Digital Notarization Platform

A real-time digital notarization application built with **React + Socket.io + Konva Canvas**. Two users (Document Owner & Notary) can collaborate on the same document in real-time, placing signatures and stamps with drag-and-drop functionality.

## 📋 Features

✅ **Real-time Collaboration**
  - Two users see the same document simultaneously
  - WebSocket synchronization via Socket.io
  - Instant updates when signatures/stamps are placed

✅ **Interactive Canvas**
  - Drag & drop signatures and stamps on documents
  - Canvas-based signature drawing (touch support)
  - Resize and rotate signatures

✅ **Two User Roles**
  - **Document Owner**: Uploads documents, signs with their signature
  - **Notary**: Verifies and places official stamps/signatures

✅ **Screen Recording**
  - Record the entire notarization session using WebRTC
  - Download recordings for audit trail

✅ **Document Support**
  - PDF viewing
  - Image preview (PNG, JPG)

---

## 🏗️ Project Structure

```
Notary/
├── my-react-app/              # React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── CanvasBoard.jsx          # Main canvas for signatures
│   │   │   ├── PdfViewer.jsx            # PDF document viewer
│   │   │   ├── SignaturePad.jsx         # Canvas signature drawing
│   │   │   ├── SidebarAssets.jsx        # Draggable assets
│   │   │   └── ScreenRecorder.jsx       # WebRTC screen recording
│   │   ├── pages/
│   │   │   ├── HomePage.jsx             # Role selection
│   │   │   ├── OwnerPage.jsx            # Owner dashboard
│   │   │   └── NotaryPage.jsx           # Notary dashboard
│   │   ├── socket/
│   │   │   └── socket.js                # Socket.io configuration
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── server.js                  # Node backend (Socket.io server)
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Step 1: Install Frontend Dependencies

```bash
cd my-react-app
npm install
```

### Step 2: Set Up Backend Server

You have two options:

#### Option A: Use the provided server.js
```bash
cd ..
npm install express socket.io cors
node server.js
```

#### Option B: Use a hosted Socket.io server
Update `src/socket/socket.js` with your server URL:
```javascript
const SOCKET_SERVER_URL = "https://your-server.com";
```

### Step 3: Run Frontend

```bash
cd my-react-app
npm run dev
```

Frontend will open at `http://localhost:5173`

---

## 📖 How to Use

### For Document Owner:

1. **Click "I am a Document Owner"** on the home page
2. **Upload a document** (PDF or image)
3. **Share the Session ID** with the notary
4. **Drag signatures** from sidebar to sign the document
5. **See real-time updates** as notary adds stamps
6. **Record the session** for audit trail

### For Notary:

1. **Click "I am a Notary"** on the home page
2. **Enter the Session ID** provided by document owner
3. **View the document** that the owner uploaded
4. **Draw your signature** using the "Draw Signature" button
5. **Drag stamps** onto the document (Official Stamp, Approved Stamp, etc.)
6. **See real-time sync** with owner's actions
7. **Record the session** for legal documentation

---

## 🛠️ Technology Stack

### Frontend
- **React 19** - UI Framework
- **Vite** - Build tool
- **react-pdf** - PDF viewer
- **react-konva** - Canvas drawing & manipulation
- **react-signature-canvas** - Signature drawing
- **socket.io-client** - Real-time communication
- **react-dnd** - Drag & drop (HTML5 backend)

### Backend
- **Node.js + Express** - Server framework
- **Socket.io** - WebSocket real-time sync
- **CORS** - Cross-origin requests

---

## 📚 Component Documentation

### CanvasBoard.jsx
```jsx
<CanvasBoard 
  elements={elements}
  onElementAdd={handleAdd}
  onElementUpdate={handleUpdate}
  onElementRemove={handleRemove}
  canvasWidth={800}
  canvasHeight={600}
/>
```
- **Drag-drop canvas** for signatures
- **Delete key** to remove selected element
- **Click to select** elements

### PdfViewer.jsx
```jsx
<PdfViewer 
  file={uploadedFile}
  onLoadSuccess={handleLoadSuccess}
  containerHeight="600px"
/>
```
- **PDF page navigation**
- **Scalable rendering**

### SignaturePad.jsx
```jsx
<SignaturePad 
  onSignatureGenerated={handleSignature}
  title="Draw Your Signature"
/>
```
- **Canvas drawing** with pen
- **Clear/Save buttons**
- **Exports PNG image**

### SidebarAssets.jsx
- **Draggable assets** (stamps, signatures)
- **Draw Signature button** 
- **Dynamic asset generation**

### ScreenRecorder.jsx
- **WebRTC-based screen recording**
- **Start/Stop controls**
- **Video playback**
- **Download recording** as WebM

---

## 🔌 Socket.io Events

### Client → Server
- `joinSession` - Join a notarization session
- `documentUploaded` - Notify document upload
- `elementAdded` - Add signature/stamp
- `elementUpdated` - Update element position
- `elementRemoved` - Remove signature/stamp

### Server → Client
- `usersConnected` - List of connected users
- `documentUploaded` - Document upload notification
- `elementAdded` - New signature placed
- `elementUpdated` - Signature moved
- `elementRemoved` - Signature deleted

---

## 🎨 Customization

### Add Custom Stamps
Edit `src/components/SidebarAssets.jsx`:
```jsx
{
  id: "stamp-custom",
  name: "My Custom Stamp",
  type: "stamp",
  image: "data:image/svg+xml,...",  // SVG or base64
  user: "notary",
}
```

### Add Custom Signature Styles
Edit `src/components/SignaturePad.jsx`:
```jsx
<SignatureCanvas
  penColor="black"  // Change pen color
  canvasProps={{
    width: 400,
    height: 200,
  }}
/>
```

### Connect to Real Server
Update `src/socket/socket.js`:
```javascript
const SOCKET_SERVER_URL = "https://your-deployed-server.com";
```

---

## 🚨 Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Canvas | ✅ | ✅ | ✅ | ✅ |
| PDF Viewer | ✅ | ✅ | ✅ | ✅ |
| WebRTC Recording | ✅ | ✅ | ⚠️* | ✅ |
| Socket.io | ✅ | ✅ | ✅ | ✅ |

*Safari has limited WebRTC support; use native video recording as fallback.

---

## 📋 Environment Variables

Create `.env` file in `my-react-app/`:
```env
VITE_REACT_APP_SERVER_URL=http://localhost:5000
VITE_REACT_APP_ENV=development
```

---

## 🐛 Troubleshooting

### Socket.io Connection Failed
- Check if backend server is running
- Verify `SOCKET_SERVER_URL` in `socket.js`
- Check CORS settings in `server.js`

### PDF Won't Load
- Ensure `pdfjs-dist` is installed
- Check file is valid PDF
- Use public files, not local file paths

### Signature Not Appearing
- Canvas might be behind other elements (z-index issue)
- Check browser console for errors
- Ensure PNG format is supported

### Screen Recording Not Working
- Grant screen capture permission when prompted
- Use HTTPS (required for secure context)
- Check browser supports MediaRecorder API

---

## 📈 Future Enhancements

- [ ] Multi-page document support
- [ ] Digital signature verification
- [ ] Blockchain-based proof of notarization
- [ ] Video call integration
- [ ] Document version history
- [ ] e-Signature standards (eIDAS, ESIGN)
- [ ] Cloud storage integration (AWS S3, GCS)
- [ ] Mobile app (React Native)
- [ ] Authentication & authorization
- [ ] Audit logs & compliance reports

---

## 📝 Legal Disclaimer

This application is designed for demonstration purposes. For legally binding digital notarization, ensure compliance with:
- Local e-signature laws
- ESIGN Act (USA)
- eIDAS Regulation (EU)
- State notarization requirements

Consult legal professionals before using in production.

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

---

## 📄 License

MIT License - Feel free to use for personal and commercial projects.

---

## 👨‍💻 Developer Notes

### Architecture Decisions:
- **Redux State Management**: Could be added for complex state
- **TypeScript**: Consider for production deployments
- **Database**: MongoDB recommended for storing notarization records
- **Cloud Storage**: AWS S3 or Cloudinary for document storage

### Performance Tips:
- Optimize image sizes for faster loading
- Use React.memo() for component optimization
- Implement virtual scrolling for large asset lists
- Cache signatures in localStorage

### Security Considerations:
- Implement user authentication (JWT)
- Validate signatures on backend
- Use HTTPS in production
- Sanitize file uploads
- Rate limit Socket.io events

---

## 🎓 Learning Resources

- [React Documentation](https://react.dev)
- [Socket.io Guide](https://socket.io/docs/v4/socket-io-tutorial/)
- [Konva.js Documentation](https://konvajs.org/)
- [PDF.js API](https://mozilla.github.io/pdf.js/)
- [WebRTC & MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

---

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review component documentation
3. Inspect browser console for errors
4. Check Socket.io network tab in DevTools

---

**Happy Notarizing! ✍️🔏**
