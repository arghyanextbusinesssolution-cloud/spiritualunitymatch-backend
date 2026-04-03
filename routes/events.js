import express from 'express';
import Event from '../models/Event.js';
import EventRegistration from '../models/EventRegistration.js';
import Subscription from '../models/Subscription.js';
import { protect, adminOnly } from '../middleware/auth.js';
import upload, { uploadToCloudinary } from '../middleware/upload.js';
import { generateICS } from '../services/icsService.js';
import { sendRegistrationEmail } from '../services/emailService.js';

const router = express.Router();

// Admin: upload image to Cloudinary (MUST be before other POST routes)
router.post('/upload-image', protect, upload.single('image'), async (req, res) => {
  try {
    console.log('📤 [Events Upload] Request received', {
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      mimeType: req.file?.mimetype,
      user: req.user?.email,
      userRole: req.user?.role
    });
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      console.error('❌ User is not admin:', req.user?.email);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    if (!req.file) {
      console.error('❌ No file provided in request');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    console.log('📁 File details:', {
      buffer: !!req.file.buffer,
      bufferSize: req.file.buffer?.length
    });
    
    const result = await uploadToCloudinary(req.file, 'spiritualunitymatch-events');
    console.log('✅ Image uploaded to Cloudinary:', result.secure_url);
    res.json({ success: true, url: result.secure_url, result });
  } catch (error) {
    console.error('❌ Upload image error:', error.message, error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error uploading image: ' + error.message 
    });
  }
});

// Admin creates an event
router.post('/', adminOnly, async (req, res) => {
  try {
    const { title, description, image, startDate, endDate, location, capacity, visibleToPlans } = req.body;
    
    // Log event creation details with date/time
    console.log('📅 [EVENT CREATION] Admin creating new event:', {
      adminEmail: req.user.email,
      adminId: req.user._id,
      eventTitle: title,
      eventStartDate: startDate,
      eventStartDateFormatted: new Date(startDate).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC'
      }),
      eventEndDate: endDate,
      eventEndDateFormatted: endDate ? new Date(endDate).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC'
      }) : 'Not specified',
      location: location,
      capacity: capacity,
      visibleToPlans: visibleToPlans,
      createdAt: new Date().toISOString()
    });
    
    const event = await Event.create({
      title,
      description,
      image,
      startDate,
      endDate,
      location,
      capacity,
      visibleToPlans: Array.isArray(visibleToPlans) ? visibleToPlans : [],
      createdBy: req.user._id
    });
    
    console.log('✅ [EVENT CREATION] Event saved to database:', {
      eventId: event._id,
      eventTitle: event.title,
      mongoStartDate: event.startDate,
      mongoEndDate: event.endDate,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    });
    
    res.json({ success: true, event });
  } catch (error) {
    console.error('❌ [EVENT CREATION] Create event error:', error);
    res.status(500).json({ success: false, message: 'Error creating event' });
  }
});

// Admin: list all events (management)
router.get('/admin/list', adminOnly, async (req, res) => {
  try {
    const events = await Event.find({}).sort({ startDate: 1 });
    res.json({ success: true, events });
  } catch (error) {
    console.error('Admin list events error:', error);
    res.status(500).json({ success: false, message: 'Error fetching events' });
  }
});

// List events visible to the current user (requires auth)
router.get('/', protect, async (req, res) => {
  try {
    // Determine user's plan
    const subscription = await Subscription.findOne({ user: req.user._id });
    const plan = subscription?.plan || 'basic';

    // Find events that are either public (no visibleToPlans) or include the user's plan
    const events = await Event.find({
      $or: [
        { visibleToPlans: { $exists: true, $size: 0 } },
        { visibleToPlans: { $in: [plan] } }
      ]
    }).sort({ startDate: 1 });

    res.json({ success: true, events });
  } catch (error) {
    console.error('List events error:', error);
    res.status(500).json({ success: false, message: 'Error fetching events' });
  }
});

// Get user's registered events (MUST be before /:id route)
router.get('/user/registered', protect, async (req, res) => {
  try {
    const registrations = await EventRegistration.find({ user: req.user._id })
      .populate('event')
      .sort({ createdAt: -1 });
    
    const events = registrations.map(r => r.event);
    res.json({ success: true, events });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user events' });
  }
});

// Get event details
router.get('/:id', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const registrations = await EventRegistration.find({ event: event._id }).populate('user', 'email');
    res.json({ success: true, event, registrations });
  } catch (error) {
    console.error('Event detail error:', error);
    res.status(500).json({ success: false, message: 'Error fetching event' });
  }
});

// Register for an event
router.post('/:id/register', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const now = new Date();
    // Allow registration until the event start date (or endDate if provided)
    const registerUntil = event.startDate || event.endDate || null;
    if (registerUntil && now > registerUntil) {
      return res.status(400).json({ success: false, message: 'Registration period has ended' });
    }

    // Check capacity
    if (event.capacity) {
      const count = await EventRegistration.countDocuments({ event: event._id });
      if (count >= event.capacity) {
        return res.status(400).json({ success: false, message: 'Event is full' });
      }
    }

    // Check already registered
    const already = await EventRegistration.findOne({ event: event._id, user: req.user._id });
    if (already) return res.status(400).json({ success: false, message: 'Already registered' });

    const registration = await EventRegistration.create({ event: event._id, user: req.user._id });

    // Generate ICS and send confirmation email (best-effort)
    try {
      const ics = generateICS(event);
      await sendRegistrationEmail(req.user.email, event, ics, 'registered');
    } catch (e) {
      console.error('Post-registration email error:', e);
    }

    res.json({ success: true, registration, message: 'Registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Error registering for event' });
  }
});

// Cancel registration (user)
router.delete('/:id/register', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    const registration = await EventRegistration.findOneAndDelete({ event: event._id, user: req.user._id });
    if (!registration) return res.status(400).json({ success: false, message: 'Not registered' });

    try {
      const ics = generateICS(event);
      await sendRegistrationEmail(req.user.email, event, ics, 'cancelled');
    } catch (e) {
      console.error('Post-cancel email error:', e);
    }

    res.json({ success: true, message: 'Registration cancelled' });
  } catch (error) {
    console.error('Cancel registration error:', error);
    res.status(500).json({ success: false, message: 'Error cancelling registration' });
  }
});

// Admin: edit event
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const update = req.body;
    const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    console.error('Edit event error:', error);
    res.status(500).json({ success: false, message: 'Error editing event' });
  }
});

// Admin: delete event
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    // Remove registrations
    await EventRegistration.deleteMany({ event: event._id });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, message: 'Error deleting event' });
  }
});

// Serve ICS file for an event
router.get('/:id/ics', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).send('Event not found');
    const ics = generateICS(event);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title || 'event'}.ics"`);
    res.send(ics);
  } catch (error) {
    console.error('Serve ICS error:', error);
    res.status(500).send('Error generating calendar file');
  }
});

export default router;
