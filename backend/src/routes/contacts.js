// backend/src/routes/contacts.js
const express = require('express');
const { db } = require('../database/db');
const { createNotification } = require('../utils/notifications'); // Import createNotification

const router = express.Router();

// MODIFIED API: Send a contact request
router.post('/', (req, res) => {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId) {
        return res.status(400).json({ message: 'Sender ID and receiver ID are required.' });
    }

    if (senderId === receiverId) {
        return res.status(400).json({ message: 'Cannot send a contact request to yourself.' });
    }

    try {
        // 1. Check if they are already contacts (mutually accepted)
        const checkMutualContactStmt = db.prepare('SELECT id FROM contacts WHERE (userId = ? AND contactId = ?) AND EXISTS (SELECT 1 FROM contacts WHERE userId = ? AND contactId = ?)');
        const areAlreadyContacts = checkMutualContactStmt.get(senderId, receiverId, receiverId, senderId);
        if (areAlreadyContacts) {
            return res.status(409).json({ message: 'You are already contacts with this user.' });
        }

        // 2. Check if a pending request already exists (sender -> receiver)
        const checkPendingOutgoingStmt = db.prepare('SELECT id FROM contact_requests WHERE senderId = ? AND receiverId = ? AND status = \'pending\'');
        const pendingOutgoing = checkPendingOutgoingStmt.get(senderId, receiverId);
        if (pendingOutgoing) {
            return res.status(409).json({ message: 'Contact request already sent and is pending.' });
        }

        // 3. Check if a pending request already exists (receiver -> sender - incoming)
        const checkPendingIncomingStmt = db.prepare('SELECT id FROM contact_requests WHERE senderId = ? AND receiverId = ? AND status = \'pending\'');
        const pendingIncoming = checkPendingIncomingStmt.get(receiverId, senderId); // Note sender/receiver flipped
        if (pendingIncoming) {
            return res.status(409).json({ message: 'This user has already sent you a contact request. Please accept it from your requests list.' });
        }

        // Verify both users exist
        const userExistsStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
        const sender = userExistsStmt.get(senderId);
        const receiver = userExistsStmt.get(receiverId);

        if (!sender || !receiver) {
            return res.status(404).json({ message: 'One or both users not found.' });
        }

        // If no existing contact or pending request, create a new pending request
        const insertRequestStmt = db.prepare('INSERT INTO contact_requests (senderId, receiverId, status) VALUES (?, ?, \'pending\')');
        const info = insertRequestStmt.run(senderId, receiverId);

        // Create notification for the receiver
        createNotification({
            userId: receiverId,
            type: 'contact_request',
            sourceId: info.lastInsertRowid, // The ID of the contact request
            senderId: senderId
        });

        res.status(201).json({ message: 'Contact request sent successfully!', requestId: info.lastInsertRowid });
    } catch (error) {
        console.error('Error sending contact request:', error);
        res.status(500).json({ message: 'Server error sending contact request.' });
    }
});

// MODIFIED API: Get contacts for a specific user (only accepted mutual contacts)
router.get('/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        // Fetch all contacts where the requesting user is the userId
        // Since mutual contacts will have two entries (userA -> userB, userB -> userA)
        // this query will automatically list all mutual contacts for the user.
        const stmt = db.prepare(`
            SELECT u.id, u.name, u.email, u.bio, u.profilePictureUrl
            FROM contacts c
            JOIN users u ON c.contactId = u.id
            WHERE c.userId = ?
        `);
        const contacts = stmt.all(userId);
        res.json(contacts);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Server error fetching contacts.' });
    }
});

// MODIFIED API: Remove a contact
// Now, removing a mutual contact requires deleting two entries
router.delete('/:contactId', (req, res) => {
    const contactToDeleteId = parseInt(req.params.contactId); // This is the ID of the user to remove from contacts
    const { userId } = req.body; // The user who is performing the deletion

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to remove a contact.' });
    }

    try {
        // Delete both sides of the mutual contact relationship
        const stmt = db.prepare('DELETE FROM contacts WHERE (userId = ? AND contactId = ?) OR (userId = ? AND contactId = ?)');
        const info = stmt.run(userId, contactToDeleteId, contactToDeleteId, userId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Contact not found or you are not authorized to remove this contact.' });
        }

        res.json({ message: 'Contact removed successfully!' });
    } catch (error) {
        console.error('Error removing contact:', error);
        res.status(500).json({ message: 'Server error removing contact.' });
    }
});

