const { AppError } = require('../utils/errors')

/**
 * Validasi request dengan Joi.
 *
 *   router.post('/x', validate({ body: schema, query: schema, params: schema }), handler)
 *
 * Gagal -> 422 VALIDATION_ERROR dengan details: [{ field, message }].
 * Hasil yang sudah dibersihkan/di-cast disimpan di req.body dan req.valid.{query,params}.
 */
const validate = (schemas) => (req, res, next) => {
  const details = []
  req.valid = req.valid || {}

  Object.entries(schemas).forEach(([source, schema]) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      errors: { wrap: { label: false } },
    })
    if (error) {
      error.details.forEach((d) => {
        details.push({ field: d.path.join('.'), message: d.message })
      })
    } else if (source === 'body') {
      req.body = value
    } else {
      req.valid[source] = value
    }
  })

  if (details.length) return next(new AppError('VALIDATION_ERROR', { details }))
  return next()
}

module.exports = { validate }
