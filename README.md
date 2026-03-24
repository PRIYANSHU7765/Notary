# 🔏 Digital Notarization Platform

An enterprise-grade digital notarization platform with full lifecycle support:
- Real-time collaborative document signing
- KBA (Know-Your-Business/Know-Your-Applicant) identity verification
- Email OTP authentication via SMTP
- Admin KBA review and approval workflow
- PDF and image preview plus download
- Role-based dashboards for owners, notaries, and admins

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Running the App](#running-the-app)
8. [SMTP (Gmail) OTP Setup](#smtp-gmail-otp-setup)
9. [APIs and Pages](#apis-and-pages)
10. [Troubleshooting](#troubleshooting)
11. [Project Structure](#project-structure)
12. [Security](#security)
13. [Contributing](#contributing)
14. [License](#license)

---

## Overview

This project delivers a full digital notarization workflow for secure document collaboration, verification, and notarization using modern web technologies.

## Architecture

- Backend: Node.js + Express + Socket.io
- Frontend: React + Vite
- Storage: SQLite (`sql.js` in server)
- Email: SMTP via `nodemailer`
- Auth: JWT in localStorage

## Features

- Multi-user real-time notarization sessions
- Document upload with front/back KBA
- Email OTP verification (Gmail/SMTP)
- Admin review queue (approve/reject)
- PDF/image preview and download
- User/role management and session termination

## Prerequisites

- Node.js >= 18
- npm

## Installation

```bash
git clone <REPO_URL> d:\Artesian\notary
cd d:\Artesian\notary
npm install
cd my-react-app
npm install
cd ..
```

## Configuration

Create `.env` in project root:

```env
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ayushartesian@gmail.com
SMTP_PASS=<gmail-app-password>
SMTP_FROM="Notary Platform <no-reply@yourdomain.com>"
OTP_CHANNEL_DEFAULT=email
OTP_TTL_MS=600000

# Auto-upload session recordings to OneDrive
ONEDRIVE_TENANT_ID=<azure-tenant-id>
ONEDRIVE_CLIENT_ID=<azure-app-client-id>
ONEDRIVE_CLIENT_SECRET=<azure-app-client-secret>
# Provide either ONEDRIVE_DRIVE_ID (recommended) or ONEDRIVE_USER_ID
ONEDRIVE_DRIVE_ID=<target-drive-id>
# ONEDRIVE_USER_ID=<target-user-id-or-upn>
ONEDRIVE_FOLDER_PATH=/NotaryRecordings
ONEDRIVE_SHARE_SCOPE=organization
RECORDING_UPLOAD_MAX_BYTES=125829120
```

### Gmail-specific

1. Enable 2-step verification
2. Create App password at https://myaccount.google.com/security
3. Use app password in `SMTP_PASS`

## Running the App

### Backend

```bash
cd d:\Artesian\notary
node server.js
```

Expected: backend starts and logs server address.

### Frontend

```bash
cd d:\Artesian\notary\my-react-app
npm run dev
```

Open: `http://localhost:5173`

## SMTP (Gmail) OTP Setup

Using Gmail SMTP config above, OTP flow runs as:
1. `/api/kba/otp/send`
2. code stored hashed in DB
3. email delivered via nodemailer
4. `/api/kba/otp/verify`

## APIs and Pages

### Important API routes
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/kba/otp/send`
- `POST /api/kba/otp/verify`
- `POST /api/kba/upload`
- `GET /api/kba/status`
- `GET /api/admin/kba/pending`
- `GET /api/admin/kba/:userId/document`
- `PUT /api/admin/kba/:userId/approve`
- `PUT /api/admin/kba/:userId/reject`

### Frontend pages
- `/login`, `/register`
- `/kba/verify`, `/kba/pending`, `/kba/rejected`
- `/owner/doc/dashboard`, `/notary/doc/dashboard`
- `/admin`

## Troubleshooting

### Frontend: socket errors
- `ECONNREFUSED` → backend not running or incorrect port
- `ECONNRESET` → broken connection

### SMTP errors
- `ENOTFOUND` → invalid host
- `EAUTH` → bad creds/app password
- Use local MailHog/smtp4dev for dev testing

## Project Structure

```txt
notary/
├── .env
├── package.json
├── package-lock.json
├── README.md
├── server.js
├── data/
│   ├── users.json
│   └── notarized/
├── scripts/
│   └── inspect_db.js
└── my-react-app/
    ├── package.json
    ├── vite.config.js
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   ├── pages/
    │   ├── components/
    │   ├── socket/socket.js
    │   └── utils/apiClient.js
    └── public/
```

## Security

- Do not commit `.env`
- Use secrets manager in production
- Keep SMTP creds safe

## Contributing

1. Fork
2. Branch
3. PR

## License

MIT

```bash
cd ..
npm install express socket.io cors
node server.js
```

### SMTP OTP Configuration (Email)

Set these environment variables in your backend `.env` file to enable OTP over email:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM="Notary Platform <no-reply@yourdomain.com>"
OTP_CHANNEL_DEFAULT=email
OTP_TTL_MS=600000
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
