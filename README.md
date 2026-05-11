# Workout Application

This project consists of a **backend** (Node.js + MongoDB) and a **frontend** (React). Follow the instructions below to set up and run the development environment.

---

## 📌 Development Setup

### 1. MongoDB Access
- Ensure your **IP address has been whitelisted** in MongoDB Atlas.
- If not, please contact **Truezy** to update the whitelist.

---

### 2. Backend Setup
Navigate to the backend folder and run the development server:

```bash
cd workout-backend
npm install
npm run dev
```

Create `workout-backend/.env` from `workout-backend/.env.example`.

Required backend variables:

- `MONGODB_URI`
- `JWT_SECRET`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `PORT`

---

### 3. Frontend Setup
Navigate to the frontend folder and run the development server:

```bash
cd workout-frontend
npm install
npm run dev
```

Create `workout-frontend/.env.local` from `workout-frontend/.env.example`.

Required frontend variable:

- `VITE_API_BASE`

---

## Deployment Notes

GitHub Pages can only host the static frontend. This app also requires an Express API server and MongoDB, so GitHub Pages alone is not enough.

Recommended deployment:

- Frontend: Vercel
- Backend: Render, Railway, Fly.io, or similar
- Database: MongoDB Atlas

Production backend notes:

- Set `FRONTEND_URL` to the deployed frontend URL so password reset links point to the right place.
- Set `CORS_ORIGIN` to the deployed frontend URL.
- Use a strong `JWT_SECRET`.
- Do not commit `.env` files or secrets.
- Keep refresh cookies secure in production. The current backend sets the refresh cookie `secure` flag when `NODE_ENV=production`.
