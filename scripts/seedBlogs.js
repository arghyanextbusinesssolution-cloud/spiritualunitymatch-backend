import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Blog from '../models/Blog.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const initialBlogs = [
  {
    title: 'Finding Your Soul Mate Through Spiritual Alignment',
    slug: 'finding-your-soul-mate-through-spiritual-alignment',
    excerpt: 'Discover how aligning your spiritual values creates deeper, more meaningful romantic connections that transcend the ordinary.',
    content: `Finding someone who resonates with you spiritually goes beyond surface-level traits. When two individuals share a similar frequency and purpose, relationship challenges become opportunities for growth rather than conflict.

Here are key aspects to focus on:
1. Understanding your personal inner alignment first.
2. Observing how peace feels in a partner's presence versus mere excitement.
3. Engaging in shared mindfulness, prayer, or grounding practices.

By leading with your authentic soul energy, you draw in connections that honor your journey.`,
    category: 'Soul Connections',
    author: 'Maya Patel',
    coverImage: {
      url: 'https://res.cloudinary.com/dxx54fccl/image/upload/v1776788211/photo1_xx7mbe.webp',
      publicId: 'photo1_xx7mbe'
    },
    featured: true,
    published: true,
    readTime: '6 min read',
    tags: ['soulmate', 'spirituality', 'alignment']
  },
  {
    title: 'The Power of Shared Meditation in Relationships',
    slug: 'the-power-of-shared-meditation-in-relationships',
    excerpt: 'Couples who meditate together build unbreakable bonds. Learn how incorporating mindfulness can transform your love life.',
    content: `Shared stillness can communicate what words often cannot. When two partners sit in silent presence, their heart-rate variability and energy centers begin to harmonize.

Practicing shared meditation allows couples to:
- Dissolve tension before it turns into misunderstanding.
- Build profound empathetic listening skills.
- Foster unconditional acceptance and spiritual intimacy.`,
    category: 'Meditation',
    author: 'James Whitfield',
    coverImage: {
      url: 'https://res.cloudinary.com/dxx54fccl/image/upload/v1776788211/photo2_bmtjyv.webp',
      publicId: 'photo2_bmtjyv'
    },
    featured: false,
    published: true,
    readTime: '5 min read',
    tags: ['meditation', 'love', 'peace']
  },
  {
    title: '7 Signs You’ve Found a Spiritually Compatible Partner',
    slug: '7-signs-youve-found-a-spiritually-compatible-partner',
    excerpt: 'Beyond physical attraction, spiritual compatibility creates relationships that stand the test of time. Here is what to look for.',
    content: `True spiritual compatibility isn't about agreeing on every single dogma; it is about honoring each other's path to consciousness.

Look for these signs:
1. You feel energised rather than drained after spending time together.
2. Vulnerability feels safe and sacred.
3. Your spiritual visions inspire each other without coercion.
4. Silence between you feels warm, comfortable, and nurturing.`,
    category: 'Relationships',
    author: 'Priya Sharma',
    coverImage: {
      url: 'https://res.cloudinary.com/dxx54fccl/image/upload/v1776788210/photo3_wxhucm.webp',
      publicId: 'photo3_wxhucm'
    },
    featured: false,
    published: true,
    readTime: '7 min read',
    tags: ['compatibility', 'consciousness', 'dating']
  }
];

async function seedBlogs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Remove any invalid null slug entries
    await Blog.deleteMany({ slug: null });

    for (const b of initialBlogs) {
      const exists = await Blog.findOne({ slug: b.slug });
      if (!exists) {
        await Blog.create(b);
        console.log(`✅ Created blog: ${b.title}`);
      } else {
        console.log(`ℹ️ Already exists: ${b.title}`);
      }
    }

    const total = await Blog.countDocuments();
    console.log(`✅ Total blogs in database: ${total}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding blogs:', error);
    process.exit(1);
  }
}

seedBlogs();
