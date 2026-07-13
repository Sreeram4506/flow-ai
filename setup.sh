#!/bin/bash

# Flow - Automated Setup Script
# This script automates the database setup process

set -e

echo "🚀 Flow - Automated Setup"
echo "=========================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js is installed${NC}"

# Check if MongoDB is accessible
echo ""
echo "Checking MongoDB..."
DATABASE_URL="${DATABASE_URL:-mongodb://127.0.0.1:27018/flow_db?replicaSet=rs0}"

if command -v mongosh &> /dev/null; then
    echo -e "${GREEN}✓ mongosh is installed${NC}"
    if mongosh "$DATABASE_URL" --quiet --eval "db.runCommand({ ping: 1 }).ok" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ MongoDB is reachable${NC}"
    else
        echo -e "${YELLOW}⚠️  MongoDB not reachable at ${DATABASE_URL}${NC}"
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}❌ Docker is not installed${NC}"
            echo "   Please install MongoDB or Docker to continue"
            exit 1
        fi

        if ! docker ps --format '{{.Names}}' | grep -q "^flow-mongo$"; then
            echo "Starting MongoDB container..."
            docker run --name flow-mongo -d -p 27017:27017 mongo:7
            echo -e "${GREEN}✓ MongoDB container started${NC}"
            sleep 5
        fi
    fi
else
    echo -e "${YELLOW}⚠️  mongosh CLI not found${NC}"
    echo "   Using Docker instead..."
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed${NC}"
        echo "   Please install MongoDB or Docker to continue"
        exit 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^flow-mongo$"; then
        echo "Starting MongoDB container..."
        docker run --name flow-mongo -d -p 27017:27017 mongo:7
        echo -e "${GREEN}✓ MongoDB container started${NC}"
        sleep 5
    fi
fi

# Check if Redis is running
echo ""
echo "Checking Redis..."
if ! command -v redis-cli &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis CLI not found${NC}"
    echo "   Using Docker instead..."
    if docker ps | grep -q "flow-redis"; then
        echo -e "${GREEN}✓ Redis container is running${NC}"
    else
        echo "Starting Redis container..."
        docker run --name flow-redis -d -p 6379:6379 redis:latest
        echo -e "${GREEN}✓ Redis container started${NC}"
        sleep 2
    fi
else
    echo -e "${GREEN}✓ Redis CLI is available${NC}"
fi

# Setup Prisma
echo ""
echo "Setting up Prisma..."
npm run prisma:generate
echo -e "${GREEN}✓ Prisma generated${NC}"

# Run migrations
echo ""
echo "Running database migrations..."
npm run prisma:migrate -- --skip-generate
echo -e "${GREEN}✓ Migrations completed${NC}"

# Seed database
echo ""
echo "Seeding database with demo data..."
npm run prisma:seed
echo -e "${GREEN}✓ Database seeded${NC}"

# Success message
echo ""
echo "=========================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================="
echo ""
echo "Demo Credentials:"
echo "  Email: admin@flow.dev"
echo "  Password: Admin@123"
echo ""
echo "Other demo users (password: User@123):"
echo "  - john@flow.dev"
echo "  - jane@flow.dev"
echo "  - bob@flow.dev"
echo "  - alice@flow.dev"
echo ""
echo "Next steps:"
echo "  1. Terminal 1: npm run start:prod          (starts backend)"
echo "  2. Terminal 2: cd frontend && npm start    (starts frontend)"
echo "  3. Open http://localhost:3001 in browser"
echo ""
echo "Happy coding! 🎉"
