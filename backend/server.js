// backend/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Import modularized components
const { db, DB_PATH } = require('./src/database/db'); // Database connection and schema, and DB_PATH
const { uploadProfilePicture } = require('./src/middleware/upload'); // Import upload middleware for profile pictures
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const contactRoutes = require('./src/routes/contacts');
const postRoutes = require('./src/routes/posts');
const dealroomRoutes = require('./src/routes/dealrooms');
const notificationRoutes = require('./src/routes/notifications');
const messageRoutes = require('./src/routes/messages'); 


const app = express();
const PORT = 3000;
const server = http.createServer(app);
setupWebSocket(server);

websocket.init(server);
app.locals.sendToUser = websocket.sendToUser;
app.locals.broadcast = websocket.broadcast;

// Middleware to parse JSON
app.use(express.json());
// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Use the modularized API routes
app.use('/api/auth', authRoutes); // e.g., /api/auth/signup, /api/auth/login
// CHANGED: Pass uploadProfilePicture to userRoutes as it's used there for profile updates
app.use('/api/users', userRoutes); // e.g., /api/users/profile/:id, /api/users/search
app.use('/api/contacts', contactRoutes); // e.g., /api/contacts, /api/contacts/:userId, /api/contact-requests/incoming/:userId
app.use('/api/posts', postRoutes); // e.g., /api/posts, /api/posts/:id, /api/posts/:postId/comments
// CHANGED: No direct middleware here, it will be used within the dealroomRoutes
app.use('/api/dealrooms', dealroomRoutes); // e.g., /api/dealrooms, /api/dealroom-invites/incoming/:userId, /api/dealrooms/user/:userId
app.use('/api/notifications', notificationRoutes); // e.g., /api/notifications/unread/:userId
app.use('/api/messages', messageRoutes); // NEW: Add message routes

// Fallback route (catch-all)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Create HTTP and WebSocket servers
const server = http.createServer(app);
websocket.init(server);

// Start server
server.listen(PORT, () => {
    console.log(`🚀 TradeUp server running at http://localhost:${PORT}`);
    console.log(`Database connected at ${DB_PATH}`); // Now using the exported DB_PATH
    console.log(`Access frontend at http://localhost:${PORT}/index.html`);
});

// Close the database connection when the Node.js process exits
process.on('SIGINT', () => {
    console.log('Closing database connection...');
    db.close();
    if (server) {
        server.close();
    }
    process.exit(0);
});
