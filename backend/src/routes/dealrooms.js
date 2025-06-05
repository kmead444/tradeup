// backend/src/routes/dealrooms.js
const express = require('express');
const { db } = require('../database/db');
const { createNotification } = require('../utils/notifications'); // Import createNotification
const { uploadDealroomDocument } = require('../middleware/upload'); // NEW: Import upload middleware for documents
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Helper to simulate external API verification
// In a real application, this would be an actual API call.
async function simulateExternalVerification(filePath, fileName, uploaderId) {
    return new Promise(resolve => {
        setTimeout(() => {
            const isVerified = Math.random() > 0.5; // Simulate a 50% chance of verification
            if (isVerified) {
                resolve({ status: 'verified', message: 'Document successfully verified by external API.' });
            } else {
                resolve({ status: 'flagged', message: 'Document flagged for manual review. Possible issues detected.' });
            }
        }, 1000); // Simulate network latency
    });
}

// MODIFIED API: Create a new dealroom (now assigns buyer/seller and initial stage)
router.post('/', async (req, res) => {
    const { creatorId, invitedContactId } = req.body;

    if (!creatorId || !invitedContactId) {
        return res.status(400).json({ message: 'Creator ID and invited contact ID are required.' });
    }
    if (creatorId === invitedContactId) {
        return res.status(400).json({ message: 'Cannot create a dealroom with yourself.' });
    }

    try {
        // 1. Verify invitedContactId is actually a contact of creatorId
        const isContactStmt = db.prepare('SELECT id FROM contacts WHERE userId = ? AND contactId = ?');
        const isContact = isContactStmt.get(creatorId, invitedContactId);
        if (!isContact) {
            return res.status(403).json({ message: 'You can only invite users from your contacts list.' });
        }

        // Get invited contact's details for dealroom title and invite creation
        const getInvitedContactStmt = db.prepare('SELECT name, email FROM users WHERE id = ?');
        const invitedContact = getInvitedContactStmt.get(invitedContactId);
        if (!invitedContact) {
            return res.status(404).json({ message: 'Invited contact user not found.' });
        }

        // Determine buyer and seller (arbitrarily assign creator as buyer, invited as seller, or vice-versa)
        // For simplicity, let's say the creator is the buyer and the invited person is the seller.
        // This can be made configurable later if needed.
        const buyerId = creatorId;
        const sellerId = invitedContactId;

        // Check if an active dealroom already exists between these two users
        // This checks if both buyerId and sellerId are participants in the same active dealRoomId
        const checkExistingDealroomStmt = db.prepare(`
            SELECT dp1.dealroomId
            FROM dealroom_participants dp1
            JOIN dealroom_participants dp2 ON dp1.dealroomId = dp2.dealroomId
            JOIN dealrooms dr ON dp1.dealroomId = dr.id
            WHERE dp1.userId = ? AND dp2.userId = ? AND dr.isActive = 1;
        `);
        // Check both permutations for uniqueness
        const existingDealroom = checkExistingDealroomStmt.get(buyerId, sellerId) || checkExistingDealroomStmt.get(sellerId, buyerId);

        if (existingDealroom) {
            return res.status(409).json({ message: 'An active dealroom with this contact already exists.' });
        }

        // Check if a pending invite already exists between these two users
        const checkPendingInviteBetweenUsersStmt = db.prepare(`
            SELECT di.id FROM dealroom_invites di
            WHERE ((di.senderId = ? AND di.receiverId = ?) OR (di.senderId = ? AND di.receiverId = ?)) AND di.status = 'pending'
        `);
        const pendingInvite = checkPendingInviteBetweenUsersStmt.get(creatorId, invitedContactId, invitedContactId, creatorId);
        if (pendingInvite) {
            return res.status(409).json({ message: 'A pending dealroom invite to this contact already exists from you or to you.' });
        }


        // Get creator's name for dealroom title
        const getCreatorNameStmt = db.prepare('SELECT name FROM users WHERE id = ?');
        const creator = getCreatorNameStmt.get(creatorId);
        const creatorName = creator ? creator.name : 'Unknown User';

        let newDealroomId;
        // Start a transaction for atomicity
        db.transaction(() => {
            // 1. Create the new dealroom with initial stage and buyer/seller IDs
            const insertDealroomStmt = db.prepare('INSERT INTO dealrooms (title, creatorId, isActive, stage, buyerId, sellerId) VALUES (?, ?, 1, ?, ?, ?)');
            const dealroomInfo = insertDealroomStmt.run(`Deal: ${creatorName} & ${invitedContact.name}`, creatorId, 'stage_0', buyerId, sellerId);
            newDealroomId = dealroomInfo.lastInsertRowid;

            // 2. Add both creator and invited contact as participants
            const insertCreatorParticipantStmt = db.prepare('INSERT INTO dealroom_participants (dealroomId, userId) VALUES (?, ?)');
            insertCreatorParticipantStmt.run(newDealroomId, creatorId);
            insertCreatorParticipantStmt.run(newDealroomId, invitedContactId); // Also add the invited user

            // 3. Create a pending invite for the invited contact
            const insertInviteStmt = db.prepare('INSERT INTO dealroom_invites (dealroomId, senderId, receiverId, status) VALUES (?, ?, ?, \'pending\')');
            const inviteInfo = insertInviteStmt.run(newDealroomId, creatorId, invitedContactId);
            const newInviteId = inviteInfo.lastInsertRowid;

            // Create notification for the invited contact
            createNotification({
                userId: invitedContactId,
                type: 'dealroom_invite',
                sourceId: newInviteId, // The ID of the newly created invite
                senderId: creatorId
            });

        })(); // Immediately invoke the transaction

        res.status(201).json({ message: 'Dealroom invite sent successfully!', dealroomId: newDealroomId });
    } catch (error) {
        console.error('Error creating dealroom/sending invite:', error);
        // Specific error for UNIQUE constraint on dealroom_invites if it happens
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A pending invite to this dealroom already exists for this contact.' });
        }
        res.status(500).json({ message: 'Server error creating dealroom or sending invite.' });
    }
});

