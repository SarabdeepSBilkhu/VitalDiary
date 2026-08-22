const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

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

    // Fetch aggregated stats from DB directly — no raw rows needed
    const vitalsStats  = await dbQuery.get(`SELECT ROUND(AVG(systolic),0) AS avg_sys, MIN(systolic) AS min_sys, MAX(systolic) AS max_sys, ROUND(AVG(diastolic),0) AS avg_dia, ROUND(AVG(hr),0) AS avg_hr, ROUND(AVG(spo2),1) AS avg_spo2, COUNT(*) AS n FROM vitals WHERE user_id = ?`, [userId]);
    const glucoseStats = await dbQuery.get(`SELECT ROUND(AVG(value),0) AS avg_gl,  MIN(value) AS min_gl,  MAX(value) AS max_gl,  COUNT(*) AS n FROM glucose WHERE user_id = ?`, [userId]);
    const weightStats  = await dbQuery.get(`SELECT ROUND(AVG(value),1) AS avg_wt,  MIN(value) AS min_wt,  MAX(value) AS max_wt,  COUNT(*) AS n FROM weight  WHERE user_id = ?`, [userId]);
    const recentReports = await dbQuery.all('SELECT report_type, title FROM reports WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5', [userId]);

    // Helper
    const avg = (s, label) => s && s.n ? `${label}: avg ${s[Object.keys(s)[0]]}, min ${s[Object.keys(s)[1]]}, max ${s[Object.keys(s)[2]]} (${s.n} readings)` : `${label}: no data`;

    const systemPrompt = `You are VitalDiary AI, a compassionate health assistant with access to the user's health summary.

Profile: ${profile.name || 'User'}, Age ${profile.age || '?'}, ${profile.gender || '?'}, Blood Group ${profile.blood_group || '?'}, Height ${profile.height || '?'}, Allergies: ${profile.allergies || 'none'}.

Medications: ${medications.length ? medications.map(m => `${m.name} (${m.time_of_day})`).join(', ') : 'none'}.

Health Stats (all-time):
- BP: avg ${vitalsStats?.avg_sys}/${vitalsStats?.avg_dia} mmHg, systolic ${vitalsStats?.min_sys}–${vitalsStats?.max_sys}, HR avg ${vitalsStats?.avg_hr} bpm, SpO2 avg ${vitalsStats?.avg_spo2}% (${vitalsStats?.n || 0} readings)
- Glucose: avg ${glucoseStats?.avg_gl} mg/dL, range ${glucoseStats?.min_gl}–${glucoseStats?.max_gl} (${glucoseStats?.n || 0} readings)
- Weight: avg ${weightStats?.avg_wt} kg, range ${weightStats?.min_wt}–${weightStats?.max_wt} (${weightStats?.n || 0} readings)
- Recent reports: ${recentReports.length ? recentReports.map(r => `${r.report_type}: ${r.title}`).join('; ') : 'none'}

Guidelines: Be concise, empathetic, and use Markdown. Always end with: *Disclaimer: I am an AI, not a doctor. Consult a qualified healthcare professional before making health decisions.*`.trim();

    // Cap conversation history to last 6 messages (3 turns)
    const recentMessages = messages.slice(-6);

    // Prepare payload for Groq
    const groqPayload = {
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages
      ],
      temperature: 0.7,
      max_tokens: 1500
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
