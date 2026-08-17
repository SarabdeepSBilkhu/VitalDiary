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
    const medications = await dbQuery.all('SELECT name, time_of_day, instructions FROM medications WHERE user_id = ?', [userId]);

    // Fetch recent logs
    const vitals = await dbQuery.all('SELECT timestamp, systolic, diastolic, hr, spo2, notes FROM vitals WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15', [userId]);
    const glucose = await dbQuery.all('SELECT timestamp, value, context, notes FROM glucose WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15', [userId]);
    const weight = await dbQuery.all('SELECT timestamp, value, notes FROM weight WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15', [userId]);
    const reports = await dbQuery.all('SELECT timestamp, report_type, title, data, notes FROM reports WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10', [userId]);

    // Construct context
    const profileText = `
Name: ${profile.name || 'Not provided'}
Age: ${profile.age || 'Not provided'}
Gender: ${profile.gender || 'Not provided'}
Blood Group: ${profile.blood_group || 'Not provided'}
Height: ${profile.height || 'Not provided'}
Allergies: ${profile.allergies || 'None listed'}
Emergency Contact: ${profile.emergency_contact || 'Not provided'}
    `.trim();

    const medicationsText = medications.length > 0 
      ? medications.map(m => `- ${m.name} (Schedule: ${m.time_of_day}, Instructions: ${m.instructions || 'None'})`).join('\n')
      : 'No active medications logged.';

    const vitalsText = vitals.length > 0
      ? vitals.map(v => `- [${v.timestamp}] BP: ${v.systolic}/${v.diastolic} mmHg, HR: ${v.hr} bpm, SpO2: ${v.spo2 || 'N/A'}% (Notes: ${v.notes || 'None'})`).join('\n')
      : 'No vitals records logged.';

    const glucoseText = glucose.length > 0
      ? glucose.map(g => `- [${g.timestamp}] Value: ${g.value} mg/dL (${g.context}) (Notes: ${g.notes || 'None'})`).join('\n')
      : 'No glucose records logged.';

    const weightText = weight.length > 0
      ? weight.map(w => `- [${w.timestamp}] Weight: ${w.value} kg (Notes: ${w.notes || 'None'})`).join('\n')
      : 'No weight records logged.';

    const reportsText = reports.length > 0
      ? reports.map(r => `- [${r.timestamp}] [${r.report_type}] Title: ${r.title}\n  Findings: ${r.data || 'None'}\n  Notes: ${r.notes || 'None'}`).join('\n')
      : 'No medical reports logged.';

    const systemPrompt = `
You are VitalDiary AI, a highly intelligent and compassionate health assistant.
You have access to the user's secure health logs to provide personalized, context-aware answers.

User Health Context:
=== Profile ===
${profileText}

=== Active Medications ===
${medicationsText}

=== Recent Vitals Logs (Last 15) ===
${vitalsText}

=== Recent Glucose Logs (Last 15) ===
${glucoseText}

=== Recent Weight Logs (Last 15) ===
${weightText}

=== Medical Reports (Last 10) ===
${reportsText}
=== End of Context ===

Guidelines:
1. Provide accurate, personalized, and empathetic health insights based on the provided logs.
2. Structure your response cleanly using Markdown (bullet points, bold text, clear sections).
3. If the user asks about trends, refer to their logs. For example, check if their blood pressure or glucose has been high or low.
4. Keep answers clear, supportive, and informative.
5. ALWAYS add a disclaimer at the end of every response:
   "*Disclaimer: I am an AI health assistant, not a doctor. This analysis is for informational purposes only and does not constitute medical advice. Please consult a qualified healthcare professional before making any health or medication decisions.*"
`.trim();

    // Prepare payload for Groq
    const groqPayload = {
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1024
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
