const request = require('supertest');
const app = require('../../server');
const {
  getQuestionCategories,
  getRecentMessages,
  buildHealthContext,
  COMPACT_SYSTEM_PROMPT
} = require('../../routes/ai');

describe('VitalDiary AI Optimization', () => {
  describe('Question Categorization & Routing (Step 3)', () => {
    it('should categorize blood pressure questions correctly', () => {
      expect(getQuestionCategories('What is my average blood pressure?')).toContain('bp');
      expect(getQuestionCategories('Has my blood pressure improved recently?')).toContain('bp');
      expect(getQuestionCategories('What is my systolic and diastolic reading?')).toContain('bp');
    });

    it('should categorize medication questions correctly', () => {
      expect(getQuestionCategories('What medications am I taking?')).toContain('medications');
      expect(getQuestionCategories('Tell me about my dosage and medicine schedule')).toContain('medications');
    });

    it('should categorize health trends and summary questions correctly', () => {
      expect(getQuestionCategories('Summarize my health trends.')).toContain('summary');
      expect(getQuestionCategories('Can you give me an overall health summary?')).toContain('summary');
    });

    it('should categorize medical report questions correctly', () => {
      expect(getQuestionCategories('Explain my latest medical report.')).toContain('reports');
      expect(getQuestionCategories('What were the findings in my recent lab result?')).toContain('reports');
    });

    it('should categorize glucose and weight questions correctly', () => {
      expect(getQuestionCategories('What is my average blood sugar?')).toContain('glucose');
      expect(getQuestionCategories('How much do I weigh?')).toContain('weight');
    });

    it('should route general health knowledge to general category', () => {
      expect(getQuestionCategories('What is a normal resting heart rate?')).toEqual(['general']);
      expect(getQuestionCategories('How much water should I drink daily?')).toEqual(['general']);
    });

    it('should handle multi-topic questions by retrieving multiple categories', () => {
      const cats = getQuestionCategories('What is my blood pressure and weight?');
      expect(cats).toContain('bp');
      expect(cats).toContain('weight');
    });
  });

  describe('Conversation History Limiting (Step 6)', () => {
    it('should limit messages to the last 6 and preserve roles and contents', () => {
      const rawMessages = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Reply 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Reply 2' },
        { role: 'user', content: 'Message 3' },
        { role: 'assistant', content: 'Reply 3' },
        { role: 'user', content: 'Message 4' }
      ];

      const limited = getRecentMessages(rawMessages, 6);
      expect(limited).toHaveLength(6);
      expect(limited[0].content).toEqual('Reply 1');
      expect(limited[5].content).toEqual('Message 4');
    });

    it('should filter out invalid messages', () => {
      const dirty = [
        null,
        { role: 'unknown', content: 'bad' },
        { role: 'user', content: '  Clean message  ' }
      ];
      const cleaned = getRecentMessages(dirty);
      expect(cleaned).toHaveLength(1);
      expect(cleaned[0]).toEqual({ role: 'user', content: 'Clean message' });
    });
  });

  describe('Dynamic Context Building (Step 4)', () => {
    it('should format blood pressure context with dates, statistics, and alerts', () => {
      const mockData = {
        vitalsStats: {
          n: 14,
          avg_sys: 128,
          avg_dia: 82,
          min_sys: 110,
          max_sys: 145,
          avg_hr: 72,
          avg_spo2: 98
        },
        recentVitals: [
          { timestamp: '2026-10-08T10:00:00Z', systolic: 125, diastolic: 80, hr: 70 },
          { timestamp: '2026-10-05T10:00:00Z', systolic: 130, diastolic: 85, hr: 74 }
        ],
        bpAlerts: ['Elevated blood pressure trend (Stage 1 Hypertension)']
      };

      const context = buildHealthContext(['bp'], mockData);
      expect(context).toContain('[Blood Pressure & Vitals]');
      expect(context).toContain('Avg 128/82 mmHg');
      expect(context).toContain('2026-10-08: 125/80 mmHg (HR 70 bpm)');
      expect(context).toContain('Elevated blood pressure trend');
    });

    it('should format medications context cleanly', () => {
      const mockData = {
        medications: [
          { name: 'Metformin', time_of_day: 'morning, night', instructions: 'with food' },
          { name: 'Lisinopril', time_of_day: 'morning', instructions: null }
        ]
      };

      const context = buildHealthContext(['medications'], mockData);
      expect(context).toContain('[Medications]');
      expect(context).toContain('Metformin (morning, night - with food)');
      expect(context).toContain('Lisinopril (morning)');
    });

    it('should return empty string for general category questions', () => {
      const context = buildHealthContext(['general'], {});
      expect(context).toEqual('');
    });
  });

  describe('Compact System Prompt (Step 2)', () => {
    it('should contain concise instructions under 200 words and safety guidance', () => {
      expect(COMPACT_SYSTEM_PROMPT).toContain('You are VitalDiary AI, a concise personal health assistant.');
      expect(COMPACT_SYSTEM_PROMPT).toContain('Never invent health readings');
      expect(COMPACT_SYSTEM_PROMPT).toContain('under 100 words');
      const wordCount = COMPACT_SYSTEM_PROMPT.split(/\s+/).length;
      expect(wordCount).toBeLessThan(150);
    });
  });

  describe('AI Route /api/ai/chat integration', () => {
    let token;
    const testUser = {
      email: `ai-${Date.now()}@example.com`,
      password: 'password123'
    };

    beforeAll(async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      token = res.body.token;
    });

    it('should return 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
      expect(res.statusCode).toBe(401);
    });

    it('should return 400 if messages is empty or not an array', async () => {
      process.env.GROQ_API_KEY = 'test-key';
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: [] });
      expect(res.statusCode).toBe(400);
    });

    it('should process request and call Groq with optimized payload and log tokens', async () => {
      process.env.GROQ_API_KEY = 'test-mock-key';

      // Mock global fetch for Groq API
      const originalFetch = global.fetch;
      let interceptedPayload = null;

      global.fetch = jest.fn(async (url, options) => {
        if (url.includes('api.groq.com')) {
          interceptedPayload = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'chatcmpl-test',
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Your average blood pressure is 120/80 mmHg across all readings.'
                  }
                }
              ],
              usage: {
                prompt_tokens: 350,
                completion_tokens: 35,
                total_tokens: 385
              }
            })
          };
        }
        return originalFetch(url, options);
      });

      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [
            { role: 'user', content: 'What is my average blood pressure?' }
          ]
        });

      global.fetch = originalFetch;

      expect(res.statusCode).toBe(200);
      expect(res.body.reply.content).toContain('120/80');

      // Verify payload parameters
      expect(interceptedPayload.model).toEqual('openai/gpt-oss-120b');
      expect(interceptedPayload.max_tokens).toEqual(500);
      expect(interceptedPayload.temperature).toEqual(0.3);

      // Verify token usage logging
      expect(infoSpy).toHaveBeenCalledWith(
        'VitalDiary AI token usage',
        expect.objectContaining({
          inputTokens: 350,
          outputTokens: 35,
          totalTokens: 385
        })
      );

      infoSpy.mockRestore();
    });

    it('should return 429 when Groq rate limit is reached', async () => {
      process.env.GROQ_API_KEY = 'test-mock-key';

      const originalFetch = global.fetch;
      global.fetch = jest.fn(async (url) => {
        if (url.includes('api.groq.com')) {
          return {
            ok: false,
            status: 429,
            json: async () => ({
              error: { message: 'Rate limit reached', type: 'tokens' }
            })
          };
        }
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'What is a normal resting heart rate?' }]
        });

      global.fetch = originalFetch;
      warnSpy.mockRestore();

      expect(res.statusCode).toBe(429);
      expect(res.body.error).toContain('rate limit');
    });

    it('should return 502 without retrying on Groq 401 authentication failure', async () => {
      process.env.GROQ_API_KEY = 'invalid-key';

      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = jest.fn(async (url) => {
        if (url.includes('api.groq.com')) {
          callCount++;
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { message: 'Invalid API Key', type: 'invalid_request_error' }
            })
          };
        }
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      global.fetch = originalFetch;
      errorSpy.mockRestore();

      expect(res.statusCode).toBe(502);
      expect(callCount).toBe(1); // Do not retry 401
      expect(res.body.error).toContain('authentication failed');
    });
  });
});
