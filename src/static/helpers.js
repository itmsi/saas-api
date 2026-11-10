/**
 * Helper kecil untuk path Swagger (hanya untuk bagian yang berulang).
 */

const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const response = (name) => ({ $ref: `#/components/responses/${name}` })
const param = (name) => ({ $ref: `#/components/parameters/${name}` })

/**
 * Response sukses dengan envelope { success, data, meta }.
 * @param {string} description
 * @param {object} dataSchema   schema untuk field data, mis. ref('Plan') atau { type: 'array', items: ref('Plan') }
 * @param {{ paginated?: boolean, example?: any }} [opts]
 */
const dataResponse = (description, dataSchema, { paginated = false, example } = {}) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema,
          meta: paginated ? ref('PaginationMeta') : ref('Meta'),
        },
      },
      ...(example !== undefined ? { example } : {}),
    },
  },
})

/** Request body JSON. examples: { nama: { summary, value } } atau example tunggal */
const jsonBody = (schemaName, example, { required = true, examples } = {}) => ({
  required,
  content: {
    'application/json': {
      schema: ref(schemaName),
      ...(examples ? { examples } : { example }),
    },
  },
})

const errorBody = (description, code, message, httpStatus, details) => ({
  description,
  content: {
    'application/json': {
      schema: ref('ErrorResponse'),
      example: {
        success: false,
        error: {
          code, message, http_status: httpStatus, ...(details ? { details } : {}),
        },
        meta: { request_id: '1dc38260-3342-4297-916d-05d2243e1dba' },
      },
    },
  },
})

const bearer = [{ bearerAuth: [] }]
const internalKey = [{ InternalKeyAuth: [] }]

module.exports = {
  ref, response, param, dataResponse, jsonBody, errorBody, bearer, internalKey,
}
