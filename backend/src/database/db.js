// backend/src/database/db.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Path to the SQLite database file
// Allow overriding the SQLite database location via the DB_PATH environment variable
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'tradeup.db');

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite Database
const db = new Database(DB_PATH, { verbose: console.log });

// Create tables if they don't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        bio TEXT DEFAULT '',
        profilePictureUrl TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorId INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (authorId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        authorId INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (authorId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- UPDATED TABLE: contacts (now represents a mutual, accepted connection)
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,       -- The user whose contact list this entry belongs to
        contactId INTEGER NOT NULL,    -- The user who is a contact
        UNIQUE(userId, contactId),     -- Ensures a user can't have the same contact twice
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (contactId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: contact_requests
    CREATE TABLE IF NOT EXISTS contact_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER NOT NULL,
        receiverId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(senderId, receiverId),
        FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- UPDATED TABLE: dealrooms (added stage, buyer/seller IDs, agreement flags, contract details)
    CREATE TABLE IF NOT EXISTS dealrooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        creatorId INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        isActive INTEGER DEFAULT 1,
        stage TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'stage_0', 'stage_1', 'stage_2', 'stage_3', 'closed'
        buyerId INTEGER, -- Buyer's user ID
        sellerId INTEGER, -- Seller's user ID
        buyerReady INTEGER DEFAULT 0, -- 0 for not ready, 1 for ready to advance stage
        sellerReady INTEGER DEFAULT 0, -- 0 for not ready, 1 for ready to advance stage
        contractDetails TEXT DEFAULT '{}', -- Store JSON string of contract details
        finalGreenLight INTEGER DEFAULT 0, -- For final approval before close
        FOREIGN KEY (creatorId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (buyerId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sellerId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: dealroom_participants (maps users to dealrooms)
    CREATE TABLE IF NOT EXISTS dealroom_participants (
        dealroomId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        PRIMARY KEY (dealroomId, userId),
        FOREIGN KEY (dealroomId) REFERENCES dealrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: dealroom_invites
    CREATE TABLE IF NOT EXISTS dealroom_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealroomId INTEGER NOT NULL,
        senderId INTEGER NOT NULL, -- The user who sent the invite (dealroom creator)
        receiverId INTEGER NOT NULL, -- The user who receives the invite
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dealroomId, receiverId), -- A user can only be invited to a dealroom once
        FOREIGN KEY (dealroomId) REFERENCES dealrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: dealroom_documents (for documents shared within dealrooms)
    CREATE TABLE IF NOT EXISTS dealroom_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealroomId INTEGER NOT NULL,
        uploaderId INTEGER NOT NULL,
        fileName TEXT NOT NULL,
        filePath TEXT NOT NULL, -- Relative path to the uploaded file
        uploadedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        isVisibleToAll INTEGER DEFAULT 0, -- 0 for private (pre-stage 1), 1 for visible to all parties
        verificationStatus TEXT DEFAULT 'pending', -- 'pending', 'verified', 'flagged'
        verificationResponse TEXT DEFAULT '{}', -- Store raw JSON response from simulated API
        FOREIGN KEY (dealroomId) REFERENCES dealrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaderId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: conversations (for 1-on-1 messaging)
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1Id INTEGER NOT NULL,
        user2Id INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lastMessageTimestamp TEXT,
        UNIQUE(user1Id, user2Id),
        UNIQUE(user2Id, user1Id), -- Ensure uniqueness regardless of user order
        FOREIGN KEY (user1Id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user2Id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- UPDATED TABLE: messages (supports both conversations and dealrooms)
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId INTEGER, -- used for 1-on-1 conversations
        dealroomId INTEGER,     -- used for messages inside dealrooms
        senderId INTEGER NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (dealroomId) REFERENCES dealrooms(id) ON DELETE CASCADE
    );

    -- NEW TABLE: message_reads (to track read status for messages)
    CREATE TABLE IF NOT EXISTS message_reads (
        messageId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        readAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (messageId, userId),
        FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- NEW TABLE: notifications
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,    -- The user who receives the notification
        type TEXT NOT NULL,         -- e.g., 'contact_request', 'contact_accepted', 'dealroom_invite', 'comment_on_post', 'new_message'
        sourceId INTEGER,           -- ID of the related entity (e.g., requestId, inviteId, postId, messageId)
        senderId INTEGER,           -- Optional: The user who caused the notification (e.g., sent request, commented)
        isRead INTEGER DEFAULT 0,   -- 0 for unread, 1 for read
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE
    );
`);
console.log('Database initialized and tables checked (contacts, contact_requests, dealrooms, dealroom_participants, dealroom_invites, conversations, messages, message_reads, and notifications tables added/updated).');

module.exports = { db, DB_PATH };
