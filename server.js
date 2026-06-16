import 'dotenv/config'
import express from 'express'
import https from 'https'
import { URL } from 'url'
import zlib from 'zlib'

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.text({ type: '*/*', limit: '10mb' }))

const TOKEN = process.env.INTERNAL_TOKEN

app.use((req, res, next) => {
  // Se body chegou como string, tenta parsear como JSON
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body) } catch {}
  }
  if (req.headers['x-internal-token'] !== TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true }))

function getBase(ambiente) {
  return ambiente === 'producao'
    ? 'https://sefin.nfse.gov.br/SefinNacional'
    : 'https://hom.nfse.gov.br/SefinNacional'
}

function xmlToGzipB64(xml) {
  return zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64')
}

function httpsRequest(urlStr, { method = 'GET', headers = {}, body, pfx_base64, pfx_senha }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const pfxBuffer = Buffer.from(pfx_base64, 'base64')
    const bodyBuffer = body ? Buffer.from(body, 'utf8') : null

    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      servername: u.hostname,
      headers: {
        ...headers,
        ...(bodyBuffer ? { 'Content-Length': bodyBuffer.length } : {}),
      },
      pfx: pfxBuffer,
      passphrase: pfx_senha,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
      }))
    })

    req.on('error', (e) => reject(new Error(`${e.message} | host: ${u.hostname} | path: ${u.pathname}`)))
    if (bodyBuffer) req.write(bodyBuffer)
    req.end()
  })
}

// POST /dps → gzip+base64 → JSON → POST /SefinNacional/nfse
app.post('/dps', async (req, res) => {
  console.log('=== POST /dps ===')
  console.log('content-type:', req.headers['content-type'])
  console.log('body type:', typeof req.body)
  console.log('campos:', Object.keys(req.body || {}))

  const xml_dps =
    req.body.xml_dps ||
    req.body.dps ||
    req.body.xml ||
    req.body.dpsXml ||
    req.body.dps_xml ||
    null

  const ja_comprimido =
    req.body.dpsXmlGZipB64 ||
    req.body.dps_xml_gzip_b64 ||
    req.body.xmlGZipB64 ||
    req.body.xml_gzip_b64 ||
    null

  const { pfx_base64, pfx_senha, ambiente } = req.body

  if (!xml_dps && !ja_comprimido) {
    return res.status(400).json({
      error: 'Nenhum campo XML encontrado',
      campos_recebidos: Object.keys(req.body || {}),
    })
  }

  if (!pfx_base64) {
    return res.status(400).json({
      error: 'pfx_base64 não recebido',
      campos_recebidos: Object.keys(req.body || {}),
    })
  }

  try {
    const dpsXmlGZipB64 = ja_comprimido || xmlToGzipB64(xml_dps)
    const body = JSON.stringify({ dpsXmlGZipB64 })

    const r = await httpsRequest(`${getBase(ambiente)}/nfse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /dps/:idDPS → GET /SefinNacional/sdps/{id}
app.get('/dps/:idDPS', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${getBase(ambiente)}/sdps/${req.params.idDPS}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /nfse/:chave → GET /SefinNacional/nfse/{chave}
app.get('/nfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${getBase(ambiente)}/nfse/${req.params.chave}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /evento → gzip+base64 → JSON → POST /SefinNacional/nfse/{chave}/eventos
app.post('/evento', async (req, res) => {
  const xml_evento =
    req.body.xml_evento ||
    req.body.evento ||
    req.body.xml ||
    null

  const ja_comprimido =
    req.body.eventoXmlGZipB64 ||
    req.body.evento_xml_gzip_b64 ||
    null

  const { chave_acesso, pfx_base64, pfx_senha, ambiente } = req.body

  if (!xml_evento && !ja_comprimido) {
    return res.status(400).json({
      error: 'Nenhum campo XML de evento encontrado',
      campos_recebidos: Object.keys(req.body || {}),
    })
  }

  try {
    const eventoXmlGZipB64 = ja_comprimido || xmlToGzipB64(xml_evento)
    const body = JSON.stringify({ eventoXmlGZipB64 })

    const r = await httpsRequest(`${getBase(ambiente)}/nfse/${chave_acesso}/eventos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /danfse/:chave → GET /SefinNacional/nfse/{chave}/danfse
app.get('/danfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${getBase(ambiente)}/nfse/${req.params.chave}/danfse`, {
      method: 'GET',
      headers: { 'Accept': 'application/pdf' },
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).type('application/pdf').send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(process.env.PORT || 3001, () =>
  console.log(`nfse-proxy rodando na porta ${process.env.PORT || 3001}`)
)
