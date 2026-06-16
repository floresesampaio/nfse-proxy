import 'dotenv/config'
import express from 'express'
import https from 'https'
import fetch from 'node-fetch'

const app = express()
app.use(express.json({ limit: '10mb' }))

const TOKEN = process.env.INTERNAL_TOKEN

app.use((req, res, next) => {
  if (req.headers['x-internal-token'] !== TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  next()
})

app.get('/health', (req, res) => res.json({ ok: true }))

function buildAgent(pfxBase64, senha) {
  return new https.Agent({
    pfx: Buffer.from(pfxBase64, 'base64'),
    passphrase: senha,
    rejectUnauthorized: true,
  })
}

function baseUrl(ambiente) {
  return ambiente === 'producao'
    ? 'https://sefin.nfse.gov.br/SefinNacional'
    : 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional'
}

// Enviar DPS
app.post('/dps', async (req, res) => {
  const { xml_dps, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const agent = buildAgent(pfx_base64, pfx_senha)
    const r = await fetch(`${baseUrl(ambiente)}/nfse/dps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml_dps,
      agent,
    })
    res.status(r.status).send(await r.text())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Consultar DPS
app.get('/dps/:idDPS', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const agent = buildAgent(pfx_base64, pfx_senha)
    const r = await fetch(`${baseUrl(ambiente)}/nfse/dps/${req.params.idDPS}`, { agent })
    res.status(r.status).send(await r.text())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Consultar NFS-e
app.get('/nfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const agent = buildAgent(pfx_base64, pfx_senha)
    const r = await fetch(`${baseUrl(ambiente)}/nfse/${req.params.chave}`, { agent })
    res.status(r.status).send(await r.text())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Cancelamento / eventos
app.post('/evento', async (req, res) => {
  const { xml_evento, pfx_base64, pfx_senha, ambiente } = req.body
  try {
    const agent = buildAgent(pfx_base64, pfx_senha)
    const r = await fetch(`${baseUrl(ambiente)}/nfse/evento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml_evento,
      agent,
    })
    res.status(r.status).send(await r.text())
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DANFSE
app.get('/danfse/:chave', async (req, res) => {
  const { pfx_base64, pfx_senha, ambiente } = req.query
  try {
    const agent = buildAgent(pfx_base64, pfx_senha)
    const r = await fetch(`${baseUrl(ambiente)}/danfse/${req.params.chave}`, { agent })
    res.status(r.status).type('application/pdf').send(Buffer.from(await r.arrayBuffer()))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(process.env.PORT || 3001, () =>
  console.log(`nfse-proxy rodando na porta ${process.env.PORT || 3001}`)
)
