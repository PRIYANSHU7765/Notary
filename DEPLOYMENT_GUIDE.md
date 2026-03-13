# 📦 Deployment Guide - Digital Notarization Platform

**Project Owner:** PRIYANSHU7764  
**Email:** priyanshu.pratap@artesian.io  
**Created:** March 13, 2026

---

## 🎯 Quick Deployment Summary

| Component | Platform | Status | Link After Deploy |
|-----------|----------|--------|-------------------|
| **Frontend** | Vercel | 🚀 Ready | https://notary-platform.vercel.app |
| **Backend** | Railway/Heroku | 🚀 Ready | https://notary-backend.railway.app |

---

## 📝 Pre-Deployment Checklist

- [x] All dependencies installed
- [x] Build successful (`npm run build` ✅)
- [x] Node dependencies configured in `server.js`
- [x] Vercel config created
- [x] Procfile created for backend
- [ ] GitHub repository created (we'll do this)
- [ ] Vercel account connected
- [ ] Backend deployed
- [ ] Environment variables configured

---

## **Part 1: Push Code to GitHub** 🐙

### Step 1A: Create GitHub Repository

1. Go to https://github.com/new
2. **Repository name:** `notarization-platform` (or your preferred name)
3. **Description:** Digital real-time notarization platform with Socket.io
4. **Visibility:** Public (for free deployment on Vercel)
5. Click **Create Repository**

### Step 1B: Push Code from Windows

```powershell
cd c:\Users\priyanshu.pratap\Desktop\Notary

# Configure Git
git config --global user.email "priyanshu.pratap@artesian.io"
git config --global user.name "PRIYANSHU7764"

# Add all files
git add .

# Commit
git commit -m "🚀 Initial commit: Digital Notarization Platform"

# Add remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/PRIYANSHU7764/notarization-platform.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Expected Output:**
```
Enumerating objects: ...
Counting objects: ...
Writing objects: ...
...
remote: Create a pull request for 'main'
To github.com:PRIYANSHU7764/notarization-platform.git
 * [new branch]      main -> main
```

---

## **Part 2: Deploy Frontend to Vercel** 🎨

### Step 2A: Create Vercel Account

1. Go to https://vercel.com/signup
2. Click **"Continue with GitHub"**
3. Authorize Vercel to access your GitHub
4. Accept terms

### Step 2B: Import Project to Vercel

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Search for **`notarization-platform`**
4. Click **Import**

### Step 2C: Configure Vercel

**Project Settings:**
- **Framework Preset:** Vite
- **Root Directory:** `./my-react-app`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Environment Variables:**
Click **Add Environment Variable**

```
Name: VITE_REACT_APP_SERVER_URL
Value: https://notary-backend.railway.app
```

(We'll get the backend URL after deploying backend)

Click **Deploy** ✅

**Get Your Frontend URL:**
After deployment, you'll see:
```
✅ Congratulations! Your project has been successfully deployed.
🔗 https://notarization-platform.vercel.app
```

**Copy this URL!** You'll need it for backend CORS.

---

## **Part 3: Deploy Backend to Railway** 🚂

Railway is free and easier than Heroku now.

### Step 3A: Create Railway Account

1. Go to https://railway.app/
2. Click **Start Project**
3. Sign up with GitHub

### Step 3B: Deploy Backend

1. Click **New Project**
2. Select **GitHub Repo**
3. Choose `notarization-platform`
4. Railway will auto-detect and ask if you want to deploy
5. Click **Deploy**

### Step 3C: Configure Environment Variables

In Railway Dashboard:
1. Click on your project
2. Go to **Variables** tab
3. Add these variables:

```
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://notarization-platform.vercel.app
```

### Step 3D: Get Backend URL

1. Go to **Deployments** tab
2. Find your deployment
3. Click **Visit** button
4. You'll see your backend URL: `https://notary-backend-xyz.railway.app`

**Test it:** Visit `https://your-backend-url/health`
Should show:
```json
{
  "status": "Server is running",
  "sessions": 0,
  "environment": "production",
  "timestamp": "2026-03-13T..."
}
```

---

## **Part 4: Connect Frontend to Backend** 🔗

Now update Vercel with the actual backend URL:

### Step 4A: Update Vercel Environment Variables

1. Go to https://vercel.com/dashboard
2. Click `notarization-platform` project
3. Go to **Settings** → **Environment Variables**
4. Update the value:

```
VITE_REACT_APP_SERVER_URL=https://your-railway-backend-url.railway.app
```

5. Click **Save**
6. Redeploy:
   - Go to **Deployments**
   - Click on latest deployment
   - Click **Redeploy**

### Step 4B: Test Connection

1. Visit https://notarization-platform.vercel.app
2. Open Browser DevTools (F12)
3. Go to **Console** tab
4. You should see:
   ```
   ✅ Connected to server: socket-id-xxx
   ```

If you see this, **connection works!** 🎉

---

## **Part 5: Verify Live Deployment** ✅

### Test the App Live

1. **Open in Browser 1:**
   ```
   https://notarization-platform.vercel.app
   ```

2. **Open in Browser 2 (Different browser or Incognito):**
   ```
   https://notarization-platform.vercel.app
   ```

3. **Browser 1:**
   - Click "I am a Document Owner"
   - Upload a test document
   - Copy the Session ID

4. **Browser 2:**
   - Click "I am a Notary"
   - Paste the Session ID
   - Click "Join Session"

5. **Both browsers:**
   - Should see the same document
   - Try dragging a stamp
   - **Both should see it instantly!** ✨

---

## 📊 After Deployment Checklist

- [x] Frontend deployed on Vercel
- [x] Backend running on Railway
- [x] Environment variables configured
- [x] Real-time sync working
- [x] Both users can see each other's changes

---

## 🔑 Important URLs to Save

```
Frontend: https://notarization-platform.vercel.app
Backend:  https://notary-backend-xyz.railway.app
GitHub:   https://github.com/PRIYANSHU7764/notarization-platform
Vercel:   https://vercel.com/priyanshu7764/notarization-platform
Railway:  https://railway.app/project/xxx
```

---

## 🛠️ Common Issues & Solutions

### Issue: Frontend shows blank page
**Solution:** 
- Hard refresh browser (`Ctrl+Shift+R`)
- Check DevTools Console for errors
- Verify `VITE_REACT_APP_SERVER_URL` is set in Vercel

### Issue: Cannot connect to server (Socket.io error)
**Solution:**
- Verify backend is running: Visit `https://your-backend/health`
- Check CORS in `server.js` includes your frontend URL
- Redeploy backend with correct `FRONTEND_URL` env var

### Issue: Real-time updates not working
**Solution:**
- Check Network tab in DevTools
- Look for WebSocket connection (wss://...)
- Verify `/health` endpoint responds
- Check backend logs in Railway dashboard

---

## 📱 Using the Live Application

**For Document Owner:**
```
1. Go to https://notarization-platform.vercel.app
2. Click "I am a Document Owner"
3. Upload a PDF or image
4. Copy & share the Session ID with the notary
5. Watch in real-time as notary adds signatures
6. Record the session with screen recording
```

**For Notary:**
```
1. Go to https://notarization-platform.vercel.app
2. Click "I am a Notary"
3. Enter the Session ID provided by owner
4. View the document
5. Draw your signature or place stamps
6. Changes sync to owner instantly
```

---

## 💰 Free Tier Limits

**Vercel:**
- Unlimited deployments
- Auto-scaling
- Completely free

**Railway:**
- $5/month free credit (plenty for testing)
- Paid plans start at $5/month
- If you exceed, Railway will warn you

**To stay within free tier:**
- One backend instance is fine
- Normal usage won't exceed limits
- You can set spending limit to $0 to prevent charges

---

## 🚀 Next Steps

### Optional but Recommended:

1. **Add Custom Domain**
   - Buy domain on Namecheap/GoDaddy
   - Connect to Vercel in Settings
   - Enable SSL certificate (free)

2. **Add Database**
   - Connect MongoDB for persisting notarization records
   - Update `server.js` to save records

3. **Add Authentication**
   - Implement login with Auth0 or Firebase
   - Restrict access to registered users only

4. **Enable Email Notifications**
   - Send receipt after notarization
   - Use SendGrid or Mailgun

5. **Custom Branding**
   - Replace colors/logos
   - Add company information

---

## 📞 Support

If something goes wrong:

1. **Check DevTools Console** (F12)
2. **Check Backend Logs:**
   - Railway Dashboard → Logs tab
3. **Check Vercel Deployments:**
   - Vercel Dashboard → Deployments → View Build Logs
4. **Test Backend Health:**
   - Visit `https://backend-url/health`

---

## ✅ Deployment Complete!

**Your application is now live and accessible to the world!**

Share this link with anyone:
```
📱 https://notarization-platform.vercel.app
```

**Owner:** PRIYANSHU7764  
**Email:** priyanshu.pratap@artesian.io  
**Created:** March 13, 2026  

🎉 Happy Notarizing!
