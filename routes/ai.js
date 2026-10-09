const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const { searchSimilarLogs } = require('../services/vectorStore');

router.use(authenticateToken);

// Compact, safety-focused system prompt
const COMPACT_SYSTEM_PROMPT = `You are VitalDiary AI, a concise personal health assistant.

Answer the user's question using the supplied health context. Give specific recorded values, dates, and comparisons when relevant. Distinguish historical data from recent readings.

Never invent health readings, medical history, diagnoses, medications, or trends. If information is unavailable, state that clearly.

Use only context relevant to the question. Explain important trends in plain language. Do not claim that a correlation proves causation.

Keep ordinary answers concise, generally under 100 words. Use short paragraphs or up to 3 bullets. Provide more detail when necessary for safety or when explicitly requested.

For medical questions, provide general information rather than a definitive diagnosis. Do not advise changing medication dosages without a clinician's guidance. Identify urgent warning signs and recommend appropriate medical care.`.trim();

/**
 * Question routing: categorizes user questions using keyword matching.
 * Handles single-topic and multi-topic questions.
 */
function getQuestionCategories(message) {
  if (!message || typeof message !== 'string') return ['general'];
  const q = message.toLowerCase();
  const categories = new Set();

  if (/blood pressure|\bbp\b|systolic|diastolic|hypertension|hypotension|my (resting )?(heart rate|hr|pulse)/i.test(q)) {
    categories.add('bp');
  }

  if (/glucose|blood sugar|sugar level|sugar reading|\bhba1c\b|hyperglycemia|hypoglycemia|insulin/i.test(q)) {
    categories.add('glucose');
  }

  if (/weight|body weight|\bbmi\b|\bweigh\b/i.test(q)) {
    categories.add('weight');
  }

  if (/medication|medicine|medicines|tablet|tablets|prescription|drug|drugs|dosage|dose\b|pill|pills/i.test(q)) {
    categories.add('medications');
  }

  if (/report|reports|lab result|lab results|test result|test results|blood test|urine test|biopsy|scan|panel/i.test(q)) {
    categories.add('reports');
  }

  if (/my health|health summary|overall health|health trends?|health status|how am i doing|overview|summary\b/i.test(q)) {
    categories.add('summary');
  }

  if (categories.size === 0) {
    return ['general'];
  }

  return Array.from(categories);
}

/**
 * Clean date helper for compact LLM context
 */
function formatDate(ts) {
  if (!ts) return 'Unknown date';
  try {
    return new Date(ts).toISOString().split('T')[0];
  } catch {
    return String(ts).slice(0, 10);
  }
}

/**
 * Limit conversation history to the latest N messages (default 6),
 * preserving correct ordering and message structure.
 */
function getRecentMessages(messages, limit = 6) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-limit)
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({
      role: m.role,
      content: m.content.trim()
    }));
}

/**
 * Selectively fetches only the data required for the given categories.
 */
