const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const morgan = require('morgan')
const config = require('./config')
const routes = require('./routes')
const { requestId } = require('./middlewares/request-id')
const { notFoundHandler, errorHandler } = require('./middlewares/error-handler')

const app = express()

app.set('trust proxy', 1) // di belakang Kong
app.disable('x-powered-by')

// CSP dimatikan agar Swagger UI di /documentation bisa memuat asetnya
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: config.app.corsOrigins.includes('*') ? '*' : config.app.corsOrigins,
}))
app.use(compression())
app.use(requestId)
app.use(express.json({ limit: config.app.jsonLimit }))
morgan.token('id', (req) => req.id)
app.use(morgan(config.app.isProduction ? ':id :remote-addr :method :url :status :res[content-length] - :response-time ms' : 'dev', {
  skip: (req) => req.path.startsWith('/health'),
}))

app.use(routes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
