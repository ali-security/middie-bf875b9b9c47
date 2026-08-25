'use strict'

// Original Fastify test/middlewares.test.js file

const t = require('tap')
const test = t.test
const sget = require('simple-get').concat
const fastify = require('fastify')
const fp = require('fastify-plugin')
const cors = require('cors')
const helmet = require('helmet')
const fs = require('node:fs')

const middiePlugin = require('../index')

test('use a middleware', t => {
  t.plan(7)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      const useRes = instance.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })

      t.equal(useRes, instance)
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-length'], '' + body.length)
      t.same(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('use cors', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.equal(response.headers['access-control-allow-origin'], '*')
    })
  })
})

test('use helmet', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(helmet())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.ok(response.headers['x-xss-protection'])
    })
  })
})

test('use helmet and cors', t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
      instance.use(helmet())
    })

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    t.error(err)

    t.teardown(instance.server.close.bind(instance.server))

    sget({
      method: 'GET',
      url: 'http://localhost:' + instance.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.ok(response.headers['x-xss-protection'])
      t.equal(response.headers['access-control-allow-origin'], '*')
    })
  })
})

test('middlewares with prefix', t => {
  t.plan(5)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        req.global = true
        next()
      })
      instance.use('', function (req, res, next) {
        req.global2 = true
        next()
      })
      instance.use('/', function (req, res, next) {
        req.root = true
        next()
      })
      instance.use('/prefix', function (req, res, next) {
        req.prefixed = true
        next()
      })
      instance.use('/prefix/', function (req, res, next) {
        req.slashed = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      prefixed: request.raw.prefixed,
      slashed: request.raw.slashed,
      global: request.raw.global,
      global2: request.raw.global2,
      root: request.raw.root
    })
  }

  instance.get('/', handler)
  instance.get('/prefix', handler)
  instance.get('/prefix/', handler)
  instance.get('/prefix/inner', handler)

  instance.listen({ port: 0 }, err => {
    t.error(err)
    t.teardown(instance.server.close.bind(instance.server))

    t.test('/', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          global: true,
          global2: true,
          root: true
        })
      })
    })

    t.test('/prefix', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          global: true,
          global2: true,
          root: true,
          slashed: true
        })
      })
    })

    t.test('/prefix/', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix/',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          slashed: true,
          global: true,
          global2: true,
          root: true
        })
      })
    })

    t.test('/prefix/inner', t => {
      t.plan(2)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/prefix/inner',
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.same(body, {
          prefixed: true,
          slashed: true,
          global: true,
          global2: true,
          root: true
        })
      })
    })
  })
})

test('middlewares for encoded paths', t => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use('/encoded', function (req, res, next) {
        req.slashed = true
        next()
      })
      instance.use('/%65ncoded', function (req, res, next) {
        req.slashedSpecial = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      slashed: request.raw.slashed,
      slashedSpecial: request.raw.slashedSpecial
    })
  }

  instance.get('/encoded', handler)
  instance.get('/%65ncoded', handler)

  instance.listen({ port: 0 }, err => {
    t.error(err)
    t.teardown(instance.server.close.bind(instance.server))

    t.test('decode the request url and run the middleware', t => {
      t.plan(3)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/%65ncod%65d', // '/encoded'
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(body, { slashed: true })
      })
    })

    t.test('does not double decode the url', t => {
      t.plan(3)
      sget({
        method: 'GET',
        url: 'http://localhost:' + instance.server.address().port + '/%2565ncoded', // '/%65ncoded'
        json: true
      }, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(body, { slashedSpecial: true })
      })
    })
  })
})

test('res.end should block middleware execution', t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        res.end('hello')
      })

      instance.use(function (req, res, next) {
        t.fail('we should not be here')
      })
    })

  instance.addHook('onRequest', (req, res, next) => {
    t.ok('called')
    next()
  })

  instance.addHook('preHandler', (req, reply, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onSend', (req, reply, payload, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onResponse', (request, reply, next) => {
    t.ok('called')
    next()
  })

  instance.get('/', function (request, reply) {
    t.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.payload, 'hello')
  })
})

test('middlewares should be able to respond with a stream', t => {
  t.plan(4)

  const instance = fastify()

  instance.addHook('onRequest', (req, res, next) => {
    t.ok('called')
    next()
  })

  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, res, next) {
        const stream = fs.createReadStream(process.cwd() + '/test/middleware.test.js', 'utf8')
        stream.pipe(res)
        res.once('finish', next)
      })

      instance.use(function (req, res, next) {
        t.fail('we should not be here')
      })
    })

  instance.addHook('preHandler', (req, reply, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onSend', (req, reply, payload, next) => {
    t.fail('this should not be called')
  })

  instance.addHook('onResponse', (request, reply, next) => {
    t.ok('called')
    next()
  })

  instance.get('/', function (request, reply) {
    t.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
  })
})

