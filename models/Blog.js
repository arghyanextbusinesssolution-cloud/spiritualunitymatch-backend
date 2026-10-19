import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  excerpt: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['Spiritual Growth', 'Relationships', 'Meditation', 'Soul Connections', 'Community', 'Wellness'],
    default: 'Spiritual Growth'
  },
  author: {
    type: String,
    default: 'Spiritual Unity Match Team'
  },
  coverImage: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' }
  },
  featured: {
    type: Boolean,
    default: false
  },
  published: {
    type: Boolean,
    default: true
  },
  readTime: {
    type: String,
    default: '5 min read'
  },
  tags: [{ type: String }],
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Auto-generate slug from title
blogSchema.pre('validate', function (next) {
  if (this.title && (!this.slug || this.isModified('title'))) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim() + '-' + Date.now();
  }
  next();
});

blogSchema.index({ published: 1, createdAt: -1 });
blogSchema.index({ category: 1 });

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
