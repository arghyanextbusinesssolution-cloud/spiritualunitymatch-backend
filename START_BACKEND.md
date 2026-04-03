# How to Start the Backend - Spiritual Unity Match

## Quick Start

```bash
# From the backend directory
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

## Detailed Setup

### 1. Install Dependencies (if not already done)
```bash
cd backend
npm install
```

### 2. Create Environment File
The `.env` file has been created from `.env.example`. You may need to update:
- `JWT_SECRET` - Generate a strong random string (at least 32 characters)
- `STRIPE_SECRET_KEY` - Your Stripe secret key from Stripe Dashboard
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret
- `STRIPE_PRICE_*` - Your Stripe price IDs for each plan

### 3. Seed Admin User (Optional but Recommended)
```bash
cd backend
npm run seed:admin
```

This creates an admin user with:
- Email: `admin@platform.com`
- Password: `Admin@12345`

### 4. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## Server Status

Once started, you should see:
```
✅ MongoDB connected successfully
🚀 Server running on port 5000
```

## API Endpoints

The backend API will be available at:
- Base URL: `http://localhost:5000/api`
- Health Check: `http://localhost:5000/api/health`

## Troubleshooting

### MongoDB Connection Issues
- Check that the MongoDB connection string in `.env` is correct
- Ensure your IP is whitelisted in MongoDB Atlas (or use 0.0.0.0/0 for development)

### Port Already in Use
- Change `PORT` in `.env` to a different port (e.g., 5001)
- Or stop the process using port 5000

### Missing Dependencies
```bash
npm install
```

