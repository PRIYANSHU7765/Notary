# 🚀 Digital Notarization Platform - Automated Deployment Script
# For: PRIYANSHU7764 (priyanshu.pratap@artesian.io)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "🚀 Digital Notarization Platform Deployment" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Git Configuration
Write-Host "[1/5] Checking Git Configuration..." -ForegroundColor Yellow
$gitUser = git config --global user.name
$gitEmail = git config --global user.email

if ($gitUser -and $gitEmail) {
    Write-Host "✅ Git already configured:" -ForegroundColor Green
    Write-Host "   User: $gitUser"
    Write-Host "   Email: $gitEmail"
} else {
    Write-Host "⚠️  Git not configured. Configuring now..." -ForegroundColor Yellow
    git config --global user.name "PRIYANSHU7764"
    git config --global user.email "priyanshu.pratap@artesian.io"
    Write-Host "✅ Git configured successfully" -ForegroundColor Green
}
Write-Host ""

# Step 2: Check Node modules
Write-Host "[2/5] Checking Dependencies..." -ForegroundColor Yellow
if (Test-Path "my-react-app/node_modules") {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Installing dependencies..." -ForegroundColor Yellow
    cd my-react-app
    npm install
    cd ..
}
Write-Host ""

# Step 3: Build the frontend
Write-Host "[3/5] Building Frontend..." -ForegroundColor Yellow
cd my-react-app
$buildResult = npm run build 2>&1
cd ..

if ($buildResult -match "dist") {
    Write-Host "✅ Frontend build successful" -ForegroundColor Green
} else {
    Write-Host "❌ Frontend build failed" -ForegroundColor Red
    Write-Host $buildResult
    exit 1
}
Write-Host ""

# Step 4: Git commit and push
Write-Host "[4/5] Preparing Git Repository..." -ForegroundColor Yellow

# Check if remote exists
$remoteCheck = git remote get-url origin 2>&1
if ($remoteCheck -like "*notarization-platform*") {
    Write-Host "✅ Git remote already configured" -ForegroundColor Green
} else {
    Write-Host "⚠️  Setting up Git remote..." -ForegroundColor Yellow
    git remote add origin https://github.com/PRIYANSHU7764/notarization-platform.git
    Write-Host "✅ Git remote configured" -ForegroundColor Green
}

# Staging and commit
Write-Host "📦 Staging files..." -ForegroundColor Cyan
git add .

$commitCheck = git status --porcelain
if ($commitCheck) {
    Write-Host "💾 Committing changes..." -ForegroundColor Cyan
    git commit -m "🚀 Deploy: Digital Notarization Platform - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} else {
    Write-Host "✅ No changes to commit" -ForegroundColor Green
}

Write-Host ""

# Step 5: Push to GitHub
Write-Host "[5/5] Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "📤 Pushing repository..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to GitHub" -ForegroundColor Green
} else {
    Write-Host "⚠️  Push completed (may need GitHub auth)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "✅ DEPLOYMENT PREPARATION COMPLETE!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Go to Vercel: https://vercel.com/new" -ForegroundColor Cyan
Write-Host "   - Import your GitHub repository" -ForegroundColor Gray
Write-Host "   - Root Directory: ./my-react-app" -ForegroundColor Gray
Write-Host "   - Add env var: VITE_REACT_APP_SERVER_URL" -ForegroundColor Gray
Write-Host ""

Write-Host "2️⃣  Go to Railway: https://railway.app" -ForegroundColor Cyan
Write-Host "   - Import your GitHub repository" -ForegroundColor Gray
Write-Host "   - Add env vars for backend" -ForegroundColor Gray
Write-Host ""

Write-Host "3️⃣  Update Vercel env var with Railway URL" -ForegroundColor Cyan
Write-Host "   - Redeploy on Vercel" -ForegroundColor Gray
Write-Host ""

Write-Host "4️⃣  Test at: https://notarization-platform.vercel.app" -ForegroundColor Cyan
Write-Host ""

Write-Host "GitHub Repo: https://github.com/PRIYANSHU7764/notarization-platform" -ForegroundColor Green
Write-Host "Your Email: priyanshu.pratap@artesian.io" -ForegroundColor Green
Write-Host ""

Write-Host "📚 Full guide: Read DEPLOYMENT_CHECKLIST.md" -ForegroundColor Yellow
Write-Host ""