// NEW API: Get full dealroom details for a specific user
router.get('/:dealroomId/details/:userId', (req, res) => {
    const dealroomId = parseInt(req.params.dealroomId);
    const userId = parseInt(req.params.userId);

    try {
        // Fetch dealroom basic details
        const dealroomStmt = db.prepare(`
            SELECT
                dr.id, dr.title, dr.creatorId, dr.createdAt, dr.isActive, dr.stage,
                dr.buyerId, dr.sellerId, dr.buyerReady, dr.sellerReady, dr.contractDetails,
                dr.finalGreenLight,
                u_buyer.name AS buyerName, u_buyer.email AS buyerEmail,
                u_seller.name AS sellerName, u_seller.email AS sellerEmail
            FROM dealrooms dr
            LEFT JOIN users u_buyer ON dr.buyerId = u_buyer.id
            LEFT JOIN users u_seller ON dr.sellerId = u_seller.id
            WHERE dr.id = ?
        `);
        const dealroom = dealroomStmt.get(dealroomId);

        if (!dealroom) {
            return res.status(404).json({ message: 'Dealroom not found.' });
        }

        // Verify user is a participant
        const participantStmt = db.prepare('SELECT 1 FROM dealroom_participants WHERE dealroomId = ? AND userId = ?');
        const isParticipant = participantStmt.get(dealroomId, userId);
        if (!isParticipant) {
            return res.status(403).json({ message: 'Unauthorized: You are not a participant in this dealroom.' });
        }

        // Determine document visibility based on stage and owner
        let docVisibilityCondition = '';
        if (dealroom.stage === 'stage_0') {
            // In stage 0, only uploader can see their own private documents
            docVisibilityCondition = `(dd.isVisibleToAll = 0 AND dd.uploaderId = ${userId})`;
        } else {
            // In stage 1 and above, all documents are visible to all parties
            docVisibilityCondition = `(dd.isVisibleToAll = 1 OR dd.uploaderId = ${userId})`; // Also show private docs to owner if stage is higher
        }

        // Fetch documents for this dealroom based on visibility rules
        const documentsStmt = db.prepare(`
            SELECT
                dd.id, dd.dealroomId, dd.uploaderId, dd.fileName, dd.filePath, dd.uploadedAt,
                dd.isVisibleToAll, dd.verificationStatus, dd.verificationResponse,
                u.name AS uploaderName, u.profilePictureUrl AS uploaderProfilePictureUrl
            FROM dealroom_documents dd
            LEFT JOIN users u ON dd.uploaderId = u.id
            WHERE dd.dealroomId = ? AND (${docVisibilityCondition})
            ORDER BY dd.uploadedAt ASC
        `);
        const documents = documentsStmt.all(dealroomId);

        // Fetch messages for this dealroom
        const messagesStmt = db.prepare(`
            SELECT
                m.id, m.senderId, m.content, m.timestamp,
                u.name AS senderName, u.profilePictureUrl AS senderProfilePictureUrl
            FROM messages m
            LEFT JOIN users u ON m.senderId = u.id
            WHERE m.dealroomId = ?
            ORDER BY m.timestamp ASC
        `);
        const messages = messagesStmt.all(dealroomId);

        res.json({
            dealroom: {
                id: dealroom.id,
                title: dealroom.title,
                creatorId: dealroom.creatorId,
                createdAt: dealroom.createdAt,
                isActive: dealroom.isActive,
                stage: dealroom.stage,
                buyerId: dealroom.buyerId,
                sellerId: dealroom.sellerId,
                buyerName: dealroom.buyerName,
                buyerEmail: dealroom.buyerEmail,
                sellerName: dealroom.sellerName,
                sellerEmail: dealroom.sellerEmail,
                buyerReady: dealroom.buyerReady,
                sellerReady: dealroom.sellerReady,
                contractDetails: JSON.parse(dealroom.contractDetails || '{}'),
                finalGreenLight: dealroom.finalGreenLight
            },
            documents: documents,
            messages: messages
        });

    } catch (error) {
        console.error('Error fetching dealroom details:', error);
        res.status(500).json({ message: 'Server error fetching dealroom details.' });
    }
});


