const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const { searchSimilarLogs } = require('../services/vectorStore');

router.use(authenticateToken);

router.post('/chat', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'Groq API Key is not configured on the server. Please add GROQ_API_KEY to your server .env file.'
    });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  try {
    const userId = req.user.id;

    // Fetch user profile
    const profile = await dbQuery.get('SELECT * FROM profiles WHERE user_id = ?', [userId]) || {};
    
    // Fetch user medications
    const medications = await dbQuery.all('SELECT name, time_of_day FROM medications WHERE user_id = ?', [userId]);

    // Fetch aggregated stats (all-time)
    const vitalsStats  = await dbQuery.get(`SELECT ROUND(CAST(AVG(systolic) AS NUMERIC), 0) AS avg_sys, MIN(systolic) AS min_sys, MAX(systolic) AS max_sys, ROUND(CAST(AVG(diastolic) AS NUMERIC), 0) AS avg_dia, ROUND(CAST(AVG(hr) AS NUMERIC), 0) AS avg_hr, ROUND(CAST(AVG(spo2) AS NUMERIC), 1) AS avg_spo2, COUNT(*) AS n FROM vitals WHERE user_id = ?`, [userId]);
    const glucoseStats = await dbQuery.get(`SELECT ROUND(CAST(AVG(value) AS NUMERIC), 0) AS avg_gl, MIN(value) AS min_gl, MAX(value) AS max_gl, COUNT(*) AS n FROM glucose WHERE user_id = ?`, [userId]);
    const weightStats  = await dbQuery.get(`SELECT ROUND(CAST(AVG(value) AS NUMERIC), 1) AS avg_wt, MIN(value) AS min_wt, MAX(value) AS max_wt, COUNT(*) AS n FROM weight WHERE user_id = ?`, [userId]);
    const recentReports = await dbQuery.all('SELECT report_type, title FROM reports WHERE user_id = ? ORDER BY timestamp DESC LIMIT 3', [userId]);

    // Trend analysis
    const recentVitals = await dbQuery.all('SELECT timestamp, systolic, diastolic, hr FROM vitals WHERE user_id = ? ORDER BY timestamp DESC LIMIT 7', [userId]);
    let activeAlerts = [];
    if (recentVitals.length > 0) {
      const avgSys = recentVitals.reduce((acc, log) => acc + log.systolic, 0) / recentVitals.length;
      const avgDia = recentVitals.reduce((acc, log) => acc + log.diastolic, 0) / recentVitals.length;
      const avgHr  = recentVitals.reduce((acc, log) => acc + log.hr, 0) / recentVitals.length;

      if (avgSys >= 140 || avgDia >= 90) activeAlerts.push('High blood pressure trend (Stage 2 Hypertension)');
      else if (avgSys >= 130 || avgDia >= 80) activeAlerts.push('Elevated blood pressure trend (Stage 1 Hypertension)');
      else if (avgSys < 90 || avgDia < 60) activeAlerts.push('Low blood pressure trend');

      if (avgHr > 100) activeAlerts.push('High resting heart rate trend (Tachycardia)');
      else if (avgHr < 60) activeAlerts.push('Low resting heart rate trend (Bradycardia)');
    }

    // RAG: Retrieve semantically similar log entries based on the user's last message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    let ragContext = '';
    if (lastUserMessage) {
      const similarLogs = await searchSimilarLogs(userId, lastUserMessage.content, 5);
      if (similarLogs.length > 0) {
        ragContext = `\nRelevant Log Entries (retrieved by semantic search):\n` +
          similarLogs.map((log, i) => `${i + 1}. [${log.log_type}] ${log.summary}`).join('\n');
      }
    }

    const systemPrompt = `You are VitalDiary AI, a concise health assistant with access to the user's health data.

Profile: ${profile.name || 'User'}, Age ${profile.age || '?'}, ${profile.gender || '?'}, Blood Group ${profile.blood_group || '?'}, Height ${profile.height || '?'}.

Medications: ${medications.length ? medications.map(m => `${m.name} (${m.time_of_day})`).join(', ') : 'none'}.

Health Stats (all-time):
- BP: avg ${vitalsStats?.avg_sys}/${vitalsStats?.avg_dia} mmHg, range ${vitalsStats?.min_sys}–${vitalsStats?.max_sys} systolic, HR avg ${vitalsStats?.avg_hr} bpm, SpO2 avg ${vitalsStats?.avg_spo2}% (${vitalsStats?.n || 0} readings)
- Glucose: avg ${glucoseStats?.avg_gl} mg/dL, range ${glucoseStats?.min_gl}–${glucoseStats?.max_gl} (${glucoseStats?.n || 0} readings)
- Weight: avg ${weightStats?.avg_wt} kg, range ${weightStats?.min_wt}–${weightStats?.max_wt} (${weightStats?.n || 0} readings)
- Recent reports: ${recentReports.length ? recentReports.map(r => `${r.report_type}: ${r.title}`).join('; ') : 'none'}

Active Health Alerts (Recent Trends):
${activeAlerts.length ? activeAlerts.map(a => `- ⚠️ ${a}`).join('\n') : '- No active alerts.'}
${ragContext}
STRICT FORMATTING RULES — follow these exactly:
- NEVER use markdown tables. Use short bullet points instead.
- Keep responses under 120 words unless the user explicitly asks for detail.
- Use at most 2-3 bullet points per answer.
- No repetitive disclaimers in every message. Only add a one-line disclaimer when giving medical advice.
- Be direct and conversational. No headers unless the user asks for a report.`.trim();

    // Cap conversation history to last 6 messages (3 turns)
    const recentMessages = messages.slice(-6);

    const groqPayload = {
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages
      ],
      temperature: 0.7,
      max_tokens: 400
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groqPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', errorText);
      return res.status(502).json({ error: 'Error communicating with the Groq AI service.' });
    }

    const responseData = await response.json();
    const reply = responseData.choices?.[0]?.message;
    if (!reply) {
      return res.status(502).json({ error: 'Invalid response from Groq AI service.' });
    }

    res.json({ reply });
  } catch (err) {
    console.error('AI assistant route error:', err);
    res.status(500).json({ error: 'Server error processing your request.' });
  }
});

module.exports = router;
