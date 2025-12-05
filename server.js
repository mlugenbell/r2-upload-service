const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Configure multer for temporary file storage
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Helper function to get audio duration using ffprobe
async function getAudioDuration(filePath) {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return null;
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'R2 upload service running',
    endpoints: ['/upload-audio', '/upload-video']
  });
});

// Audio upload endpoint
app.post('/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log('Audio upload request received');
    console.log('File received:', req.file.filename);

    // Get audio duration using ffprobe
    const duration = await getAudioDuration(req.file.path);
    console.log('Audio duration:', duration, 'seconds');

    // Read the file
    const fileContent = await fs.readFile(req.file.path);
