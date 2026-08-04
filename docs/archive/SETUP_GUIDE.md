# Flow - Setup Guide

## ✅ Fixed Issues
- ✅ API response handling fixed in AuthContext
- ✅ Login error messages now display properly
- ✅ User data now loads correctly after authentication
- ✅ Navigation to dashboard after successful login

---

## 🚀 Quick Start - 5 Minutes

### 1. **Install MongoDB**

#### macOS (using Homebrew):
```bash
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

#### Or use Docker:
```bash
docker run --name flow-mongo -d -p 27017:27017 mongo:7
```

#### Or use Online Service (MongoDB Atlas):
1. Go to https://www.mongodb.com/atlas
2. Sign up and create a free cluster
3. Copy the connection string

---

### 2. **Create Database**

```bash
# If using local MongoDB
mongosh "mongodb://localhost:27017/flow_db"

# Verify connection
mongosh "mongodb://localhost:27017/flow_db" --eval "db.runCommand({ ping: 1 })"
```

---

### 3. **Update Database URL in .env**

```bash
# .env file (already in project)
DATABASE_URL=mongodb://127.0.0.1:27018/flow_db?replicaSet=rs0

# Or with MongoDB Atlas
DATABASE_URL=mongodb+srv://username:password@cluster0.example.mongodb.net/flow_db
```

---

### 4. **Setup Database & Seed Demo Data**

```bash
cd /Users/koushikeslavath/Downloads/flow

# Run migrations
npm run prisma:migrate

# Seed demo users
npm run prisma:seed
```

**Demo Users Created:**
```
SUPER ADMIN:
Email: admin@flow.dev
Password: Admin@123

DEMO USERS:
Email: john@flow.dev, jane@flow.dev, bob@flow.dev, alice@flow.dev
Password: User@123 (all demo users)
```

---

### 5. **Start Redis (required)**

#### macOS:
```bash
brew install redis
brew services start redis
```

#### Docker:
```bash
docker run -d -p 6379:6379 redis:latest
```

---

### 6. **Run the Application**

#### Terminal 1 - Backend:
```bash
cd /Users/koushikeslavath/Downloads/flow
npm run start:prod
```

Backend will be running at: **http://localhost:3000**

#### Terminal 2 - Frontend:
```bash
cd /Users/koushikeslavath/Downloads/flow/frontend
npm start
```

Frontend will be running at: **http://localhost:3001**

---

## 🔑 **Login & Test**

1. Open http://localhost:3001 in your browser
2. Click on "Log In"
3. Enter credentials:
   - **Email:** admin@flow.dev
   - **Password:** Admin@123
4. You should be redirected to the Dashboard

---

## 🐛 **Troubleshooting**

### Issue: "Cannot connect to database"
**Solution:**
- Check if MongoDB is running: `brew services list`
- Verify DATABASE_URL in .env is correct
- Test connection: `mongosh "mongodb://localhost:27017/flow_db" --eval "db.runCommand({ ping: 1 })"`

### Issue: "Redis connection error"
**Solution:**
- Start Redis: `brew services start redis`
- Or use Docker: `docker run -d -p 6379:6379 redis:latest`

### Issue: "Login page shows no error but doesn't redirect"
**Solution:**
- Check browser console (F12) for errors
- Check backend logs for API errors
- Ensure backend is running on port 3000
- Clear browser cache: `Cmd + Shift + Delete`

### Issue: "Prisma schema not found"
**Solution:**
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### Issue: "Port 3000 or 3001 already in use"
**Solution:**
```bash
# Kill process on port 3000
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

---

## 📊 **Prisma Studio (Database GUI)**

View and manage your database graphically:

```bash
npm run prisma:studio
```

Opens at: http://localhost:5555

---

## 🔄 **Reset Everything**

If you want to start fresh:

```bash
# Reset the database via Prisma
npm run prisma:migrate reset

# This will:
# 1. Drop the database
# 2. Run all migrations
# 3. Seed demo data
```

---

## 📚 **Development Commands**

```bash
# Backend
npm run start:dev          # Development mode with hot reload
npm run lint              # Run ESLint
npm run test              # Run tests
npm run test:e2e          # Run E2E tests
npm run build             # Build for production

# Frontend
cd frontend
npm run dev               # Development mode
npm run build             # Build for production
npm run lint              # Run linting
```

---

## 🎯 **Next Steps After Login**

1. **Create Organization** - From dashboard, create your first organization
2. **Add Team Members** - Invite users to your organization
3. **Create Projects** - Start managing projects
4. **Setup CRM** - Add clients and leads
5. **Configure Settings** - Customize your workspace

---

## 📞 **API Documentation**

Once backend is running, visit:
- **Swagger API Docs:** http://localhost:3000/api

---

## 🔐 **Security Notes**

⚠️ **For Development Only:**
- Demo credentials are hardcoded for testing
- Change JWT_SECRET in .env for production
- Use environment-specific configurations

---

**You're all set! Start the services and login with admin@flow.dev / Admin@123** 🚀