test('Use a middleware inside a plugin after an encapsulated plugin', t => {
  t.plan(4)
  const f = fastify()
  f.register(middiePlugin)

  f.register(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.ok('first middleware called')
      next()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    next()
  })

  f.register(fp(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.ok('second middleware called')
      next()
    })

    next()
  }))

  f.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.same(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('middlewares should run in the order in which they are defined', t => {
  t.plan(9)
  const f = fastify()
  f.register(middiePlugin)

  f.register(fp(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.equal(req.previous, undefined)
      req.previous = 1
      next()
    })

    instance.register(fp(function (i, opts, next) {
      i.use(function (req, res, next) {
        t.equal(req.previous, 2)
        req.previous = 3
        next()
      })
      next()
    }))

    instance.use(function (req, res, next) {
      t.equal(req.previous, 1)
      req.previous = 2
      next()
    })

    next()
  }))

  f.register(function (instance, opts, next) {
    instance.use(function (req, res, next) {
      t.equal(req.previous, 3)
      req.previous = 4
      next()
    })

    instance.get('/', function (request, reply) {
      t.equal(request.raw.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, next) {
      i.use(function (req, res, next) {
        t.equal(req.previous, 4)
        req.previous = 5
        next()
      })
      next()
    }))

    next()
  })

  f.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.same(JSON.parse(res.payload), { hello: 'world' })
  })
})

// The `onRegister` hook re-registers the inherited middlewares on the new scope.
// Doing that through the public `use` prepends the prefix of the new scope to a
// path that already carries the prefix of the scope it was registered on, so an
// inherited `use('/admin')` guard moved to `/admin/admin` and stopped running
// for the routes of a child scope registered with the `/admin` prefix.
test('should not double-prefix inherited middleware paths in child scopes', async t => {
  t.plan(4)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.get('/admin/root-data', async function () {
    return { data: 'root-secret' }
  })

  instance.register(function (child, opts, next) {
    child.get('/secret', async function () {
      return { data: 'child-secret' }
    })

    next()
  }, { prefix: '/admin' })

  const rootNoAuth = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(rootNoAuth.statusCode, 403)

  const childNoAuth = await instance.inject({ method: 'GET', url: '/admin/secret' })
  t.equal(childNoAuth.statusCode, 403)

  const childWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/secret',
    headers: { authorization: 'Bearer test' }
  })

  t.equal(childWithAuth.statusCode, 200)
  t.same(JSON.parse(childWithAuth.payload), { data: 'child-secret' })
})

test('should allow child scopes register middleware with same prefix', async t => {
  t.plan(7)

  const instance = fastify()
  t.teardown(() => instance.close())

  const count = { admin: 0, child: 0 }

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        count.admin++
        next()
      })
    })

  instance.get('/admin/root-data', async function () {
    return { data: 'admin' }
  })

  instance.register(function (child, opts, next) {
    child.use('/admin', function (req, res, next) {
      count.child++
      next()
    })

    child.get('/secret', async function () {
      return { data: 'child' }
    })

    child.get('/admin', async function () {
      return { data: 'child-admin' }
    })

    next()
  }, { prefix: '/admin' })

  const root = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(root.statusCode, 200)
  t.same(JSON.parse(root.payload), { data: 'admin' })

  const child = await instance.inject({ method: 'GET', url: '/admin/secret' })
  t.equal(child.statusCode, 200)
  t.same(JSON.parse(child.payload), { data: 'child' })

  const childAdmin = await instance.inject({ method: 'GET', url: '/admin/admin' })
  t.equal(childAdmin.statusCode, 200)
  t.same(JSON.parse(childAdmin.payload), { data: 'child-admin' })

  t.same(count, { admin: 3, child: 1 })
})

