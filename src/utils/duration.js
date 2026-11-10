/** Ubah durasi '15m', '7d', '3600' (detik) menjadi milidetik */
const UNITS = {
  s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000,
}

const toMs = (value) => {
  if (typeof value === 'number') return value * 1000
  const match = /^(\d+)\s*([smhd])?$/.exec(String(value).trim())
  if (!match) throw new Error(`Durasi tidak valid: ${value}`)
  return Number(match[1]) * (match[2] ? UNITS[match[2]] : 1000)
}

module.exports = { toMs }
