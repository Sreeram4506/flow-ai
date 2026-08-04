# Login Testing Guide

## ✅ What Was Fixed

### 1. **API Response Handling**
- Fixed axios response extraction (using `.data` property)
- Added proper error handling with detailed messages
- Improved error reporting in login form

### 2. **Authentication Flow**
- Login now properly stores tokens in localStorage
- User data is fetched after successful authentication
- Navigation to dashboard is automatic after login
- 2FA flow is properly handled

### 3. **Error Messages**
- Backend errors now display in the UI
- Clear feedback for invalid credentials
- User-friendly error messages

---

## 🎯 Quick Test - 2 Minutes

### Step 1: Setup Database (One Time)

```bash
# Navigate to project
cd /Users/koushikeslavath/Downloads/flow

# Run automated setup
./setup.sh
```

This will:
- Start or verify MongoDB
- Run migrations
- Seed demo users
- Start Redis

---

### Step 2: Start Backend

```bash
cd /Users/koushikeslavath/Downloads/flow
npm run start:prod
```

**Expected Output:**
```
[Nest] 50545  - 07/12/2026, 10:24:42 AM     LOG [NestFactory] Starting Nest application...
...
[Nest] 50545  - 07/12/2026, 10:24:42 AM     LOG [RoutesResolver] AuthController {/api/auth}:
```

✅ Backend running on http://localhost:3000

---

### Step 3: Start Frontend (New Terminal)

```bash
cd /Users/koushikeslavath/Downloads/flow/frontend
npm start
```

**Expected Output:**
```
   ▲ Next.js 15.5.20
   - Local:        http://localhost:3001
   - Ready in 144ms
```

✅ Frontend running on http://localhost:3001

---

### Step 4: Test Login

1. Open http://localhost:3001 in browser
2. Click "Log In"
3. Enter:
   - **Email:** admin@flow.dev
   - **Password:** Admin@123
4. Click "Log In"

**Expected Behavior:**
- ✅ Loading state shows "Processing..."
- ✅ No error message appears
- ✅ Automatically redirected to Dashboard
- ✅ User profile shows in dashboard

---

## 📋 Demo Accounts to Test

### Super Admin
```
Email: admin@flow.dev
Password: Admin@123
```

### Regular Users
```
Email: john@flow.dev        Password: User@123
Email: jane@flow.dev        Password: User@123
Email: bob@flow.dev         Password: User@123
Email: alice@flow.dev       Password: User@123
```

---

## 🔍 Debug Checklist

If login doesn't work:

### ✅ Backend is Running?
```bash
# Check if port 3000 is listening
lsof -i :3000 | grep LISTEN

# Should show: node running on port 3000
```

### ✅ Frontend is Running?
```bash
# Check if port 3001 is listening
lsof -i :3001 | grep LISTEN

# Should show: node running on port 3001
```

### ✅ Database Connection?
```bash
# Check database
mongosh "mongodb://localhost:27017/flow_db" --eval "db.user.countDocuments()"

# Should return: 5+ users
```

### ✅ Redis Running?
```bash
# Check Redis
redis-cli ping

# Should return: PONG
```

### ✅ Check Browser Console (F12)
Look for API errors:
- Open DevTools (F12)
- Go to Console tab
- Try login again
- Look for fetch/axios errors
- Check Network tab for API calls

### ✅ Check Backend Logs
When you try to login, backend should show:
```
[Nest] xxx - ... LOG [AuthService] login attempt...
```

---

## 🐛 Common Issues & Fixes

### Issue: "Invalid email or password"
**Cause:** Database doesn't have users

**Fix:**
```bash
npm run prisma:seed
```

### Issue: Cannot connect to database
**Cause:** MongoDB not running

**Fix - Option 1 (macOS with Homebrew):**
```bash
brew install mongodb-community
brew services start mongodb-community
```

**Fix - Option 2 (Docker):**
```bash
docker run --name flow-mongo -d -p 27017:27017 mongo:7
```

### Issue: Redis connection refused
**Cause:** Redis not running

**Fix - Option 1 (macOS):**
```bash
brew install redis
brew services start redis
```

**Fix - Option 2 (Docker):**
```bash
docker run -d -p 6379:6379 redis:latest
```

### Issue: Port already in use (3000 or 3001)
**Fix:**
```bash
# Kill process on port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Issue: Login works but doesn't redirect
**Cause:** Race condition in user refresh

**Fix:**
1. Hard refresh browser (Cmd+Shift+R)
2. Check browser console for errors
3. Check Network tab - ensure `/api/auth/me` returns user data

---

## 🧪 Test Scenarios

### Scenario 1: Successful Login
1. Go to http://localhost:3001/login
2. Enter: admin@flow.dev / Admin@123
3. ✅ Redirects to /dashboard
4. ✅ User info displays in header

### Scenario 2: Invalid Password
1. Go to http://localhost:3001/login
2. Enter: admin@flow.dev / WrongPassword
3. ✅ Error message displays
4. ✅ Stays on login page

### Scenario 3: Non-existent Email
1. Go to http://localhost:3001/login
2. Enter: nonexistent@flow.dev / Password@123
3. ✅ Error message displays
4. ✅ Stays on login page

### Scenario 4: 2FA Login (if enabled)
1. Login with valid credentials
2. ✅ Form changes to ask for 2FA code
3. Enter 6-digit code from authenticator
4. ✅ Redirects to dashboard

---

## 📊 Dashboard After Login

Once logged in, you should see:
- ✅ User profile in top right
- ✅ Navigation menu on left
- ✅ Organization switcher
- ✅ Dashboard analytics/overview

---

## 🚀 Next Actions

After successful login:
1. **Create Organization** - Set up your workspace
2. **Add Team Members** - Invite collaborators
3. **Explore Modules:**
   - CRM (Clients, Leads)
   - Projects & Tasks
   - Finance (Invoices, Quotations)
   - HR (Attendance, Leaves)
   - Time Tracking
   - Documents

---

## 💡 Tips

- **Faster reload:** Use Cmd+Shift+R for hard refresh
- **Test other users:** Each demo user has access to demo organization
- **View logs:** Watch backend terminal for request logs
- **Database GUI:** Run `npm run prisma:studio` to view database

---

**Start testing! Use the 2-minute quick test above.** 🎉
