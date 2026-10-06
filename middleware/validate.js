/**
 * Zod-based request body validation middleware factory.
 * 
 * Usage: router.post('/', validate(myZodSchema), handler)
 */
const { ZodError } = require('zod');

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * On failure, returns 400 with structured error messages.
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err && err.name === 'ZodError') {
        const errors = err.issues.map(e => ({
          field: e.path ? e.path.join('.') : 'unknown',
          message: e.message
        }));
        return res.status(400).json({
          error: 'Validation failed.',
          details: errors
        });
      }
      next(err);
    }
  };
}

module.exports = validate;
