import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { protect, adminOnly } from '../middleware/auth.js';
import Blog from '../models/Blog.js';

const router = express.Router();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer – store in memory so we can stream to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Helper: upload buffer to Cloudinary using base64 data URI
const uploadToCloudinary = (file, folder = 'spiritualunitymatch-blogs') =>
  new Promise((resolve, reject) => {
    if (!file || !file.buffer) return reject(new Error('No file provided'));
    console.log(`📤 [Cloudinary] Uploading blog image (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)...`);
    const base64Data = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${base64Data}`;
    cloudinary.uploader.upload(
      dataUri,
      {
        folder,
        transformation: [
          { width: 1400, height: 1400, crop: 'limit' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ],
        timeout: 120000
      },
      (err, result) => {
        if (err) {
          console.error('❌ [Cloudinary] Upload failed:', err);
          return reject(err);
        }
        console.log('✅ [Cloudinary] Blog image uploaded:', result.secure_url);
        resolve(result);
      }
    );
  });

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/blogs  – list published blogs
router.get('/', async (req, res) => {
  try {
    const { category, limit = 12, page = 1 } = req.query;
    const query = { published: true };
    if (category && category !== 'All') query.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const blogs = await Blog.find(query)
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Blog.countDocuments(query);

    res.json({ success: true, blogs, total, page: parseInt(page) });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({ success: false, message: 'Error fetching blogs' });
  }
});

// GET /api/blogs/:slug  – single blog
router.get('/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, blog });
  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({ success: false, message: 'Error fetching blog' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES (protected)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/blogs/admin/all – admin: all blogs including drafts
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, blogs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching blogs' });
  }
});

// POST /api/blogs  – admin: create blog with optional image
router.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { title, excerpt, content, category, author, featured, published, readTime, tags } = req.body;

    let coverImage = { url: '', publicId: '' };
    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      coverImage = { url: result.secure_url, publicId: result.public_id };
    }

    const blog = await Blog.create({
      title,
      excerpt,
      content,
      category,
      author: author || 'Spiritual Unity Match Team',
      featured: featured === 'true' || featured === true,
      published: published !== 'false' && published !== false,
      readTime: readTime || '5 min read',
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [],
      coverImage,
    });

    res.status(201).json({ success: true, blog });
  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error creating blog' });
  }
});

// PUT /api/blogs/:id  – admin: update blog
router.put('/:id', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    const { title, excerpt, content, category, author, featured, published, readTime, tags } = req.body;

    // Handle new image
    if (req.file) {
      // Delete old image if exists
      if (blog.coverImage?.publicId) {
        await cloudinary.uploader.destroy(blog.coverImage.publicId).catch(() => {});
      }
      const result = await uploadToCloudinary(req.file);
      blog.coverImage = { url: result.secure_url, publicId: result.public_id };
    }

    if (title) blog.title = title;
    if (excerpt) blog.excerpt = excerpt;
    if (content) blog.content = content;
    if (category) blog.category = category;
    if (author) blog.author = author;
    if (featured !== undefined) blog.featured = featured === 'true' || featured === true;
    if (published !== undefined) blog.published = published !== 'false' && published !== false;
    if (readTime) blog.readTime = readTime;
    if (tags) blog.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;

    await blog.save();
    res.json({ success: true, blog });
  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({ success: false, message: 'Error updating blog' });
  }
});

// DELETE /api/blogs/:id  – admin: delete blog
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Delete Cloudinary image
    if (blog.coverImage?.publicId) {
      await cloudinary.uploader.destroy(blog.coverImage.publicId).catch(() => {});
    }

    await Blog.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({ success: false, message: 'Error deleting blog' });
  }
});

export default router;
