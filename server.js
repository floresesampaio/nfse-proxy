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

function baseUrl(ambiente) {
  return ambiente === 'producao'
    ? 'https://sefin.nfse.gov.br/SefinNacional'
    : 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional'
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
        headers: res.headers,
        body: Buffer.concat(chunks),
      }))
    })

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// Enviar DPS
app.post('/dps', async (req, res) => {
  const { xml_dps, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const r = await httpsRequest(`${baseUrl(ambiente)}/nfse/dps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml_dps,
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Consultar DPS
app.get('/dps/:idDPS', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${baseUrl(ambiente)}/nfse/dps/${req.params.idDPS}`, {
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Consultar NFS-e
app.get('/nfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${baseUrl(ambiente)}/nfse/${req.params.chave}`, {
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Cancelamento / eventos
app.post('/evento', async (req, res) => {
  const { xml_evento, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const r = await httpsRequest(`${baseUrl(ambiente)}/nfse/evento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml_evento,
      pfx_base64,
      pfx_senha,
    })
    res.status(r.status).send(r.body)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DANFSE / PDF
app.get('/danfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const r = await httpsRequest(`${baseUrl(ambiente)}/danfse/${req.params.chave}`, {
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
