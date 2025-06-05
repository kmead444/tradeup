// backend/src/routes/messages.js
const express = require('express');
const { db } = require('../database/db');
const { createNotification } = require('../utils/notifications');
const { sendToUser, broadcast } = require('../websocket');



const router = express.Router();

// Helper to get conversation ID or create a new one
async function getOrCreateConversation(user1Id, user2Id) {
    // Ensure consistent ordering for the unique constraint
    const sortedUserIds = [user1Id, user2Id].sort((a, b) => a - b);
    const u1 = sortedUserIds[0];
    const u2 = sortedUserIds[1];

    let conversation = db.prepare(`SELECT id FROM conversations WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?)`).get(u1, u2, u2, u1);

    if (!conversation) {
        // Create new conversation
        const stmt = db.prepare(`INSERT INTO conversations (user1Id, user2Id, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)`);
        const info = stmt.run(u1, u2);
        conversation = { id: info.lastInsertRowid };
    }
    return conversation.id;
}

// POST /api/messages - Send a new message
router.post('/', async (req, res) => {
    const { conversationId, senderId, receiverId, content, dealroomId } = req.body;

    if (!senderId || !content) {
        return res.status(400).json({ message: 'Sender ID and content are required.' });
    }

    if (!conversationId && !receiverId && !dealroomId) { // receiverId is needed if conversationId is not provided
        return res.status(400).json({ message: 'Either conversationId (and receiverId implied) or dealroomId is required.' });
    }

    let actualConversationId = conversationId;

    try {
        if (!actualConversationId && receiverId) {
            // This is for 1-on-1 messages where conversationId might not be known yet on frontend
            actualConversationId = await getOrCreateConversation(senderId, receiverId);
        }

        const stmt = db.prepare(`
            INSERT INTO messages (conversationId, dealroomId, senderId, content, timestamp)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(actualConversationId, dealroomId, senderId, content);

        if (info.changes > 0) {
            // Update lastMessageTimestamp in conversations table
            if (actualConversationId) {
                db.prepare(`UPDATE conversations SET lastMessageTimestamp = CURRENT_TIMESTAMP WHERE id = ?`).run(actualConversationId);
            }

            // Create or update 'new_messages' notification for the receiver
            if (actualConversationId && receiverId && senderId !== receiverId) {
                const existingNotif = db.prepare(`SELECT id FROM notifications WHERE userId = ? AND type = 'new_messages' AND isRead = 0`).get(receiverId);
                if (existingNotif) {
                    // If an unread 'new_messages' notification exists, update its timestamp to bring it to top
                    db.prepare(`UPDATE notifications SET createdAt = CURRENT_TIMESTAMP WHERE id = ?`).run(existingNotif.id);
                } else {
                    // Otherwise, create a new 'new_messages' notification
                    createNotification({
                        userId: receiverId,
                        type: 'new_messages',
                        sourceId: null, // No specific source ID for a general 'new messages' notification
                        senderId: senderId
                    });
                }
            }

            // Mark message as read for the sender
            // CORRECTED: Removed 'message_read_id' as it's not in the schema, relies on composite PK
            db.prepare(`INSERT OR IGNORE INTO message_reads (messageId, userId, readAt) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(info.lastInsertRowid, senderId);


            const messagePayload = db.prepare(`
                SELECT id, conversationId, dealroomId, senderId, content, timestamp
                FROM messages WHERE id = ?
            `).get(info.lastInsertRowid);

            if (dealroomId) {
                const participants = db.prepare('SELECT userId FROM dealroom_participants WHERE dealroomId = ?').all(dealroomId).map(p => p.userId);
                broadcast(participants, 'new_dealroom_message', messagePayload);
            } else if (actualConversationId) {
                let targetReceiverId = receiverId;
                if (!targetReceiverId) {
                    const convo = db.prepare('SELECT user1Id, user2Id FROM conversations WHERE id = ?').get(actualConversationId);
                    if (convo) {
                        targetReceiverId = convo.user1Id === senderId ? convo.user2Id : convo.user1Id;
                    }
                }
                if (targetReceiverId) {
                    sendToUser(targetReceiverId, 'new_message', messagePayload);
                }
                sendToUser(senderId, 'new_message', messagePayload);

            const { timestamp } = db.prepare('SELECT timestamp FROM messages WHERE id = ?').get(info.lastInsertRowid);
            const payload = { senderId, content, timestamp };
            if (actualConversationId) payload.conversationId = actualConversationId;
            if (dealroomId) payload.dealroomId = dealroomId;

            if (actualConversationId && receiverId) {
                sendToUser(receiverId, { type: 'new_message', data: payload });
            } else if (dealroomId) {
                const ids = db.prepare('SELECT userId FROM dealroom_participants WHERE dealroomId = ?').all(dealroomId).map(r => r.userId);
                broadcast(ids, { type: 'new_message', data: payload });

            }
        } // <-- Add this closing brace to fix the block

            res.status(201).json({ message: 'Message sent successfully!', messageId: info.lastInsertRowid });
        } else {
            res.status(500).json({ message: 'Failed to send message.' });
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error sending message.' });
    }
});

// GET /api/messages/conversations/:userId - Get all conversations for a user
router.get('/conversations/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        const conversationsStmt = db.prepare(`
            SELECT
                c.id AS conversationId,
                c.user1Id,
                c.user2Id,
                c.lastMessageTimestamp,
                m.content AS lastMessageContent,
                COALESCE(u1.name, 'N/A') AS user1Name,
                COALESCE(u1.email, 'N/A') AS user1Email,
                COALESCE(u1.profilePictureUrl, '') AS user1ProfilePictureUrl,
                COALESCE(u2.name, 'N/A') AS user2Name,
                COALESCE(u2.email, 'N/A') AS user2Email,
                COALESCE(u2.profilePictureUrl, '') AS u2ProfilePictureUrl
            FROM conversations c
            LEFT JOIN messages m ON m.conversationId = c.id AND m.timestamp = c.lastMessageTimestamp
            LEFT JOIN users u1 ON c.user1Id = u1.id
            LEFT JOIN users u2 ON c.user2Id = u2.id
            WHERE c.user1Id = ? OR c.user2Id = ?
            ORDER BY c.lastMessageTimestamp DESC
        `);
        const conversations = conversationsStmt.all(userId, userId);

        const conversationsWithUnread = conversations.map(convo => {
            const partnerId = convo.user1Id === userId ? convo.user2Id : convo.user1Id;
            const partner = {
                id: partnerId,
                name: partnerId === convo.user1Id ? convo.user1Name : convo.user2Name,
                email: partnerId === convo.user1Id ? convo.user1Email : convo.user2Email,
                profilePictureUrl: partnerId === convo.user1Id ? convo.user1ProfilePictureUrl : convo.user2ProfilePictureUrl,
            };

            // Get unread count for this specific conversation for the current user
            const unreadCountStmt = db.prepare(`
                SELECT COUNT(m.id) AS unreadCount
                FROM messages m
                WHERE m.conversationId = ? AND m.senderId != ?
                AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.messageId = m.id AND mr.userId = ?)
            `);
            const unreadResult = unreadCountStmt.get(convo.conversationId, userId, userId);
            const unreadCount = unreadResult ? unreadResult.unreadCount : 0;

            return {
                id: convo.conversationId,
                user1: { id: convo.user1Id, name: convo.user1Name, email: convo.user1Email, profilePictureUrl: convo.user1ProfilePictureUrl },
                user2: { id: convo.user2Id, name: convo.user2Name, email: convo.user2Email, profilePictureUrl: convo.user2ProfilePictureUrl },
                partner: partner, // Convenience for frontend
                lastMessageContent: convo.lastMessageContent,
                lastMessageTimestamp: convo.lastMessageTimestamp,
                unreadCount: unreadCount
            };
        });

        res.json(conversationsWithUnread);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Server error fetching conversations.' });
    }
});

// GET /api/messages/thread/:conversationId - Get messages for a specific conversation
router.get('/thread/:conversationId', (req, res) => {
    const conversationId = parseInt(req.params.conversationId);

    try {
        const messagesStmt = db.prepare(`
            SELECT
                m.id,
                m.senderId,
                COALESCE(u.name, 'N/A') AS senderName,
                COALESCE(u.profilePictureUrl, '') AS senderProfilePictureUrl,
                m.content,
                m.timestamp
            FROM messages m
            LEFT JOIN users u ON m.senderId = u.id
            WHERE m.conversationId = ?
            ORDER BY m.timestamp ASC
        `);
        const messages = messagesStmt.all(conversationId);
        res.json(messages);
    }
    catch (error) {
        console.error('Error fetching message thread:', error);
        res.status(500).json({ message: 'Server error fetching message thread.' });
    }
});

// PUT /api/messages/read/:conversationId/:userId - Mark messages in a conversation as read for a user
router.put('/read/:conversationId/:userId', (req, res) => {
    const conversationId = parseInt(req.params.conversationId);
    const userId = parseInt(req.params.userId);

    try {
        // Get all unread messages for this user in this conversation that they received
        const unreadMessagesStmt = db.prepare(`
            SELECT m.id FROM messages m
            WHERE m.conversationId = ? AND m.senderId != ?
            AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.messageId = m.id AND mr.userId = ?)
        `);
        const unreadMessages = unreadMessagesStmt.all(conversationId, userId, userId);

        if (unreadMessages.length > 0) {
            db.transaction(() => {
                // CORRECTED: Removed 'message_read_id' as it's not in the schema, relies on composite PK
                const markReadStmt = db.prepare(`INSERT OR IGNORE INTO message_reads (messageId, userId, readAt) VALUES (?, ?, CURRENT_TIMESTAMP)`);
                for (const msg of unreadMessages) {
                    markReadStmt.run(msg.id, userId);
                }
            })(); // Execute the transaction

            // Check if there are any remaining unread messages for this user in *any* conversation
            const totalUnreadMessagesAcrossAllConversations = db.prepare(`
                SELECT COUNT(m.id) AS totalUnread
                FROM messages m
                LEFT JOIN message_reads mr ON m.id = mr.messageId AND mr.userId = ?
                WHERE (
                    m.conversationId IN (SELECT id FROM conversations WHERE user1Id = ? OR user2Id = ?)
                    OR
                    m.dealroomId IN (SELECT dealroomId FROM dealroom_participants WHERE userId = ?)
                )
                AND m.senderId != ?
                AND mr.messageId IS NULL; -- Message has not been read by this user
            `).get(userId, userId, userId, userId, userId).totalUnread;

            // If no unread messages across all conversations, mark the 'new_messages' notification as read
            if (totalUnreadMessagesAcrossAllConversations === 0) {
                 db.prepare(`UPDATE notifications SET isRead = 1 WHERE userId = ? AND type = 'new_messages'`).run(userId);
            }


            res.json({ message: `Marked ${unreadMessages.length} messages as read.` });
        } else {
            res.json({ message: 'No new messages to mark as read.' });
        }
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ message: 'Server error marking messages as read.' });
    }
});


module.exports = router;
