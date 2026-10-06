const cron = require('node-cron');
const { dbQuery } = require('../database');

/**
 * VitalDiary Medication Reminder System
 * In a production environment, this would integrate with AWS SES, SendGrid, or Twilio.
 * For this capstone, we simulate the email/SMS dispatch with a logger.
 */

async function sendReminders(timeOfDay) {
  try {
    console.log(`[Reminders] Checking for ${timeOfDay} medications...`);
    
    // Find all users who have a medication scheduled for this time of day
    // We use a LIKE clause since time_of_day is stored as a JSON array string e.g. ["morning","night"]
    const meds = await dbQuery.all(`
      SELECT m.name, m.instructions, u.email 
      FROM medications m
      JOIN users u ON m.user_id = u.id
      WHERE m.time_of_day LIKE ?
    `, [`%${timeOfDay}%`]);

    if (meds.length === 0) {
      console.log(`[Reminders] No ${timeOfDay} medications scheduled.`);
      return;
    }

    // Group by user email
    const usersMeds = {};
    for (const med of meds) {
      if (!usersMeds[med.email]) usersMeds[med.email] = [];
      usersMeds[med.email].push(med);
    }

    // Simulate sending emails
    for (const [email, userMeds] of Object.entries(usersMeds)) {
      const medList = userMeds.map(m => `- ${m.name} (${m.instructions || 'No specific instructions'})`).join('\n');
      console.log(`
==================================================
EMAIL MOCK DISPATCH:
To: ${email}
Subject: VitalDiary Reminder: Time for your ${timeOfDay} medications
Body: 
Hello,
Please remember to take the following medications:
${medList}

Stay healthy!
- VitalDiary System
==================================================
      `);
    }

    console.log(`[Reminders] Dispatched ${Object.keys(usersMeds).length} reminder emails for ${timeOfDay}.`);
  } catch (err) {
    console.error(`[Reminders] Error running ${timeOfDay} reminders:`, err);
  }
}

function initReminders() {
  if (process.env.NODE_ENV === 'test') return;

  console.log('[Reminders] Cron scheduler initialized.');

  // Morning Reminders: 9:00 AM every day
  cron.schedule('0 9 * * *', () => {
    sendReminders('morning');
  });

  // Afternoon Reminders: 2:00 PM (14:00) every day
  cron.schedule('0 14 * * *', () => {
    sendReminders('afternoon');
  });

  // Night Reminders: 8:00 PM (20:00) every day
  cron.schedule('0 20 * * *', () => {
    sendReminders('night');
  });
}

module.exports = { initReminders, sendReminders };