// NEW API: Upload a document to a dealroom
router.post('/:dealroomId/documents/upload', uploadDealroomDocument.single('dealroomDocument'), async (req, res) => {
    const dealroomId = parseInt(req.params.dealroomId);
    const uploaderId = parseInt(req.body.uploaderId); // Ensure uploaderId is sent in form data

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    if (!uploaderId) {
        return res.status(400).json({ message: 'Uploader ID is required.' });
    }

    const filePath = `/uploads/dealroom_documents/${req.file.filename}`;
    const fileName = req.file.originalname;

    try {
        // Verify uploader is a participant of the dealroom
        const isParticipantStmt = db.prepare('SELECT 1 FROM dealroom_participants WHERE dealroomId = ? AND userId = ?');
        const isParticipant = isParticipantStmt.get(dealroomId, uploaderId);
        if (!isParticipant) {
            // Delete the uploaded file if user is not a participant
            fs.unlink(path.join(__dirname, '..', '..', filePath), (err) => {
                if (err) console.error('Error deleting unauthorized file:', err);
            });
            return res.status(403).json({ message: 'Unauthorized: You are not a participant in this dealroom.' });
        }

        // Determine visibility based on current deal stage
        const dealroomStageStmt = db.prepare('SELECT stage FROM dealrooms WHERE id = ?');
        const dealroom = dealroomStageStmt.get(dealroomId);

        let isVisibleToAll = 0; // Default to private
        if (dealroom && dealroom.stage !== 'stage_0') { // Documents uploaded in stage 1 and above are visible to all
            isVisibleToAll = 1;
        }

        // Simulate external API verification
        const verificationResult = await simulateExternalVerification(filePath, fileName, uploaderId);

        const insertDocStmt = db.prepare(`
            INSERT INTO dealroom_documents (dealroomId, uploaderId, fileName, filePath, isVisibleToAll, verificationStatus, verificationResponse)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = insertDocStmt.run(dealroomId, uploaderId, fileName, filePath, isVisibleToAll, verificationResult.status, JSON.stringify(verificationResult));

        res.status(201).json({
            message: 'Document uploaded and sent for verification!',
            document: {
                id: info.lastInsertRowid,
                dealroomId,
                uploaderId,
                fileName,
                filePath,
                isVisibleToAll,
                verificationStatus: verificationResult.status,
                verificationResponse: verificationResult.message // Send message to frontend
            }
        });

    } catch (error) {
        console.error('Error uploading dealroom document:', error);
        // Clean up uploaded file if an error occurred during DB insertion or verification simulation
        if (req.file) {
            fs.unlink(path.join(__dirname, '..', '..', filePath), (err) => {
                if (err) console.error('Error deleting failed upload file:', err);
            });
        }
        res.status(500).json({ message: 'Server error uploading document.' });
    }
});


// NEW API: Update deal stage and participant readiness
router.put('/:dealroomId/stage/advance', async (req, res) => {
    const dealroomId = parseInt(req.params.dealroomId);
    const { userId, action, contractData } = req.body; // action can be 'ready', 'build_contract', 'agree_contract', 'load_money', 'final_green_light'

    if (!userId || !action) {
        return res.status(400).json({ message: 'User ID and action are required.' });
    }

    try {
        const dealroomStmt = db.prepare('SELECT id, stage, buyerId, sellerId, buyerReady, sellerReady FROM dealrooms WHERE id = ?');
        const dealroom = dealroomStmt.get(dealroomId);

        if (!dealroom) {
            return res.status(404).json({ message: 'Dealroom not found.' });
        }

        const isBuyer = dealroom.buyerId === userId;
        const isSeller = dealroom.sellerId === userId;

        if (!isBuyer && !isSeller) {
            return res.status(403).json({ message: 'Unauthorized: You are not a participant in this dealroom.' });
        }

        let updateSql = '';
        let updateParams = [];
        let newStage = dealroom.stage;
        let message = '';

        db.transaction(() => { // Use a transaction for multi-step updates
            switch (dealroom.stage) {
                case 'stage_0': // Pre-stage 1: Document upload and verification
                    if (action === 'ready') {
                        if (isBuyer) updateSql = 'UPDATE dealrooms SET buyerReady = 1 WHERE id = ?';
                        if (isSeller) updateSql = 'UPDATE dealrooms SET sellerReady = 1 WHERE id = ?';
                        updateParams = [dealroomId];
                        db.prepare(updateSql).run(...updateParams);
                        
                        const updatedDealroom = dealroomStmt.get(dealroomId); // Fetch updated state
                        if (updatedDealroom.buyerReady && updatedDealroom.sellerReady) {
                            // Check if both parties have uploaded their initial docs and they are verified
                            // This part of the logic might be problematic if 'verified' is not guaranteed, or if not all docs are considered.
                            // Assuming for now that "has uploaded initial docs" means *at least one* verified private document.
                            const buyerDocsVerified = db.prepare(`SELECT COUNT(*) FROM dealroom_documents WHERE dealroomId = ? AND uploaderId = ? AND isVisibleToAll = 0 AND verificationStatus = 'verified'`).get(dealroomId, dealroom.buyerId)['COUNT(*)'] > 0;
                            const sellerDocsVerified = db.prepare(`SELECT COUNT(*) FROM dealroom_documents WHERE dealroomId = ? AND uploaderId = ? AND isVisibleToAll = 0 AND verificationStatus = 'verified'`).get(dealroomId, dealroom.sellerId)['COUNT(*)'] > 0;

                            if (buyerDocsVerified && sellerDocsVerified) {
                                newStage = 'stage_1';
                                db.prepare('UPDATE dealrooms SET stage = ?, buyerReady = 0, sellerReady = 0 WHERE id = ?').run(newStage, dealroomId);
                                message = `Dealroom moved to Stage 1: Negotiation.`;
                            } else {
                                message = 'Both parties are ready, but initial documents are not yet uploaded or verified.';
                            }
                        } else {
                            message = isBuyer ? 'Buyer marked ready.' : 'Seller marked ready.';
                        }
                    } else if (action === 'upload_doc_private') {
                        // Document upload handled by separate /documents/upload endpoint
                        message = 'Document upload initiated (private).';
                    } else {
                        return res.status(400).json({ message: `Invalid action "${action}" for stage ${dealroom.stage}.` });
                    }
                    break;

                case 'stage_1': // Negotiation stage
                    if (action === 'ready') {
                        if (isBuyer) updateSql = 'UPDATE dealrooms SET buyerReady = 1 WHERE id = ?';
                        if (isSeller) updateSql = 'UPDATE dealrooms SET sellerReady = 1 WHERE id = ?';
                        updateParams = [dealroomId];
                        db.prepare(updateSql).run(...updateParams);

                        const updatedDealroom = dealroomStmt.get(dealroomId);
                        if (updatedDealroom.buyerReady && updatedDealroom.sellerReady) {
                            newStage = 'stage_2';
                            db.prepare('UPDATE dealrooms SET stage = ?, buyerReady = 0, sellerReady = 0 WHERE id = ?').run(newStage, dealroomId);
                            message = `Dealroom moved to Stage 2: Contract Building & Wallet Setup.`;
                        } else {
                            message = isBuyer ? 'Buyer marked ready to move to Stage 2.' : 'Seller marked ready to move to Stage 2.';
                        }
                    } else if (action === 'upload_doc_public') {
                        // Document upload handled by separate /documents/upload endpoint (isVisibleToAll will be 1)
                        message = 'Document upload initiated (public).';
                    } else {
                        return res.status(400).json({ message: `Invalid action "${action}" for stage ${dealroom.stage}.` });
                    }
                    break;

                case 'stage_2': // Contract Building & Wallet Setup
                    if (isBuyer && action === 'build_contract' && contractData) {
                        newStage = 'stage_2'; // Stay in stage 2, waiting for seller review
                        db.prepare('UPDATE dealrooms SET contractDetails = ?, buyerReady = 1, sellerReady = 0 WHERE id = ?').run(JSON.stringify(contractData), dealroomId);
                        message = 'Buyer has built the smart contract. Waiting for seller review.';
                    } else if (isSeller && action === 'agree_contract') {
                        const currentContract = JSON.parse(dealroom.contractDetails || '{}');
                        if (!currentContract || Object.keys(currentContract).length === 0) {
                            return res.status(400).json({ message: 'Buyer must build the contract first.' });
                        }
                        newStage = 'stage_3';
                        db.prepare('UPDATE dealrooms SET stage = ?, sellerReady = 1 WHERE id = ?').run(newStage, dealroomId);
                        message = 'Seller has agreed to the contract. Dealroom moved to Stage 3: Funding & Execution.';
                    } else {
                        return res.status(400).json({ message: `Invalid action "${action}" for stage ${dealroom.stage}.` });
                    }
                    break;

                case 'stage_3': // Funding & Execution
                    if (isBuyer && action === 'load_money') {
                        // Simulate loading money and on-ramping to USDC
                        // In real life, this would involve integrating with payment gateways/crypto exchanges
                        message = 'Buyer has loaded money and on-ramped to USDC (simulated).';
                    } else if (action === 'final_green_light') {
                        if (isBuyer) updateSql = 'UPDATE dealrooms SET buyerReady = 1 WHERE id = ?';
                        if (isSeller) updateSql = 'UPDATE dealrooms SET sellerReady = 1 WHERE id = ?';
                        updateParams = [dealroomId];
                        db.prepare(updateSql).run(...updateParams);

                        const updatedDealroom = dealroomStmt.get(dealroomId);
                        if (updatedDealroom.buyerReady && updatedDealroom.sellerReady && updatedDealroom.finalGreenLight) {
                             // Check if conditions from contract are met (simulated)
                            const contract = JSON.parse(dealroom.contractDetails || '{}');
                            const conditionsMet = contract.conditionsMet; // Assuming contractData has a boolean field 'conditionsMet'
                            if (conditionsMet) {
                                newStage = 'closed';
                                db.prepare('UPDATE dealrooms SET stage = ?, isActive = 0 WHERE id = ?').run(newStage, dealroomId);
                                // Simulate off-ramping money
                                message = `Deal Closed! Money off-ramped to seller (simulated).`;
                            } else {
                                message = 'Contract conditions are not yet met.';
                            }
                        } else {
                             message = isBuyer ? 'Buyer gave final green light.' : 'Seller gave final green light.';
                        }
                    } else {
                        return res.status(400).json({ message: `Invalid action "${action}" for stage ${dealroom.stage}.` });
                    }
                    break;

                case 'closed':
                    return res.status(400).json({ message: 'Dealroom is already closed.' });

                default:
                    return res.status(400).json({ message: 'Invalid dealroom stage.' });
            }
             res.json({ message: message || `Dealroom stage updated to ${newStage}.`, newStage: newStage });
        })(); // Execute transaction
    } catch (error) {
        console.error('Error updating dealroom stage:', error);
        res.status(500).json({ message: 'Server error updating dealroom stage.' });
    }
});


// API: Get incoming dealroom invites for a user
router.get('/invites/incoming/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        const stmt = db.prepare(`
            SELECT
                di.id AS inviteId,
                di.dealroomId,
                di.senderId,
                dr.title AS dealroomTitle,
                u.name AS senderName,
                u.email AS senderEmail,
                u.profilePictureUrl AS senderProfilePictureUrl,
                di.createdAt
            FROM dealroom_invites di
            LEFT JOIN dealrooms dr ON di.dealroomId = dr.id
            LEFT JOIN users u ON di.senderId = u.id
            WHERE di.receiverId = ? AND di.status = 'pending'
            ORDER BY di.createdAt DESC
        `);
        const invites = stmt.all(userId);
        res.json(invites);
    } catch (error) {
        console.error('Error fetching incoming dealroom invites:', error);
        res.status(500).json({ message: 'Server error fetching incoming dealroom invites.' });
    }
});

// NEW API: Get outgoing dealroom invites from a user
router.get('/invites/outgoing/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        const stmt = db.prepare(`
            SELECT
                di.id AS inviteId,
                di.dealroomId,
                di.receiverId,
                dr.title AS dealroomTitle,
                u.name AS receiverName,
                u.email AS receiverEmail,
                u.profilePictureUrl AS receiverProfilePictureUrl,
                di.createdAt
            FROM dealroom_invites di
            LEFT JOIN dealrooms dr ON di.dealroomId = dr.id
            LEFT JOIN users u ON di.receiverId = u.id
            WHERE di.senderId = ? AND di.status = 'pending'
            ORDER BY di.createdAt DESC
        `);
        const invites = stmt.all(userId);
        res.json(invites);
    } catch (error) {
        console.error('Error fetching outgoing dealroom invites:', error);
        res.status(500).json({ message: 'Server error fetching outgoing dealroom invites.' });
    }
});

// NEW API: Accept a dealroom invite
router.put('/invites/:inviteId/accept', (req, res) => {
    const inviteId = parseInt(req.params.inviteId);
    const { userId } = req.body; // The user who is accepting (should be receiverId)

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to accept invite.' });
    }

    try {
        const getInviteStmt = db.prepare('SELECT dealroomId, senderId, receiverId, status FROM dealroom_invites WHERE id = ?');
        const invite = getInviteStmt.get(inviteId);

        if (!invite) {
            return res.status(404).json({ message: 'Dealroom invite not found.' });
        }
        if (invite.receiverId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only accept invites sent to you.' });
        }
        if (invite.status !== 'pending') {
            return res.status(400).json({ message: 'Invite is not pending.' });
        }

        // Get sender's name for notification
        const getSenderNameStmt = db.prepare('SELECT name FROM users WHERE id = ?');
        const sender = getSenderNameStmt.get(invite.senderId);

        // Get dealroom title for notification
        const getDealroomTitleStmt = db.prepare('SELECT title FROM dealrooms WHERE id = ?');
        const dealroom = getDealroomTitleStmt.get(invite.dealroomId);


        // Start a transaction for atomicity
        db.transaction(() => {
            // 1. Update invite status
            const updateInviteStmt = db.prepare('UPDATE dealroom_invites SET status = \'accepted\' WHERE id = ?');
            updateInviteStmt.run(inviteId);

            // 2. Add receiver to dealroom_participants (this should already be handled at dealroom creation)
            // This is kept as INSERT OR IGNORE for robustness, in case the participant wasn't added initially
            const insertParticipantStmt = db.prepare('INSERT OR IGNORE INTO dealroom_participants (dealroomId, userId) VALUES (?, ?)');
            insertParticipantStmt.run(invite.dealroomId, invite.receiverId);

            // Create notification for the sender that their invite was accepted
            createNotification({
                userId: invite.senderId,
                type: 'dealroom_accepted',
                sourceId: inviteId, // The ID of the accepted invite
                senderId: invite.receiverId
            });

        })(); // Immediately invoke the transaction

        res.json({ message: 'Dealroom invite accepted! You are now a participant.' });
    } catch (error) {
        console.error('Error accepting dealroom invite:', error);
        res.status(500).json({ message: 'Server error accepting dealroom invite.' });
    }
});

// NEW API: Reject a dealroom invite
router.put('/invites/:inviteId/reject', (req, res) => {
    const inviteId = parseInt(req.params.inviteId);
    const { userId } = req.body; // The user who is rejecting (should be receiverId)

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to reject invite.' });
    }

    try {
        const getInviteStmt = db.prepare('SELECT receiverId, status FROM dealroom_invites WHERE id = ?');
        const invite = getInviteStmt.get(inviteId);

        if (!invite) {
            return res.status(404).json({ message: 'Dealroom invite not found.' });
        }
        if (invite.receiverId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only reject invites sent to you.' });
        }
        if (invite.status !== 'pending') {
            return res.status(400).json({ message: 'Invite is not pending.' });
        }

        // Delete the invite record
        const deleteInviteStmt = db.prepare('DELETE FROM dealroom_invites WHERE id = ?');
        const info = deleteInviteStmt.run(inviteId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Invite not found or not deleted.' });
        }

        res.json({ message: 'Dealroom invite rejected.' });
    } catch (error) {
            console.error('Error rejecting dealroom invite:', error);
            res.status(500).json({ message: 'Server error rejecting dealroom invite.' });
    }
});

// API: Get all dealrooms for a specific user (updated to reflect buyer/seller roles and stage)
router.get('/user/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
        // Select dealroom details and the names/emails of both participants in the dealroom
        // Only show dealrooms where the user is either buyer or seller
        const stmt = db.prepare(`
            SELECT
                dr.id AS dealroomId,
                dr.title,
                dr.stage,
                dr.isActive,
                dr.buyerId,
                COALESCE(u_buyer.name, 'N/A') AS buyerName, -- Use COALESCE for null-safe names
                COALESCE(u_buyer.email, 'N/A') AS buyerEmail,
                dr.sellerId,
                COALESCE(u_seller.name, 'N/A') AS sellerName,
                COALESCE(u_seller.email, 'N/A') AS sellerEmail,
                dr.createdAt
            FROM
                dealrooms dr
            LEFT JOIN
                users u_buyer ON dr.buyerId = u_buyer.id
            LEFT JOIN
                users u_seller ON dr.sellerId = u_seller.id
            WHERE
                dr.isActive = 1 AND (dr.buyerId = ? OR dr.sellerId = ?)
            ORDER BY dr.createdAt DESC
        `);
        const dealrooms = stmt.all(userId, userId); // Pass userId twice for both placeholders

        res.json(dealrooms);
    } catch (error) {
        console.error('Error fetching dealrooms for user:', error);
        res.status(500).json({ message: 'Server error fetching dealrooms.' });
    }
});


module.exports = router;
