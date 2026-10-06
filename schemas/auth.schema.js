const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email('Must be a valid email address.').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['patient']).optional().default('patient')
});

const loginSchema = z.object({
  email: z.string().email('Must be a valid email address.').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required.')
});

module.exports = { registerSchema, loginSchema };
