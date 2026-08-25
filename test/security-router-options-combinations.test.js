'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

const variants = [
  '/secret',
  '//secret',
  '/secret/',
  '/secret?x=1',
  '/secret;foo=bar',
  '/secret;foo=bar?x=1',
  '//secret;foo=bar',
  '//secret//',
  '/%2fsecret',
  '/%2Fsecret',
  '/secret%2F'
]

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /secret guard' }))
    return
  }
  next()
}

function comboLabel (routerOptions) {
  return `dup=${routerOptions.ignoreDuplicateSlashes},trail=${routerOptions.ignoreTrailingSlash},semi=${routerOptions.useSemicolonDelimiter}`
}

function allRouterOptionCombinations () {
  const result = []
  for (const ignoreDuplicateSlashes of [false, true]) {
    for (const ignoreTrailingSlash of [false, true]) {
      for (const useSemicolonDelimiter of [false, true]) {
        result.push({ ignoreDuplicateSlashes, ignoreTrailingSlash, useSemicolonDelimiter })
      }
    }
  }
  return result
}

// Which variants the bare router routes to the `/secret` handler for a given
// set of router options. Every one of those MUST also reach the middie guard.
async function controlStatusCodes (routerOptions) {
  const plain = Fastify(routerOptions)
  plain.get('/secret', async () => ({ ok: true, app: 'plain' }))

  const statusCodes = {}
  for (const url of variants) {
    const res = await plain.inject({ method: 'GET', url })
    statusCodes[url] = res.statusCode
  }

  await plain.close()
  return statusCodes
}

test('router option combinations: crafted variants never bypass middie use(/secret) guard', async t => {
  // Fastify v4 exposes the router options as top level options, Fastify v5
  // groups them under `routerOptions`.
  t.setTimeout(120000)

  const hooks = [undefined, 'onRequest', 'preValidation', 'preHandler']

  for (const routerOptions of allRouterOptionCombinations()) {
    const control = await controlStatusCodes(routerOptions)

    for (const hook of hooks) {
      const guarded = Fastify(routerOptions)

      await guarded.register(middiePlugin, hook ? { hook } : undefined)
      guarded.use('/secret', guardMiddie)

      guarded.get('/secret', async () => ({ ok: true, app: 'guarded' }))

      for (const url of variants) {
        const secured = await guarded.inject({ method: 'GET', url })

        t.not(
          secured.statusCode,
          200,
          `hook=${hook || 'default'} ${comboLabel(routerOptions)} url=${url} should never bypass auth as 200`
        )

        if (control[url] === 200) {
          t.equal(
            secured.statusCode,
            401,
            `hook=${hook || 'default'} ${comboLabel(routerOptions)} url=${url} matches route; middie must block`
          )
        }
      }

      await guarded.close()
    }
  }
})
