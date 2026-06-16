import 'dotenv/config'
import express from 'express'
import https from 'https'
import { URL } from 'url'

const app = express()
app.use(express.json({ limit: '10mb' }))

const TOKEN = process.env.INTERNAL_TOKEN

app.use((req, res, next) => {
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

function httpsRequest(urlStr, { method = 'GET', headers = {}, body, pfx_base64, pfx_senha }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers,
      pfx: Buffer.from(pfx_base64, 'base64'),
      passphrase: pfx_senha,
      rejectUnauthorized: true,
    }

    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
      }))
    })

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// POST /dps → POST /SefinNacional/nfse
app.post('/dps', async (req, res) => {
  const { xml_dps, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const r = await httpsRequest(`${getBase(ambiente)}/nfse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
      },
      body: xml_dps,
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
      headers: { 'Accept': 'application/xml' },
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
      headers: { 'Accept': 'application/xml' },
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /evento → POST /SefinNacional/nfse/{chave}/eventos
app.post('/evento', async (req, res) => {
  const { xml_evento, chave_acesso, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const r = await httpsRequest(`${getBase(ambiente)}/nfse/${chave_acesso}/eventos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
      },
      body: xml_evento,
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
