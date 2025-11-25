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
    
    // Generate R2 key
    const fileKey = `audio/${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(req.file.originalname)}`;
    
    console.log('Uploading to R2 as:', fileKey);

    // Upload to R2
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: fileContent,
      ContentType: req.file.mimetype || 'audio/mpeg',
    }));

    // Clean up temp file
    await fs.unlink(req.file.path);

    // Construct public URL
    const publicUrl = `https://pub-82d37aadf5584663b80fc64f54a49180.r2.dev/${fileKey}`;

    console.log('Upload successful. URL:', publicUrl);

    res.json({
      success: true,
      url: publicUrl,
      audio_url: publicUrl, // Alias for compatibility
      filename: fileKey,
      size: req.file.size,
      duration: duration // THIS IS THE KEY ADDITION!
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up temp file if it exists
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up temp file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// Video upload endpoint (no duration needed for video)
app.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    console.log('Video upload request received');
    console.log('File received:', req.file.filename);

    // Read the file
    const fileContent = await fs.readFile(req.file.path);
    
    // Generate R2 key
    const fileKey = `video/${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(req.file.originalname)}`;
    
    console.log('Uploading to R2 as:', fileKey);

    // Upload to R2
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: fileContent,
      ContentType: req.file.mimetype || 'video/mp4',
    }));

    // Clean up temp file
    await fs.unlink(req.file.path);

    // Construct public URL
    const publicUrl = `https://pub-82d37aadf5584663b80fc64f54a49180.r2.dev/${fileKey}`;

    console.log('Upload successful. URL:', publicUrl);

    res.json({
      success: true,
      url: publicUrl,
      filename: fileKey,
      size: req.file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up temp file if it exists
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up temp file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`R2 upload service running on port ${PORT}`);
});
