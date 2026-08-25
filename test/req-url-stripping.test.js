'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const middiePlugin = require('../index')

// Fastify v4 exposes the router options as top level options, Fastify v5 groups
// them under `routerOptions`.

test('req.url stripping preserves percent-encoded characters', async t => {
  t.plan(4)

  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/prefix', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/prefix/*', async () => ({ ok: true }))

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/prefix/hello%20world' })
  t.equal(capturedUrl, '/hello%20world', 'percent-encoded space preserved')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/prefix/hello%20world%2Ffoo' })
  t.equal(capturedUrl, '/hello%20world%2Ffoo', 'percent-encoded slash preserved')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/prefix/path%2Fwith%2Fslashes' })
  t.equal(capturedUrl, '/path%2Fwith%2Fslashes', 'multiple percent-encoded slashes preserved')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/prefix/%E4%B8%AD%E6%96%87' })
  t.equal(capturedUrl, '/%E4%B8%AD%E6%96%87', 'percent-encoded unicode preserved')
})

test('req.url stripping with duplicate slashes', async t => {
  t.plan(3)

  const app = Fastify({
    ignoreDuplicateSlashes: true
  })
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/data' })
  t.equal(capturedUrl, '/data', 'normal path should strip to /data')

  // Double slash before - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret/data' })
  t.equal(capturedUrl, '/data', '//secret/data should strip to /data, not //data')

  // Double slash after prefix - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret//data' })
  t.equal(capturedUrl, '/data', '/secret//data should strip to /data, not //data')
})

test('req.url stripping with semicolon delimiter', async t => {
  t.plan(3)

  const app = Fastify({
    useSemicolonDelimiter: true
  })
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret' })
  t.equal(capturedUrl, '/', 'normal path should strip to /')

  // Semicolon variant - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  t.equal(capturedUrl, '/', '/secret;foo=bar should strip to /, not /;foo=bar')

  // Semicolon with path after - note: semicolon delimiter treats everything after ; as params
  // so /secret;foo=bar/data is path=/secret with params, not path=/secret/data
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret;foo=bar/data' })
  t.equal(capturedUrl, '/', '/secret;foo=bar/data has path /secret, strips to /')
})

test('req.url stripping with trailing slash', async t => {
  t.plan(3)

  const app = Fastify({
    ignoreTrailingSlash: true
  })
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret' })
  t.equal(capturedUrl, '/', 'normal path should strip to /')

  // Trailing slash variant
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/' })
  t.equal(capturedUrl, '/', '/secret/ should strip to /')

  // With subpath and trailing slash
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/data/' })
  t.equal(capturedUrl, '/data', '/secret/data/ should strip to /data')
})

test('req.url stripping with all normalization options combined', async t => {
  t.plan(2)

  const app = Fastify({
    ignoreDuplicateSlashes: true,
    useSemicolonDelimiter: true,
    ignoreTrailingSlash: true
  })
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Complex case combining multiple normalizations
  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret;foo=bar/' })
  t.equal(capturedUrl, '/', '//secret;foo=bar/ should strip to /')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret//data//' })
  t.equal(capturedUrl, '/data', '//secret//data// should strip to /data')
})

test('req.url stripping preserves query string', async t => {
  t.plan(3)

  const app = Fastify()
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/api', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/api/resource', async () => ({ ok: true }))

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource?foo=bar' })
  t.equal(capturedUrl, '/resource?foo=bar', 'single query param preserved')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource?foo=bar&baz=qux' })
  t.equal(capturedUrl, '/resource?foo=bar&baz=qux', 'multiple query params preserved')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource?a=1&b=2&c=3' })
  t.equal(capturedUrl, '/resource?a=1&b=2&c=3', 'many query params preserved')
})

test('req.url stripping preserves query string with normalization options', async t => {
  t.plan(2)

  const app = Fastify({
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true
  })
  t.teardown(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret/data', async () => ({ ok: true }))

  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret/data?key=value' })
  t.equal(capturedUrl, '/data?key=value', '//secret/data?key=value preserves query string')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret//data/?key=value' })
  t.equal(capturedUrl, '/data?key=value', '/secret//data/?key=value preserves query string')
})
