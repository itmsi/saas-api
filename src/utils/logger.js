const winston = require('winston')
const config = require('../config')

// Log ke stdout saja: di Docker dibaca lewat `docker logs`,
// tanpa Docker bisa diarahkan ke file oleh PM2/systemd.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (config.app.isProduction ? 'info' : 'debug'),
  format: config.app.isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
    : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({
        timestamp, level, message, stack
      }) => `${timestamp} ${level} ${stack || message}`)
    ),
  transports: [new winston.transports.Console()],
})

module.exports = logger
