// backend/src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer storage configuration for profile pictures
const profilePicturesDir = path.join(__dirname, '..', '..', 'uploads', 'profile_pictures'); // Adjust path as needed
if (!fs.existsSync(profilePicturesDir)) {
    fs.mkdirSync(profilePicturesDir, { recursive: true });
}

const profilePictureStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profilePicturesDir); // Files will be saved in backend/uploads/profile_pictures/
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

const uploadProfilePicture = multer({
    storage: profilePictureStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB file size limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for profile pictures!'), false);
        }
    }
});


// Multer storage configuration for dealroom documents
const dealroomDocumentsDir = path.join(__dirname, '..', '..', 'uploads', 'dealroom_documents'); // New directory for dealroom documents
if (!fs.existsSync(dealroomDocumentsDir)) {
    fs.mkdirSync(dealroomDocumentsDir, { recursive: true });
}

const dealroomDocumentStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dealroomDocumentsDir); // Files will be saved in backend/uploads/dealroom_documents/
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
    }
});

const uploadDealroomDocument = multer({
    storage: dealroomDocumentStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB file size limit for documents
    fileFilter: (req, file, cb) => {
        // Allow common document types (PDF, Word, TXT, images, etc.)
        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, Word, TXT, image or spreadsheet files are allowed for dealroom documents!'), false);
        }
    }
});

module.exports = { 
    uploadProfilePicture, 
    uploadDealroomDocument 
};