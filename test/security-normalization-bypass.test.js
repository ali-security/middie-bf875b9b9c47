'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /secret guard' }))
    return
  }
  next()
}

// Fastify v4 exposes the router options as top level options, Fastify v5 groups
// them under `routerOptions`.
function buildWithMiddieHook (hook) {
  const app = Fastify({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
    useSemicolonDelimiter: true
  })

  return { app, register: () => app.register(middiePlugin, hook ? { hook } : undefined) }
}

test('baseline: /secret is blocked without API key when guarded via middie use(/secret)', async t => {
  t.plan(2)

  const { app, register } = buildWithMiddieHook()
  t.teardown(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const res = await app.inject({ method: 'GET', url: '/secret' })
  const trailing = await app.inject({ method: 'GET', url: '/secret/' })
  t.equal(res.statusCode, 401)
  t.equal(trailing.statusCode, 401)
})

test('regression: crafted paths are blocked by middie use(/secret) under default onRequest hook', async t => {
  t.plan(4)

  const { app, register } = buildWithMiddieHook('onRequest')
  t.teardown(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async (request) => ({ ok: true, route: '/secret', url: request.raw.url }))

  const baseline = await app.inject({ method: 'GET', url: '/secret' })
  t.equal(baseline.statusCode, 401)

  const duplicateSlash = await app.inject({ method: 'GET', url: '//secret' })
  t.equal(duplicateSlash.statusCode, 401)

  const semicolonVariant = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  t.equal(semicolonVariant.statusCode, 401)

  const trailingSlash = await app.inject({ method: 'GET', url: '/secret/' })
  t.equal(trailingSlash.statusCode, 401)
})

test('mitigation: registering middie with hook preValidation makes use(/secret) auth block crafted variants', async t => {
  t.plan(4)

  const { app, register } = buildWithMiddieHook('preValidation')
  t.teardown(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const r1 = await app.inject({ method: 'GET', url: '/secret' })
  const r2 = await app.inject({ method: 'GET', url: '//secret' })
  const r3 = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  const r4 = await app.inject({ method: 'GET', url: '/secret/' })

  t.equal(r1.statusCode, 401)
  t.equal(r2.statusCode, 401)
  t.equal(r3.statusCode, 401)
  t.equal(r4.statusCode, 401)
})

test('mitigation: registering middie with hook preHandler makes use(/secret) auth block crafted variants', async t => {
  t.plan(4)

  const { app, register } = buildWithMiddieHook('preHandler')
  t.teardown(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const r1 = await app.inject({ method: 'GET', url: '/secret' })
  const r2 = await app.inject({ method: 'GET', url: '//secret' })
  const r3 = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  const r4 = await app.inject({ method: 'GET', url: '/secret/' })

  t.equal(r1.statusCode, 401)
  t.equal(r2.statusCode, 401)
  t.equal(r3.statusCode, 401)
  t.equal(r4.statusCode, 401)
})
