# 🚀 START HERE - Get Your App Live in 15 Minutes!

**Your Info:**
- 👤 GitHub Username: `PRIYANSHU7764`
- 📧 Email: `priyanshu.pratap@artesian.io`
- 🔗 App URL (after deploy): `https://notarization-platform.vercel.app`

---

## ⚡ Quick Deploy (Choose One Method)

### **Method 1: Automated (Recommended - 2 commands)**

```powershell
# Run from: c:\Users\priyanshu.pratap\Desktop\Notary

# Step 1: Run deployment script
.\deploy.ps1

# Step 2: Open Vercel & Railway (see Details section)
```

### **Method 2: Manual (3 commands)**

```powershell
# Step 1: Configure Git
git config --global user.name "PRIYANSHU7764"
git config --global user.email "priyanshu.pratap@artesian.io"

# Step 2: Push to GitHub
git add .
git commit -m "🚀 Deploy: Digital Notarization Platform"
git remote add origin https://github.com/PRIYANSHU7764/notarization-platform.git
git branch -M main
git push -u origin main

# Step 3: Visit Vercel & Railway (see Details section)
```

---

## 📋 Details After Git Push

### Then on Vercel (https://vercel.com):
1. Click **New Project**
2. Select **Import Git Repository**
3. Search: `notarization-platform`
4. Click **Import**
5. Settings:
   - Root: `./my-react-app`
   - Build: `npm run build`
   - Output: `dist`
6. Add Env Var:
   - Key: `VITE_REACT_APP_SERVER_URL`
   - Value: `https://notary-backend.railway.app` (update after Railway)
7. **Deploy** → ⏳ 2 minutes → You get URL!

### Then on Railway (https://railway.app):
1. Click **New Project**
2. **Import from GitHub**
3. Choose: `notarization-platform`
4. **Deploy**
5. Go to **Variables**
6. Add:
   ```
   PORT = 3000
   NODE_ENV = production
   FRONTEND_URL = https://notarization-platform.vercel.app
   ```
7. Copy the Railway URL from **Domains**
8. Go back to Vercel and update the env var

---

## ✅ Verify It Works

### Test 1: Backend Alive?
Visit: `https://your-railway-url/health`

Should show:
```json
{"status": "Server is running"}
```

### Test 2: Frontend Loading?
Visit: `https://notarization-platform.vercel.app`

Should show home page with 2 role buttons

### Test 3: Real-time Sync?
- Open 2 browser windows (side-by-side)
- Window 1: Click **Document Owner**
- Window 2: Click **Notary**
- Upload doc in Window 1
- Join same session in Window 2
- Drag a signature in Window 1
- Should appear in Window 2 instantly ✨

---

## 📊 Your Deployment Map

```
GitHub Repository
    ↓
    ├─→ Vercel (Frontend Auto-Deploy)
    │       ✨ https://notarization-platform.vercel.app
    │
    └─→ Railway (Backend WebSocket Server)
            ✨ https://notary-xxxx.railway.app
```

---

## 📞 If Something Goes Wrong

**Blank page?**
- Hard refresh: `Ctrl+Shift+R`
- Check browser console: F12

**Can't connect to backend?**
- Verify Railway backend is running (Deployments tab)
- Check Vercel env var is set
- Redeploy Vercel after changing env var

**Real-time not working?**
- DevTools → Network → filter "wss"
- Should see WebSocket connection
- Check Railway backend logs

**Git push rejected?**
- Make sure repo exists: https://github.com/PRIYANSHU7764/notarization-platform
- Or create it first on GitHub, then push

---

## 📚 Full Documentation

- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Detailed steps with troubleshooting
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - In-depth deployment guide
- **[README.md](./README.md)** - Feature overview
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - API reference

---

## 🎯 Estimated Timeline

| Step | Tool | Time | Done |
|------|------|------|------|
| Run deploy script | PowerShell | 1 min | [ ] |
| Push to GitHub | Git | 1 min | [ ] |
| Create Vercel project | Vercel | 3 min | [ ] |
| Create Railway project | Railway | 3 min | [ ] |
| Update env vars | Vercel+Railway | 2 min | [ ] |
| Verify deployment | Browser | 2 min | [ ] |
| **TOTAL** | | **~12 min** | [ ] |

---

## 🎉 That's It!

Your app is now:
- ✅ Deployed globally on Vercel
- ✅ Streaming real-time with Railway
- ✅ Production-ready
- ✅ Scalable

Share it: `https://notarization-platform.vercel.app`

---

**Created for:** PRIYANSHU7764  
**Email:** priyanshu.pratap@artesian.io  
**Platform:** Digital Notarization (Real-time Collaboration)
