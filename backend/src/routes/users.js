// backend/src/routes/users.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../database/db'); // CHANGED: Destructured db from the import
const { uploadProfilePicture } = require('../middleware/upload'); // CHANGED: Import uploadProfilePicture directly

const router = express.Router();

// API endpoint to update user profile (handles file upload)
router.put('/profile/:id', uploadProfilePicture.single('profilePicture'), (req, res) => { // CHANGED: Use uploadProfilePicture.single
    const userId = parseInt(req.params.id);
    const { bio } = req.body;

    const profilePicturePath = req.file ? `/uploads/profile_pictures/${req.file.filename}` : undefined;

    if (typeof bio === 'undefined') {
        return res.status(400).json({ message: 'Bio is required.' });
    }

    try {
        const currentUserStmt = db.prepare('SELECT profilePictureUrl FROM users WHERE id = ?');
        const currentUser = currentUserStmt.get(userId);

        if (!currentUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        let newProfilePictureUrl = currentUser.profilePictureUrl;
        if (profilePicturePath !== undefined) {
            newProfilePictureUrl = profilePicturePath;

            if (currentUser.profilePictureUrl && currentUser.profilePictureUrl.startsWith('/uploads/profile_pictures/')) {
                const oldFilePath = path.join(__dirname, '..', '..', currentUser.profilePictureUrl); // Adjust path as needed
                fs.unlink(oldFilePath, (err) => {
                    if (err) console.error('Error deleting old profile picture:', oldFilePath, err);
                    else console.log('Old profile picture deleted:', oldFilePath);
                });
            }
        }

        const stmt = db.prepare('UPDATE users SET bio = ?, profilePictureUrl = ? WHERE id = ?');
        const info = stmt.run(bio, newProfilePictureUrl, userId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'User not found or no changes made to profile.' });
        }

        const updatedUserStmt = db.prepare('SELECT id, name, email, bio, profilePictureUrl FROM users WHERE id = ?');
        const updatedUser = updatedUserStmt.get(userId);

        res.json({ message: 'Profile updated successfully!', user: updatedUser });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error updating profile.' });
    }
});

// API: Search for users by name or email
router.get('/search', (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ message: 'Search query is required.' });
    }

    const searchQuery = `%${query.toLowerCase()}%`; // Case-insensitive partial match

    try {
        const stmt = db.prepare(`
            SELECT id, name, email, bio, profilePictureUrl
            FROM users
            WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?
        `);
        const users = stmt.all(searchQuery, searchQuery);

        const filteredUsers = users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            bio: user.bio,
            profilePictureUrl: user.profilePictureUrl
        }));

        res.json(filteredUsers);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Server error during user search.' });
    }
});

module.exports = router;