async function fetchRelevantHealthData(userId, categories) {
  const data = {};

  const needsBP = categories.includes('bp') || categories.includes('summary');
  const needsGlucose = categories.includes('glucose') || categories.includes('summary');
  const needsWeight = categories.includes('weight') || categories.includes('summary');
  const needsMedications = categories.includes('medications') || categories.includes('summary');
  const needsReports = categories.includes('reports');
  const needsProfile = categories.includes('summary');

  if (needsProfile) {
    data.profile = await dbQuery.get(
      'SELECT name, age, gender, blood_group, height FROM profiles WHERE user_id = ?',
      [userId]
    ) || null;
  }

  if (needsBP) {
    data.vitalsStats = await dbQuery.get(
      `SELECT ROUND(CAST(AVG(systolic) AS NUMERIC), 0) AS avg_sys,
              MIN(systolic) AS min_sys,
              MAX(systolic) AS max_sys,
              ROUND(CAST(AVG(diastolic) AS NUMERIC), 0) AS avg_dia,
              ROUND(CAST(AVG(hr) AS NUMERIC), 0) AS avg_hr,
              ROUND(CAST(AVG(spo2) AS NUMERIC), 1) AS avg_spo2,
              COUNT(*) AS n
       FROM vitals WHERE user_id = ?`,
      [userId]
    );

    data.recentVitals = await dbQuery.all(
      'SELECT timestamp, systolic, diastolic, hr, spo2, notes FROM vitals WHERE user_id = ? ORDER BY timestamp DESC LIMIT 7',
      [userId]
    );

    // Calculate active BP and heart rate alerts
    const alerts = [];
    if (data.recentVitals && data.recentVitals.length > 0) {
      const avgSys = data.recentVitals.reduce((acc, log) => acc + log.systolic, 0) / data.recentVitals.length;
      const avgDia = data.recentVitals.reduce((acc, log) => acc + log.diastolic, 0) / data.recentVitals.length;
      const avgHr  = data.recentVitals.reduce((acc, log) => acc + log.hr, 0) / data.recentVitals.length;

      if (avgSys >= 140 || avgDia >= 90) alerts.push('High blood pressure trend (Stage 2 Hypertension)');
      else if (avgSys >= 130 || avgDia >= 80) alerts.push('Elevated blood pressure trend (Stage 1 Hypertension)');
      else if (avgSys < 90 || avgDia < 60) alerts.push('Low blood pressure trend');

      if (avgHr > 100) alerts.push('High resting heart rate trend (Tachycardia)');
      else if (avgHr < 60) alerts.push('Low resting heart rate trend (Bradycardia)');
    }
    data.bpAlerts = alerts;
  }

  if (needsGlucose) {
    data.glucoseStats = await dbQuery.get(
      `SELECT ROUND(CAST(AVG(value) AS NUMERIC), 0) AS avg_gl,
              MIN(value) AS min_gl,
              MAX(value) AS max_gl,
              COUNT(*) AS n
       FROM glucose WHERE user_id = ?`,
      [userId]
    );

    data.recentGlucose = await dbQuery.all(
      'SELECT timestamp, value, context, notes FROM glucose WHERE user_id = ? ORDER BY timestamp DESC LIMIT 7',
      [userId]
    );

    const alerts = [];
    if (data.recentGlucose && data.recentGlucose.length > 0) {
      const latest = data.recentGlucose[0];
      if (latest.value >= 180) alerts.push(`High glucose reading (${latest.value} mg/dL)`);
      else if (latest.value < 70) alerts.push(`Low glucose reading (${latest.value} mg/dL)`);
    }
    data.glucoseAlerts = alerts;
  }

  if (needsWeight) {
    data.weightStats = await dbQuery.get(
      `SELECT ROUND(CAST(AVG(value) AS NUMERIC), 1) AS avg_wt,
              MIN(value) AS min_wt,
              MAX(value) AS max_wt,
              COUNT(*) AS n
       FROM weight WHERE user_id = ?`,
      [userId]
    );

    data.recentWeight = await dbQuery.all(
      'SELECT timestamp, value, notes FROM weight WHERE user_id = ? ORDER BY timestamp DESC LIMIT 7',
      [userId]
    );
  }

  if (needsMedications) {
    data.medications = await dbQuery.all(
      'SELECT name, time_of_day, instructions, is_insulin FROM medications WHERE user_id = ?',
      [userId]
    );
  }

  if (needsReports) {
    data.recentReports = await dbQuery.all(
      'SELECT timestamp, report_type, title, data, notes FROM reports WHERE user_id = ? ORDER BY timestamp DESC LIMIT 3',
      [userId]
    );
  }

  return data;
}

/**
 * Builds compact, formatted health context text from retrieved data.
 * Omits internal IDs, unneeded database fields, and unrelated categories.
 */
