// Simple ICS generator
export function formatDateToICS(date) {
  const d = new Date(date);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear()
    + pad(d.getUTCMonth() + 1)
    + pad(d.getUTCDate())
    + 'T'
    + pad(d.getUTCHours())
    + pad(d.getUTCMinutes())
    + pad(d.getUTCSeconds())
    + 'Z';
}

export function generateICS(event) {
  const uid = `event-${event._id}@spiritualunitymatch`;
  const dtstamp = formatDateToICS(new Date());
  const dtstart = formatDateToICS(event.startDate);
  const dtend = event.endDate ? formatDateToICS(event.endDate) : dtstart;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SpiritualUnityMatch//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${(event.title || '').replace(/\n/g, ' ')}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, ' ')}`,
    `LOCATION:${(event.location || '').replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}
