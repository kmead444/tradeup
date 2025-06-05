// backend/src/utils/notifications.js
const { db } = require('../database/db');

/**
 * Creates a new notification in the database.
 * @param {Object} notificationData - The data for the notification.
 * @param {number} notificationData.userId - The ID of the user to notify.
 * @param {string} notificationData.type - The type of notification (e.g., 'contact_request', 'comment_on_post', 'dealroom_invite', 'new_message').
 * @param {number} [notificationData.sourceId] - Optional: ID of the related entity (e.g., requestId, inviteId, postId, messageId).
 * @param {number} [notificationData.senderId] - Optional: ID of the user who caused the notification.
 */
function createNotification({ userId, type, sourceId = null, senderId = null }) {
    try {
        const stmt = db.prepare(`
            INSERT INTO notifications (userId, type, sourceId, senderId, isRead, createdAt)
            VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
        `);
        const info = stmt.run(userId, type, sourceId, senderId);
        console.log(`Notification created for user ${userId}, type: ${type}, ID: ${info.lastInsertRowid}`);
    } catch (error) {
        // Handle unique constraint errors for duplicate notifications if necessary
        if (error.message.includes('UNIQUE constraint failed')) {
            console.warn(`Attempted to create duplicate notification for user ${userId}, type ${type}.`);
        } else {
            console.error('Error creating notification:', error);
        }
    }
}

module.exports = {
    createNotification
};
