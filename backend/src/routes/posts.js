// backend/src/routes/posts.js
const express = require('express');
const { db } = require('../database/db');
const { createNotification } = require('../utils/notifications'); // NEW: Import createNotification

const router = express.Router();

// API endpoint to get all posts (now also fetches comment count)
router.get('/', (req, res) => {
    try {
        const getPostsStmt = db.prepare('SELECT * FROM posts ORDER BY timestamp DESC');
        const posts = getPostsStmt.all();

        // For each post, get its comment count
        const getCommentCountStmt = db.prepare('SELECT COUNT(*) AS count FROM comments WHERE postId = ?');
        const postsWithCounts = posts.map(post => {
            const commentCountResult = getCommentCountStmt.get(post.id);
            return { ...post, commentCount: commentCountResult.count };
        });

        res.json(postsWithCounts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ message: 'Server error fetching posts.' });
    }
});

// API endpoint to create a new post
router.post('/', (req, res) => {
    const { content, author, authorId } = req.body;
    if (!content || !author || !authorId) {
        return res.status(400).json({ message: 'Post content, author, and authorId are required.' });
    }

    try {
        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO posts (authorId, author, content, timestamp) VALUES (?, ?, ?, ?)');
        const info = stmt.run(authorId, author, content, timestamp);

        const newPost = { id: info.lastInsertRowid, authorId, author, content, timestamp, commentCount: 0 };
        res.status(201).json({ message: 'Post created successfully!', post: newPost });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ message: 'Server error creating post.' });
    }
});

// API endpoint to update a post (PUT)
router.put('/:id', (req, res) => {
    const postId = req.params.id;
    const { content, userId } = req.body;

    if (!content || !userId) {
        return res.status(400).json({ message: 'New content and user ID are required.' });
    }

    try {
        const getPostStmt = db.prepare('SELECT authorId FROM posts WHERE id = ?');
        const post = getPostStmt.get(postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        if (post.authorId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only edit your own posts.' });
        }

        const updateStmt = db.prepare('UPDATE posts SET content = ? WHERE id = ?');
        const info = updateStmt.run(content, postId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Post not found or no changes made.' });
        }

        res.json({ message: 'Post updated successfully!' });
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ message: 'Server error updating post.' });
    }
});

// API endpoint to delete a post (DELETE)
router.delete('/:id', (req, res) => {
    const postId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required for deletion.' });
    }

    try {
        const getPostStmt = db.prepare('SELECT authorId FROM posts WHERE id = ?');
        const post = getPostStmt.get(postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        if (post.authorId !== userId) {
            return res.status(403).json({ message: 'Unauthorized: You can only delete your own posts.' });
        }

        const deleteStmt = db.prepare('DELETE FROM posts WHERE id = ?');
        const info = deleteStmt.run(postId);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        res.json({ message: 'Post deleted successfully!' });
    } catch (error) {
            console.error('Error deleting post:', error);
            res.status(500).json({ message: 'Server error deleting post.' });
    }
});

// API endpoint to get comments for a specific post
router.get('/:postId/comments', (req, res) => {
    const postId = req.params.postId;
    try {
        const stmt = db.prepare('SELECT * FROM comments WHERE postId = ? ORDER BY timestamp ASC');
        const comments = stmt.all(postId);
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Server error fetching comments.' });
    }
});

// API endpoint to add a comment to a specific post
router.post('/:postId/comments', (req, res) => {
    const postId = req.params.postId;
    const { content, author, authorId } = req.body;

    if (!content || !author || !authorId) {
        return res.status(400).json({ message: 'Comment content, author, and authorId are required.' });
    }

    try {
        const timestamp = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO comments (postId, authorId, author, content, timestamp) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(postId, authorId, author, content, timestamp);

        const newComment = { id: info.lastInsertRowid, postId, authorId, author, content, timestamp };

        // NEW: Create notification for the post author if it's not their own comment
        const getPostAuthorStmt = db.prepare('SELECT authorId FROM posts WHERE id = ?');
        const post = getPostAuthorStmt.get(postId);

        if (post && post.authorId !== authorId) { // Only notify if a different user comments
            createNotification({
                userId: post.authorId,
                type: 'comment_on_post',
                sourceId: newComment.id, // The ID of the new comment
                senderId: authorId // The ID of the comment author
            });
        }

        res.status(201).json({ message: 'Comment added successfully!', comment: newComment });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Server error adding comment.' });
    }
});

module.exports = router;