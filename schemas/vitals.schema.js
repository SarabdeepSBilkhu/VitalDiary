const { z } = require('zod');

const createVitalsSchema = z.object({
  id: z.string().optional(),
  timestamp: z.string().datetime({ offset: true, message: 'timestamp must be a valid ISO 8601 datetime.' }),
  systolic: z.number({ coerce: true }).int().min(40).max(300),
  diastolic: z.number({ coerce: true }).int().min(20).max(200),
  hr: z.number({ coerce: true }).int().min(20).max(300),
  spo2: z.number({ coerce: true }).int().min(50).max(100).optional().nullable(),
  temperature: z.number({ coerce: true }).min(30).max(110).optional().nullable(),
  temperature_unit: z.enum(['C', 'F']).optional().nullable(),
  notes: z.string().max(1000).optional().default('')
});

const updateVitalsSchema = createVitalsSchema;

module.exports = { createVitalsSchema, updateVitalsSchema };
