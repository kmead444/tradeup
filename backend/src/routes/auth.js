// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database/db'); // CHANGED: Destructured db from the import

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO users (name, email, password, bio, profilePictureUrl) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(name, email.trim().toLowerCase(), hashedPassword, '', '');

        const newUser = { id: info.lastInsertRowid, name, email: email.trim().toLowerCase(), bio: '', profilePictureUrl: '' };
        res.status(201).json({ message: 'Account created!', user: newUser });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        const user = stmt.get(email.trim().toLowerCase());

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Check if user.password is a valid string before comparison
        if (typeof user.password !== 'string' || user.password.length === 0) {
            console.error(`User ${user.email} has an invalid or empty password hash.`);
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const userForFrontend = {
            id: user.id,
            name: user.name,
            email: user.email,
            bio: user.bio,
            profilePictureUrl: user.profilePictureUrl
        };
        res.json({ message: 'Login successful!', user: userForFrontend });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;