function buildHealthContext(categories, data) {
  const sections = [];

  for (const cat of categories) {
    switch (cat) {
      case 'bp': {
        const parts = ['[Blood Pressure & Vitals]'];
        if (data.vitalsStats && data.vitalsStats.n > 0) {
          parts.push(`All-time stats (${data.vitalsStats.n} readings): Avg ${data.vitalsStats.avg_sys}/${data.vitalsStats.avg_dia} mmHg (Range: ${data.vitalsStats.min_sys}–${data.vitalsStats.max_sys} systolic), Avg HR ${data.vitalsStats.avg_hr} bpm, Avg SpO2 ${data.vitalsStats.avg_spo2}%.`);
        } else {
          parts.push('No historical vitals recorded.');
        }

        if (data.recentVitals && data.recentVitals.length > 0) {
          const readings = data.recentVitals
            .map(v => `${formatDate(v.timestamp)}: ${v.systolic}/${v.diastolic} mmHg (HR ${v.hr} bpm)`)
            .join('; ');
          parts.push(`Recent readings (newest first): ${readings}`);
        }

        if (data.bpAlerts && data.bpAlerts.length > 0) {
          parts.push(`Active alerts: ${data.bpAlerts.join('; ')}`);
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'glucose': {
        const parts = ['[Blood Glucose]'];
        if (data.glucoseStats && data.glucoseStats.n > 0) {
          parts.push(`All-time stats (${data.glucoseStats.n} readings): Avg ${data.glucoseStats.avg_gl} mg/dL (Range: ${data.glucoseStats.min_gl}–${data.glucoseStats.max_gl} mg/dL).`);
        } else {
          parts.push('No blood glucose records found.');
        }

        if (data.recentGlucose && data.recentGlucose.length > 0) {
          const readings = data.recentGlucose
            .map(g => `${formatDate(g.timestamp)}: ${g.value} mg/dL (${g.context || 'unspecified'})`)
            .join('; ');
          parts.push(`Recent readings (newest first): ${readings}`);
        }

        if (data.glucoseAlerts && data.glucoseAlerts.length > 0) {
          parts.push(`Active alerts: ${data.glucoseAlerts.join('; ')}`);
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'weight': {
        const parts = ['[Weight]'];
        if (data.weightStats && data.weightStats.n > 0) {
          parts.push(`All-time stats (${data.weightStats.n} readings): Avg ${data.weightStats.avg_wt} kg (Range: ${data.weightStats.min_wt}–${data.weightStats.max_wt} kg).`);
        } else {
          parts.push('No weight records found.');
        }

        if (data.recentWeight && data.recentWeight.length > 0) {
          const readings = data.recentWeight
            .map(w => `${formatDate(w.timestamp)}: ${w.value} kg`)
            .join('; ');
          parts.push(`Recent measurements: ${readings}`);
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'medications': {
        const parts = ['[Medications]'];
        if (data.medications && data.medications.length > 0) {
          const list = data.medications
            .map(m => `${m.name} (${m.time_of_day || 'schedule unrecorded'}${m.instructions ? ` - ${m.instructions}` : ''})`)
            .join('; ');
          parts.push(`Recorded medications: ${list}`);
        } else {
          parts.push('No active medications recorded.');
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'reports': {
        const parts = ['[Medical Reports]'];
        if (data.recentReports && data.recentReports.length > 0) {
          const reportSummaries = data.recentReports.map(r => {
            const dateStr = formatDate(r.timestamp);
            const dataExcerpt = r.data ? ` Findings: ${r.data.slice(0, 200)}` : '';
            return `* [${dateStr}] ${r.title} (${r.report_type}).${dataExcerpt}`;
          }).join('\n');
          parts.push(reportSummaries);
        } else {
          parts.push('No medical reports recorded.');
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'summary': {
        const parts = ['[Health Summary]'];
        if (data.profile) {
          const p = data.profile;
          parts.push(`Profile: ${p.name || 'User'}, Age ${p.age ?? '?'}, ${p.gender || '?'}, Blood Group ${p.blood_group || '?'}.`);
        }
        if (data.vitalsStats?.n) {
          parts.push(`BP Avg: ${data.vitalsStats.avg_sys}/${data.vitalsStats.avg_dia} mmHg, HR Avg: ${data.vitalsStats.avg_hr} bpm.`);
        }
        if (data.glucoseStats?.n) {
          parts.push(`Glucose Avg: ${data.glucoseStats.avg_gl} mg/dL.`);
        }
        if (data.weightStats?.n) {
          parts.push(`Weight Avg: ${data.weightStats.avg_wt} kg.`);
        }
        if (data.medications && data.medications.length > 0) {
          parts.push(`Medications: ${data.medications.map(m => m.name).join(', ')}.`);
        }
        if (data.bpAlerts && data.bpAlerts.length > 0) {
          parts.push(`Alerts: ${data.bpAlerts.join('; ')}`);
        }
        sections.push(parts.join('\n'));
        break;
      }

      case 'general':
      default:
        // Do not add personal health records for general questions
        break;
    }
  }

  return sections.join('\n\n').trim();
}

/**
 * Resilient Groq chat completions helper with bounded retries and error distinction
 */
async function callGroqWithRetry(apiKey, payload, maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }

      const status = response.status;
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch {
        try {
          const text = await response.text();
          errorBody = { message: text };
        } catch {
          errorBody = {};
        }
      }

      const providerError = errorBody.error?.message || errorBody.message || `HTTP ${status}`;
      const errorType = errorBody.error?.type || 'unknown_error';

      // 401 / 403: Authentication errors - do not retry
      if (status === 401 || status === 403) {
        console.error(`Groq API Authentication Error (Status ${status}): ${errorType}`);
        return {
          success: false,
          status: 502,
          clientMessage: 'AI service authentication failed. Please check server configuration.'
        };
      }

      // 400 / 422: Invalid request parameters - do not retry
      if (status === 400 || status === 422) {
        console.error(`Groq API Invalid Request Error (Status ${status}): ${providerError}`);
        return {
          success: false,
          status: 400,
          clientMessage: 'Invalid request parameters sent to AI service.'
        };
      }

      // 404: Model not found or endpoint not found
      if (status === 404) {
        console.error(`Groq API Model Not Found (Status 404): ${providerError}`);
        return {
          success: false,
          status: 502,
          clientMessage: `Configured AI model was not found or is unavailable: ${providerError}`
        };
      }

      // 429: Rate limit or 5xx: Server errors - retry with bounded backoff
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        attempt++;
        const backoffMs = attempt * 1000;
        console.warn(`Groq API transient error (Status ${status}). Retrying attempt ${attempt}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      if (status === 429) {
        console.warn(`Groq API rate limit exhausted after retries: ${providerError}`);
        return {
          success: false,
          status: 429,
          clientMessage: 'AI service is temporarily busy or rate limit was reached. Please wait a moment and try again.'
        };
      }

      console.error(`Groq API server error (Status ${status}): ${providerError}`);
      return {
        success: false,
        status: 502,
        clientMessage: 'Error communicating with the AI service. Please try again later.'
      };

    } catch (networkErr) {
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = attempt * 1000;
        console.warn(`Groq API network failure (${networkErr.message}). Retrying ${attempt}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      console.error('Groq API network error after retries:', networkErr.message);
      return {
        success: false,
        status: 502,
        clientMessage: 'Failed to connect to the AI service. Please try again later.'
      };
    }
  }
}

router.post('/chat', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'Groq API Key is not configured on the server. Please add GROQ_API_KEY to your server .env file.'
    });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  try {
    const userId = req.user.id;

    // Identify current user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const questionText = lastUserMessage?.content || '';

    // Step 3: Question routing
    const categories = getQuestionCategories(questionText);

    // Step 4: Fetch only relevant health data
    const healthData = await fetchRelevantHealthData(userId, categories);
    const healthContextText = buildHealthContext(categories, healthData);

    // Step 5: Limit RAG context (3 chunks max, ~1800 char budget, skipped for purely general questions)
    let ragContextText = '';
    const isPurelyGeneral = categories.length === 1 && categories[0] === 'general';
    if (!isPurelyGeneral && questionText) {
      try {
        const similarLogs = await searchSimilarLogs(userId, questionText, 4);
        if (similarLogs && similarLogs.length > 0) {
          const seenSummaries = new Set();
          const filteredLogs = [];
          let charCount = 0;
          const MAX_RAG_CHARS = 1800; // ~450 tokens

          for (const log of similarLogs) {
            if (!log.summary || seenSummaries.has(log.summary)) continue;
            seenSummaries.add(log.summary);

            const logLine = `${filteredLogs.length + 1}. [${log.log_type}] ${log.summary}`;
            if (charCount + logLine.length > MAX_RAG_CHARS && filteredLogs.length >= 2) {
              break;
            }

            filteredLogs.push(logLine);
            charCount += logLine.length;
            if (filteredLogs.length >= 3) break;
          }

          if (filteredLogs.length > 0) {
            ragContextText = filteredLogs.join('\n');
          }
        }
      } catch (ragErr) {
        console.warn('RAG retrieval failed, proceeding without RAG context:', ragErr.message);
      }
    }

    // Step 2 & 4: Combine compact system prompt with dynamic context
    let fullSystemPrompt = COMPACT_SYSTEM_PROMPT;
    if (healthContextText) {
      fullSystemPrompt += `\n\nSUPPLIED HEALTH CONTEXT:\n${healthContextText}`;
    }
    if (ragContextText) {
      fullSystemPrompt += `\n\nRELEVANT LOG ENTRIES:\n${ragContextText}`;
    }

    // Step 6: Limit conversation history to latest 6 messages
    const recentMessages = getRecentMessages(messages, 6);

    // Step 7: Output limits (500 tokens accounts for reasoning tokens + concise response without cutoff)
    const groqPayload = {
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        ...recentMessages
      ],
      temperature: 0.3,
      max_tokens: parseInt(process.env.GROQ_MAX_TOKENS, 10) || 500
    };

    // Step 9: Call Groq with retry and error distinction
    const result = await callGroqWithRetry(apiKey, groqPayload);
    if (!result.success) {
      return res.status(result.status).json({ error: result.clientMessage });
    }

    // Step 8: Measure and log token usage
    const usage = result.data.usage;
    console.info('VitalDiary AI token usage', {
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
    });

    const reply = result.data.choices?.[0]?.message;
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
module.exports.getQuestionCategories = getQuestionCategories;
module.exports.getRecentMessages = getRecentMessages;
module.exports.buildHealthContext = buildHealthContext;
module.exports.fetchRelevantHealthData = fetchRelevantHealthData;
module.exports.COMPACT_SYSTEM_PROMPT = COMPACT_SYSTEM_PROMPT;