test('should enforce inherited middleware in nested grandchild scopes', async t => {
  t.plan(6)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.get('/admin/root-data', async function () {
    return { data: 'root-secret' }
  })

  instance.register(function (parent, opts, next) {
    parent.get('/info', async function () {
      return { data: 'parent-info' }
    })

    parent.register(function (grandchild, opts, next) {
      grandchild.get('/deep', async function () {
        return { data: 'nested-secret' }
      })

      next()
    }, { prefix: '/sub' })

    next()
  }, { prefix: '/admin' })

  const rootNoAuth = await instance.inject({ method: 'GET', url: '/admin/root-data' })
  t.equal(rootNoAuth.statusCode, 403)

  const parentNoAuth = await instance.inject({ method: 'GET', url: '/admin/info' })
  t.equal(parentNoAuth.statusCode, 403)

  const grandchildNoAuth = await instance.inject({ method: 'GET', url: '/admin/sub/deep' })
  t.equal(grandchildNoAuth.statusCode, 403)

  const grandchildWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/sub/deep',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(grandchildWithAuth.statusCode, 200)
  t.same(JSON.parse(grandchildWithAuth.payload), { data: 'nested-secret' })

  const parentWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/info',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(parentWithAuth.statusCode, 200)
})

test('should enforce inherited middleware across three nesting levels', async t => {
  t.plan(3)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/api', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.register(function (l1, opts, next) {
    l1.register(function (l2, opts, next) {
      l2.register(function (l3, opts, next) {
        l3.get('/resource', async function () {
          return { data: 'deep-resource' }
        })

        next()
      }, { prefix: '/c' })

      next()
    }, { prefix: '/b' })

    next()
  }, { prefix: '/api/a' })

  const noAuth = await instance.inject({ method: 'GET', url: '/api/a/b/c/resource' })
  t.equal(noAuth.statusCode, 403)

  const withAuth = await instance.inject({
    method: 'GET',
    url: '/api/a/b/c/resource',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(withAuth.statusCode, 200)
  t.same(JSON.parse(withAuth.payload), { data: 'deep-resource' })
})

test('should not apply middleware to unrelated nested prefixes', async t => {
  t.plan(4)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.register(function (child, opts, next) {
    child.get('/data', async function () {
      return { data: 'public' }
    })

    child.register(function (grandchild, opts, next) {
      grandchild.get('/info', async function () {
        return { data: 'public-nested' }
      })

      next()
    }, { prefix: '/nested' })

    next()
  }, { prefix: '/public' })

  const publicData = await instance.inject({ method: 'GET', url: '/public/data' })
  t.equal(publicData.statusCode, 200)
  t.same(JSON.parse(publicData.payload), { data: 'public' })

  const publicNested = await instance.inject({ method: 'GET', url: '/public/nested/info' })
  t.equal(publicNested.statusCode, 200)
  t.same(JSON.parse(publicNested.payload), { data: 'public-nested' })
})

test('should not apply middleware when prefix shares string prefix but not path segment', async t => {
  t.plan(4)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.register(function (child, opts, next) {
    child.get('/settings', async function () {
      return { data: 'panel-settings' }
    })

    next()
  }, { prefix: '/admin-panel' })

  instance.register(function (child, opts, next) {
    child.get('/settings', async function () {
      return { data: 'admin-settings' }
    })

    next()
  }, { prefix: '/admin/real' })

  const panelNoAuth = await instance.inject({ method: 'GET', url: '/admin-panel/settings' })
  t.equal(panelNoAuth.statusCode, 200)
  t.same(JSON.parse(panelNoAuth.payload), { data: 'panel-settings' })

  const realNoAuth = await instance.inject({ method: 'GET', url: '/admin/real/settings' })
  t.equal(realNoAuth.statusCode, 403)

  const realWithAuth = await instance.inject({
    method: 'GET',
    url: '/admin/real/settings',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(realWithAuth.statusCode, 200)
})

test('should enforce middleware with partial prefix overlap in nested scopes', async t => {
  t.plan(3)

  const instance = fastify()
  t.teardown(() => instance.close())

  instance.register(middiePlugin)
    .after(() => {
      instance.use('/admin', function (req, res, next) {
        if (req.headers.authorization == null) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }

        next()
      })
    })

  instance.register(function (child, opts, next) {
    child.register(function (grandchild, opts, next) {
      grandchild.get('/settings', async function () {
        return { data: 'admin-settings' }
      })

      next()
    }, { prefix: '/panel' })

    next()
  }, { prefix: '/admin' })

  const noAuth = await instance.inject({ method: 'GET', url: '/admin/panel/settings' })
  t.equal(noAuth.statusCode, 403)

  const withAuth = await instance.inject({
    method: 'GET',
    url: '/admin/panel/settings',
    headers: { authorization: 'Bearer test' }
  })
  t.equal(withAuth.statusCode, 200)
  t.same(JSON.parse(withAuth.payload), { data: 'admin-settings' })
})
