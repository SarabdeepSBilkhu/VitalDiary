/**
 * Weekly Auto-Summary Service
 * 
 * Aggregates each user's last 7 days of vitals, glucose, and weight,
 * sends to Groq for a plain-English summary, and saves as a
 * report_type: 'weekly_summary' row in the reports table.
 */
const { dbQuery } = require('../database');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate and store a weekly summary for a single user.
 * @param {number} userId
 */
async function generateWeeklySummary(userId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[weeklySummary] GROQ_API_KEY not set — skipping.');
    return;
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch last 7 days of data
    const [vitals, glucose, weights, profile] = await Promise.all([
      dbQuery.all(
        `SELECT systolic, diastolic, hr, spo2, timestamp, notes FROM vitals 
         WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp DESC`,
        [userId, sevenDaysAgo]
      ),
      dbQuery.all(
        `SELECT value, context, timestamp FROM glucose 
         WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp DESC`,
        [userId, sevenDaysAgo]
      ),
      dbQuery.all(
        `SELECT value, timestamp FROM weight 
         WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp DESC`,
        [userId, sevenDaysAgo]
      ),
      dbQuery.get('SELECT name FROM profiles WHERE user_id = ?', [userId])
    ]);

    // Skip if no data this week
    if (vitals.length === 0 && glucose.length === 0 && weights.length === 0) {
      console.log(`[weeklySummary] No data for user ${userId} this week — skipping.`);
      return;
    }

    // Build a stats summary
    const bpSummary = vitals.length > 0
      ? `${vitals.length} BP readings: avg ${Math.round(vitals.reduce((s, v) => s + v.systolic, 0) / vitals.length)}/${Math.round(vitals.reduce((s, v) => s + v.diastolic, 0) / vitals.length)} mmHg, avg HR ${Math.round(vitals.reduce((s, v) => s + v.hr, 0) / vitals.length)} bpm`
      : 'No blood pressure readings';

    const glucoseSummary = glucose.length > 0
      ? `${glucose.length} glucose readings: avg ${Math.round(glucose.reduce((s, g) => s + g.value, 0) / glucose.length)} mg/dL`
      : 'No glucose readings';

    const weightSummary = weights.length > 0
      ? `${weights.length} weight readings: ${weights[weights.length - 1].value} → ${weights[0].value} kg`
      : 'No weight readings';

    const userName = profile?.name || 'the user';
    const weekStart = new Date(sevenDaysAgo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEnd = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const prompt = `Generate a friendly, concise weekly health summary for ${userName} for the week of ${weekStart}–${weekEnd}.

Data:
- Blood Pressure: ${bpSummary}
- Glucose: ${glucoseSummary}
- Weight: ${weightSummary}

Write 2-3 paragraphs covering: overall trends, any concerns based on the numbers, and a brief positive/motivational note. Use Markdown. End with a disclaimer that this is AI-generated and not medical advice.`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${err}`);
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content;
    if (!summaryText) throw new Error('No summary returned from Groq.');

    // Store as a report
    const reportId = `weekly-summary-${userId}-${Date.now()}`;
    const title = `Weekly Health Summary: ${weekStart} – ${weekEnd}`;

    await dbQuery.run(
      `INSERT INTO reports (id, user_id, timestamp, report_type, title, data, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reportId, userId, now.toISOString(), 'weekly_summary', title, summaryText, 'Auto-generated weekly summary']
    );

    console.log(`[weeklySummary] Generated summary for user ${userId}: "${title}"`);
  } catch (err) {
    console.error(`[weeklySummary] Failed for user ${userId}:`, err.message);
  }
}

/**
 * Run weekly summaries for all users.
 */
async function runAllWeeklySummaries() {
  console.log('[weeklySummary] Starting weekly summary job...');
  try {
    const users = await dbQuery.all('SELECT id FROM users');
    console.log(`[weeklySummary] Processing ${users.length} users.`);
    for (const user of users) {
      await generateWeeklySummary(user.id);
    }
    console.log('[weeklySummary] Weekly summary job complete.');
  } catch (err) {
    console.error('[weeklySummary] Job failed:', err.message);
  }
}

module.exports = { generateWeeklySummary, runAllWeeklySummaries };
