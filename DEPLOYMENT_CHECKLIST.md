# ⚡ Quick Deployment Checklist

**For:** PRIYANSHU7764 (priyanshu.pratap@artesian.io)  
**Date:** March 13, 2026

---

## ✅ Pre-Deployment (Do Once)

- [ ] GitHub account created (https://github.com)
- [ ] Vercel account created (https://vercel.com)
- [ ] Railway account created (https://railway.app)
- [ ] Git configured:
  ```
  git config --global user.email "priyanshu.pratap@artesian.io"
  git config --global user.name "PRIYANSHU7764"
  ```

---

## 📤 Step 1: Push to GitHub (5 minutes)

```bash
cd c:\Users\priyanshu.pratap\Desktop\Notary

git add .
git commit -m "🚀 Initial commit: Digital Notarization Platform"

# Replace YOUR_USERNAME with yours
git remote add origin https://github.com/PRIYANSHU7764/notarization-platform.git
git branch -M main
git push -u origin main
```

**Verify:** Check your repo at https://github.com/PRIYANSHU7764/notarization-platform

---

## 🎨 Step 2: Deploy Frontend to Vercel (5 minutes)

1. Go to https://vercel.com/new
2. Import Git Repository
3. Search `notarization-platform`
4. Click Import
5. **Settings:**
   - Root Directory: `./my-react-app`
   - Build Command: `npm run build`
   - Output: `dist`
6. **Add Environment Variable:**
   ```
   VITE_REACT_APP_SERVER_URL = https://notary-backend.railway.app
   ```
   (Update this after backend URL is ready)
7. Click **Deploy**

**⏳ Wait ~2-3 minutes for deployment**

**Your Frontend URL:** `https://notarization-platform.vercel.app`

---

## 🚂 Step 3: Deploy Backend to Railway (5 minutes)

1. Go to https://railway.app
2. Click **New Project**
3. Select **GitHub Repo**
4. Choose `notarization-platform`
5. Click **Deploy**
6. **Go to Variables Tab, Add:**
   ```
   PORT=3000
   NODE_ENV=production
   FRONTEND_URL=https://notarization-platform.vercel.app
   ```
7. **Get your Backend URL:**
   - Deployments tab
   - Click "Visit"
   - Copy the URL (looks like `https://notary-xxx.railway.app`)

**Your Backend URL:** `https://notary-xxx.railway.app`

---

## 🔗 Step 4: Update Vercel with Backend URL (2 minutes)

1. Go to https://vercel.com/dashboard
2. Click `notarization-platform`
3. Settings → Environment Variables
4. Update `VITE_REACT_APP_SERVER_URL` with your Railway URL
5. Go to **Deployments** → Click latest
6. Click **Redeploy**

**⏳ Wait ~1 minute for redeploy**

---

## ✅ Step 5: Verify Live Deployment

### Test 1: Check Backend Health
Visit: `https://your-backend-url/health`
Should see:
```json
{
  "status": "Server is running",
  "sessions": 0,
  "environment": "production"
}
```

### Test 2: Open Frontend
Visit: `https://notarization-platform.vercel.app`
Should see home page with two buttons

### Test 3: Real-time Sync
- Open 2 browser windows
- Window 1: Owner, upload document
- Window 2: Notary, join session
- Try dragging a signature
- Should appear in both windows instantly ✨

---

## 📊 Deployment Status Reference

| What | Where | Status | URL |
|------|-------|--------|-----|
| Frontend Code | GitHub | ✅ | https://github.com/PRIYANSHU7764/notarization-platform |
| Frontend App | Vercel | 🚀 | https://notarization-platform.vercel.app |
| Backend API | Railway | 🚀 | https://notary-backend-xxx.railway.app |
| Your Email | - | - | priyanshu.pratap@artesian.io |
| Your Username | - | - | PRIYANSHU7764 |

---

## 🆘 Troubleshooting Quick Links

**Frontend blank page?**
- Hard refresh: `Ctrl+Shift+R`
- Check DevTools Console (F12)

**Cannot connect to server?**
- Verify backend at `/health` endpoint
- Check Vercel env var is set correctly
- Redeploy Vercel after updating env var

**Real-time not working?**
- Open DevTools Network tab
- Look for WebSocket connection (wss://)
- Check Railway backend logs

---

## 📱 Share Your App

Send this to users:
```
🔏 Digital Notarization Platform
https://notarization-platform.vercel.app

Built by PRIYANSHU7764
Contact: priyanshu.pratap@artesian.io
```

---

## 🎉 What You Just Did

✅ Built a production-ready real-time notarization app  
✅ Deployed frontend on Vercel (auto-scaling, free)  
✅ Deployed backend on Railway (reliable, fast)  
✅ Connected both with live WebSocket sync  
✅ Made it publicly accessible worldwide  

**Congratulations!** Your app is live! 🚀

---

## 📞 Need Help?

1. **Vercel Issues:** https://vercel.com/docs
2. **Railway Issues:** https://docs.railway.app
3. **Socket.io Issues:** https://socket.io/docs
4. **GitHub Issues:** https://docs.github.com

---

**Last Updated:** March 13, 2026  
**Deployed By:** PRIYANSHU7764  
**Email:** priyanshu.pratap@artesian.io
