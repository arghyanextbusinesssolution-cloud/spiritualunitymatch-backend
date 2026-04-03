import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

export async function sendRegistrationEmail(toEmail, event, icsContent, action = 'registered') {
  try {
    const subject = action === 'cancelled' ? `Event cancelled: ${event.title}` : `You're registered: ${event.title}`;
    const text = action === 'cancelled'
      ? `Your registration for ${event.title} has been cancelled.`
      : `You've successfully registered for ${event.title} on ${new Date(event.startDate).toLocaleString()}`;

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'no-reply@spiritualunitymatch.com',
      to: toEmail,
      subject,
      text,
      attachments: icsContent ? [{
        filename: `${event.title || 'event'}.ics`,
        content: icsContent,
        contentType: 'text/calendar'
      }] : []
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Email send error:', err);
  }
}
