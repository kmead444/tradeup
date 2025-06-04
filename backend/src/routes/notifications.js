// backend/src/routes/notifications.js
const express = require('express');
const { db } = require('../database/db');
const router = express.Router();

// NEW API: Get unread notifications for a user with detailed information
router.get('/unread/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    let allNotifications = [];

    try {
        // Fetch all *unread* notifications from the notifications table for the given user
        // Ensure that notifications are only fetched if they are explicitly marked as unread (isRead = 0)
        const fetchedNotificationsStmt = db.prepare(`
            SELECT
                n.id AS notificationId,
                n.type,
                n.createdAt AS timestamp,
                n.sourceId,
                n.senderId
            FROM notifications n
            WHERE n.userId = ? AND n.isRead = 0
            ORDER BY n.createdAt DESC
        `);
        const fetchedNotifications = fetchedNotificationsStmt.all(userId);

        fetchedNotifications.forEach(notif => {
            let detail = {
                notificationId: notif.notificationId,
                type: notif.type,
                timestamp: notif.timestamp,
                message: '' // Initialize message to prevent undefined issues
            };

            switch (notif.type) {
                case 'contact_request':
                    const crDetailStmt = db.prepare(`
                        SELECT u.name AS senderName, u.profilePictureUrl AS senderProfilePictureUrl
                        FROM contact_requests cr LEFT JOIN users u ON cr.senderId = u.id
                        WHERE cr.id = ?
                    `);
                    const cr = crDetailStmt.get(notif.sourceId);
                    if (cr) {
                        detail.senderName = cr.senderName;
                        detail.senderProfilePictureUrl = cr.senderProfilePictureUrl;
                        detail.message = `<strong>${cr.senderName || 'Unknown User'}</strong> sent you a contact request.`;
                    } else {
                        // If source record is not found, mark this notification as read to clean up
                        console.warn(`Notification source (contact_request ID: ${notif.sourceId}) not found for user ${userId}. Marking notification ${notif.notificationId} as read.`);
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return; // Skip adding this notification to the list
                    }
                    break;
                case 'contact_accepted':
                    const caDetailStmt = db.prepare(`
                        SELECT u.name AS acceptorName, u.profilePictureUrl AS acceptorProfilePictureUrl
                        FROM users u
                        WHERE u.id = ?
                    `);
                    const ca = caDetailStmt.get(notif.senderId);
                    if (ca) {
                        detail.senderName = ca.acceptorName;
                        detail.senderProfilePictureUrl = ca.acceptorProfilePictureUrl;
                        detail.message = `<strong>${ca.acceptorName || 'Unknown User'}</strong> accepted your contact request.`;
                    } else {
                        console.warn(`Notification sender (contact_accepted ID: ${notif.senderId}) not found for user ${userId}. Marking notification ${notif.notificationId} as read.`);
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return;
                    }
                    break;
                case 'dealroom_invite':
                    const diDetailStmt = db.prepare(`
                        SELECT u.name AS senderName, u.profilePictureUrl AS senderProfilePictureUrl, d.title AS dealroomTitle
                        FROM dealroom_invites di LEFT JOIN users u ON di.senderId = u.id LEFT JOIN dealrooms d ON di.dealroomId = d.id
                        WHERE di.id = ?
                    `);
                    const di = diDetailStmt.get(notif.sourceId);
                    if (di) {
                        detail.senderName = di.senderName;
                        detail.senderProfilePictureUrl = di.senderProfilePictureUrl;
                        detail.dealroomTitle = di.dealroomTitle;
                        detail.message = `<strong>${di.senderName || 'Unknown User'}</strong> invited you to a deal room: "${di.dealroomTitle || 'N/A'}".`;
                    } else {
                        console.warn(`Notification source (dealroom_invite ID: ${notif.sourceId}) not found for user ${userId}. Marking notification ${notif.notificationId} as read.`);
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return;
                    }
                    break;
                case 'dealroom_accepted':
                    const daDetailStmt = db.prepare(`
                        SELECT u.name AS acceptorName, u.profilePictureUrl AS acceptorProfilePictureUrl, d.title AS dealroomTitle
                        FROM dealroom_invites di
                        LEFT JOIN users u ON di.receiverId = u.id -- It's the receiver who accepts, so u.id should be di.receiverId
                        LEFT JOIN dealrooms d ON di.dealroomId = d.id
                        WHERE di.id = ?
                    `);
                    const da = daDetailStmt.get(notif.sourceId); // sourceId is the inviteId
                    if (da) {
                        detail.senderName = da.acceptorName;
                        detail.senderProfilePictureUrl = da.acceptorProfilePictureUrl;
                        detail.dealroomTitle = da.dealroomTitle;
                        detail.message = `<strong>${da.acceptorName || 'Unknown User'}</strong> accepted your invite to dealroom: "${da.dealroomTitle || 'N/A'}".`;
                    } else {
                        console.warn(`Notification source (dealroom_accepted invite ID: ${notif.sourceId}) not found for user ${userId}. Marking notification ${notif.notificationId} as read.`);
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return;
                    }
                    break;
                case 'comment_on_post':
                    const copDetailStmt = db.prepare(`
                        SELECT u.name AS commentAuthor, u.profilePictureUrl AS commentAuthorProfilePictureUrl, p.content AS postContent, c.content AS commentContent
                        FROM comments c LEFT JOIN users u ON c.authorId = u.id LEFT JOIN posts p ON c.postId = p.id
                        WHERE c.id = ?
                    `);
                    const cop = copDetailStmt.get(notif.sourceId);
                    if (cop) {
                        detail.commentAuthor = cop.commentAuthor;
                        detail.commentAuthorProfilePictureUrl = cop.commentAuthorProfilePictureUrl;
                        // Safely truncate post content, handling potential null/undefined
                        detail.postContent = cop.postContent ? (cop.postContent.substring(0, 50) + (cop.postContent.length > 50 ? '...' : '')) : 'N/A';
                        detail.commentContent = cop.commentContent;
                        detail.message = `<strong>${cop.commentAuthor || 'Unknown User'}</strong> commented on your post: "${detail.postContent}".`;
                    } else {
                        console.warn(`Notification source (comment_on_post ID: ${notif.sourceId}) not found for user ${userId}. Marking notification ${notif.notificationId} as read.`);
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return;
                    }
                    break;
                case 'new_messages':
                    // This query calculates total unread messages for the user across all conversations/dealrooms
                    // that they are a participant in and haven't read messages from.
                    const unreadMessagesCountStmt = db.prepare(`
                        SELECT COUNT(m.id) AS unreadCount
                        FROM messages m
                        LEFT JOIN message_reads mr ON m.id = mr.messageId AND mr.userId = ?
                        WHERE (
                            m.conversationId IN (SELECT id FROM conversations WHERE user1Id = ? OR user2Id = ?)
                            OR
                            m.dealroomId IN (SELECT dealroomId FROM dealroom_participants WHERE userId = ?)
                        )
                        AND m.senderId != ?
                        AND mr.messageId IS NULL; -- Message has not been read by this user
                    `);
                    // Pass userId 5 times for the 5 placeholders
                    const unreadResult = unreadMessagesCountStmt.get(userId, userId, userId, userId, userId);
                    detail.unreadCount = unreadResult ? unreadResult.unreadCount : 0;

                    if (detail.unreadCount > 0) {
                        detail.message = `You have <strong>${detail.unreadCount}</strong> new message(s).`;
                    } else {
                        // If the notification exists but there are no actual unread messages, mark it as read
                        db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ?`).run(notif.notificationId);
                        return; // Skip adding this notification to the list
                    }
                    break;
                default:
                    // Fallback for any unhandled notification types
                    console.warn(`Unhandled notification type: ${notif.type} for notification ID: ${notif.notificationId} for user ${userId}.`);
                    detail.message = 'An unknown notification has occurred.';
                    break;
            }
            allNotifications.push(detail);
        });

        // The total unread count is simply the count of notifications pushed to allNotifications
        const totalUnreadCount = allNotifications.length;

        res.json({ totalUnreadCount: totalUnreadCount, details: allNotifications });

    } catch (error) {
        console.error(`CRITICAL ERROR fetching unread notifications for user ${userId}:`, error);
        // Return a 500 error with a message indicating the server error
        res.status(500).json({ message: 'Server error fetching unread notifications. Please check server logs.' });
    }
});

// NEW API: Mark all notifications for a user as read
router.put('/mark-read/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    try {
        // Mark all notifications in the 'notifications' table as read for this user
        const stmt = db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0');
        const info = stmt.run(userId);
        res.json({ message: `Marked ${info.changes} notifications as read.`, changes: info.changes });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Server error marking all notifications as read.' });
    }
});

module.exports = router;