// NEW API: Get pending incoming contact requests for a user
router.get('/incoming/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        const stmt = db.prepare(`
            SELECT
                cr.id AS requestId,
                cr.senderId,
                u.name AS senderName,
                u.email AS senderEmail,
                u.profilePictureUrl AS senderProfilePictureUrl,
                cr.createdAt
            FROM contact_requests cr
            JOIN users u ON cr.senderId = u.id
            WHERE cr.receiverId = ? AND cr.status = 'pending'
            ORDER BY cr.createdAt DESC
        `);
        const requests = stmt.all(userId);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching incoming contact requests:', error);
        res.status(500).json({ message: 'Server error fetching incoming contact requests.' });
    }
});

// NEW API: Get pending outgoing contact requests for a user
router.get('/outgoing/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        const stmt = db.prepare(`
            SELECT
                cr.id AS requestId,
                cr.receiverId,
                u.name AS receiverName,
                u.email AS receiverEmail,
                u.profilePictureUrl AS receiverProfilePictureUrl,
                cr.createdAt
            FROM contact_requests cr
            JOIN users u ON cr.receiverId = u.id
            WHERE cr.senderId = ? AND cr.status = 'pending'
            ORDER BY cr.createdAt DESC
        `);
        const requests = stmt.all(userId);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching outgoing contact requests:', error);
        res.status(500).json({ message: 'Server error fetching outgoing contact requests.' });
    }
});

// NEW API: Accept a contact request
router.put('/:requestId/accept', (req, res) => {
    const requestId = parseInt(req.params.requestId);
    const { userId } = req.body; // The user who is accepting (should be receiverId)

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to accept request.' });
    }

    try {
        const getRequestStmt = db.prepare('SELECT senderId, receiverId, status FROM contact_requests WHERE id = ?');
        const request = getRequestStmt.get(requestId);

        if (!request) {
            return res.status(404).json({ message: 'Contact request not found.' });
        }
        if (request.receiverId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only accept requests sent to you.' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Request is not pending.' });
        }

        // Get sender's name for notification
        const getSenderNameStmt = db.prepare('SELECT name FROM users WHERE id = ?');
        const sender = getSenderNameStmt.get(request.senderId);

        // Start a transaction for atomicity
        db.transaction(() => {
            // 1. Update request status
            const updateRequestStmt = db.prepare('UPDATE contact_requests SET status = \'accepted\' WHERE id = ?');
            updateRequestStmt.run(requestId);

            // 2. Add both users to each other's contact lists
            const insertContactStmt = db.prepare('INSERT OR IGNORE INTO contacts (userId, contactId) VALUES (?, ?)');
            insertContactStmt.run(request.senderId, request.receiverId);
            insertContactStmt.run(request.receiverId, request.senderId); // Mutual entry

            // Create notification for the sender that their request was accepted
            createNotification({
                userId: request.senderId,
                type: 'contact_accepted',
                sourceId: requestId, // The ID of the contact request
                senderId: request.receiverId
            });

        })(); // Immediately invoke the transaction

        res.json({ message: 'Contact request accepted and contact added!' });
    } catch (error) {
        console.error('Error accepting contact request:', error);
        res.status(500).json({ message: 'Server error accepting contact request.' });
    }
});

// NEW API: Reject a contact request
router.put('/:requestId/reject', (req, res) => {
    const requestId = parseInt(req.params.requestId);
    const { userId } = req.body; // The user who is rejecting (should be receiverId)

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to reject request.' });
    }

    try {
        const getRequestStmt = db.prepare('SELECT receiverId, status FROM contact_requests WHERE id = ?');
        const request = getRequestStmt.get(requestId);

        if (!request) {
            return res.status(404).json({ message: 'Contact request not found.' });
        }
        if (request.receiverId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only reject requests sent to you.' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Request is not pending.' });
        }

        // Delete the request
        const deleteRequestStmt = db.prepare('DELETE FROM contact_requests WHERE id = ?');
        const info = deleteRequestStmt.run(requestId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Request not found or not deleted.' });
        }

        res.json({ message: 'Contact request rejected.' });
    } catch (error) {
            console.error('Error rejecting contact request:', error);
            res.status(500).json({ message: 'Server error rejecting contact request.' });
    }
});

module.exports = router;