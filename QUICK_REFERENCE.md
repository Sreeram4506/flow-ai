# 📌 QUICK REFERENCE CARD

## 🎯 The Problem & Solution

**PROBLEM:** Login page stuck - no redirect, no error  
**SOLUTION:** Fixed Axios response extraction in AuthContext  

---

## ⚡ 30-Second Summary

```
BEFORE: api.get("/auth/me") returned axios response object
        → Tried to access userData.id directly ❌
        → Nothing worked

AFTER:  api.get("/auth/me") response data properly extracted
        → const data = response.data || response ✅
        → Login flow works perfectly
```

---

## 🚀 Just 4 Commands to Get Started

```bash
# Command 1: Setup (once)
./setup.sh

# Command 2: Backend
npm run start:prod

# Command 3: Frontend (new terminal)
cd frontend && npm start

# Command 4: Test
# Open http://localhost:3001
# Email: admin@flow.dev | Password: Admin@123
```

---

## 🔑 Demo Credentials

```
ADMIN:
admin@flow.dev / Admin@123

USERS (all use User@123):
john@flow.dev
jane@flow.dev
bob@flow.dev
alice@flow.dev
```

---

## ✅ Files Changed

| File | Change |
|------|--------|
| `frontend/src/context/AuthContext.tsx` | Fixed API response handling |
| `.env` | Added demo credentials |
| `frontend/.env.local` | Added API URL |

---

## 📚 Guides Created

- `GET_STARTED.md` ← Read this first!
- `SETUP_GUIDE.md` - Full setup instructions
- `LOGIN_TESTING_GUIDE.md` - Testing procedures
- `FIXES_SUMMARY.md` - Technical details
- `setup.sh` - Automated setup

---

## 🐛 Quick Fixes

| Issue | Fix |
|-------|-----|
| Database error | `brew services start mongodb-community@7.0` |
| Redis error | `brew services start redis` |
| Port in use | `lsof -i :3000 \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |
| Wrong credentials | `npm run prisma:seed` |

---

## 📊 What Works Now

✅ Login  
✅ User data loads  
✅ Dashboard redirect  
✅ Error messages  
✅ Token storage  

---

## ⏱️ Timeline

```
Setup:       3 min
Backend:    30 sec
Frontend:   30 sec
Test:        1 min
─────────────────
TOTAL:      ~5 min
```

---

## 🎯 URLs

```
Frontend:  http://localhost:3001
Backend:   http://localhost:3000
API Docs:  http://localhost:3000/api
DB GUI:    http://localhost:5555 (after: npm run prisma:studio)
```

---

## 💾 Important Directories

```
/backend:        ./src
/frontend:       ./frontend/src
/database:       ./prisma
/compiled build: ./dist (backend)
/compiled build: ./frontend/.next (frontend)
```

---

## 🔍 Debug Tips

```javascript
// Check token stored?
console.log(localStorage.getItem('token'))

// Check API works?
fetch('http://localhost:3000/api/auth/me')
  .then(r => r.json())
  .then(console.log)

// Check user loaded?
console.log(useAuth().user)
```

---

**Start with:** `cd /Users/koushikeslavath/Downloads/flow && ./setup.sh`

**Questions?** Check GET_STARTED.md or SETUP_GUIDE.md

**🎉 Ready to test the login!**
