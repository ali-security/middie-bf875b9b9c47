'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')

function middie (complete, options = {}) {
  const middlewares = []
  const pool = reusify(Holder)
  const ignoreDuplicateSlashes = options.ignoreDuplicateSlashes === true
  const useSemicolonDelimiter = options.useSemicolonDelimiter === true
  const ignoreTrailingSlash = options.ignoreTrailingSlash === true
  const normalizationOptions = {
    ignoreDuplicateSlashes,
    useSemicolonDelimiter,
    ignoreTrailingSlash
  }

  return {
    use,
    run
  }

  function use (url, f) {
    if (f === undefined) {
      f = url
      url = null
    }

    let regexp
    if (url) {
      regexp = pathToRegexp(sanitizePrefixUrl(url), [], {
        end: false,
        strict: true
      })
    }

    if (Array.isArray(f)) {
      for (const val of f) {
        middlewares.push({
          regexp,
          fn: val
        })
      }
    } else {
      middlewares.push({
        regexp,
        fn: f
      })
    }

    return this
  }

  function run (req, res, ctx) {
    if (!middlewares.length) {
      complete(null, req, res, ctx)
      return
    }

    req.originalUrl = req.url

    const holder = pool.get()
    holder.req = req
    holder.res = res
    const sanitized = sanitizeUrl(req.url)
    holder.normalizedUrl = normalizePathForMatching(sanitized, normalizationOptions)
    holder.sanitizedUrl = sanitized
    holder.urlSuffix = req.url.slice(sanitized.length)
    holder.context = ctx
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.normalizedUrl = null
    this.sanitizedUrl = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const normalizedUrl = that.normalizedUrl
      const sanitizedUrl = that.sanitizedUrl
      const urlSuffix = that.urlSuffix
      const context = that.context
      const i = that.i++

      req.url = req.originalUrl

      if (res.finished === true || res.writableEnded === true) {
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.sanitizedUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
        return
      }

      if (err || middlewares.length === i) {
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.sanitizedUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        const regexp = middleware.regexp
        if (regexp) {
          const result = regexp.exec(normalizedUrl)
          if (result) {
            const origResult = regexp.exec(sanitizedUrl)
            if (origResult) {
              req.url = sanitizedUrl.slice(origResult[0].length)
              if (ignoreDuplicateSlashes) {
                req.url = removeDuplicateSlashes(req.url)
              }
              if (ignoreTrailingSlash) {
                req.url = trimLastSlash(req.url)
              }
            } else {
              req.url = normalizedUrl.slice(result[0].length)
            }
            if (req.url[0] !== '/') {
              req.url = '/' + req.url
            }
            req.url = req.url + urlSuffix
            fn(req, res, that.done)
          } else {
            that.done()
          }
        } else {
          fn(req, res, that.done)
        }
      }
    }
  }
}

function sanitizeUrl (url) {
  /* eslint-disable-next-line no-var */
  for (var i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

function sanitizePrefixUrl (url) {
  if (url === '') return url
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

// The middleware prefix must be matched against the very same path the router
// matches the route against, otherwise a crafted url (eg `//secret`,
// `/secret;foo=bar` or `/secret/`) would be routed to the `/secret` handler
// while skipping the `use('/secret')` middleware guarding it.
// Mirrors the normalization order of find-my-way's `Router.prototype.find`.
function normalizePathForMatching (url, options) {
  let path = url

  if (options.ignoreDuplicateSlashes) {
    path = removeDuplicateSlashes(path)
  }

  path = sanitizeUrlPath(path, options.useSemicolonDelimiter)

  if (options.ignoreTrailingSlash) {
    path = trimLastSlash(path)
  }

  return path
}

// Ported from find-my-way's `removeDuplicateSlashes`.
function removeDuplicateSlashes (path) {
  return path.indexOf('//') !== -1 ? path.replace(/\/\/+/g, '/') : path
}

// Ported from find-my-way's `trimLastSlash`.
function trimLastSlash (path) {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1)
  }
  return path
}

// The url must be decoded the same way the router decodes it, otherwise
// a percent encoded path (eg `/%61dmin` instead of `/admin`) would not
// match the middleware prefix while still being routed to the handler.
// Ported from find-my-way's url sanitizer (`Router.sanitizeUrlPath`).
function sanitizeUrlPath (url, useSemicolonDelimiter) {
  const decoded = safeDecodeURI(url, useSemicolonDelimiter)
  if (decoded.shouldDecodeParam) {
    return safeDecodeURIComponent(decoded.path)
  }
  return decoded.path
}

function safeDecodeURI (path, useSemicolonDelimiter) {
  let shouldDecode = false
  let shouldDecodeParam = false

  let querystring = ''

  for (let i = 1; i < path.length; i++) {
    const charCode = path.charCodeAt(i)

    if (charCode === 37) {
      const highCharCode = path.charCodeAt(i + 1)
      const lowCharCode = path.charCodeAt(i + 2)

      if (decodeComponentChar(highCharCode, lowCharCode) === null) {
        shouldDecode = true
      } else {
        shouldDecodeParam = true
        // %25 - encoded % char. We need to encode one more time to prevent double decoding
        if (highCharCode === 50 && lowCharCode === 53) {
          shouldDecode = true
          path = path.slice(0, i + 1) + '25' + path.slice(i + 1)
          i += 2
        }
        i += 2
      }
    // The querystring is not part of the path, stop the scan as soon as it starts.
    // Some systems use the semicolon as the querystring delimiter, the router
    // opts into that behaviour through `useSemicolonDelimiter`.
    } else if (charCode === 63 || charCode === 35 || (useSemicolonDelimiter === true && charCode === 59)) {
      querystring = path.slice(i + 1)
      path = path.slice(0, i)
      break
    }
  }
  const decodedPath = shouldDecode ? decodeURI(path) : path
  return { path: decodedPath, querystring, shouldDecodeParam }
}

function safeDecodeURIComponent (uriComponent) {
  const startIndex = uriComponent.indexOf('%')
  if (startIndex === -1) return uriComponent

  let decoded = ''
  let lastIndex = startIndex

  for (let i = startIndex; i < uriComponent.length; i++) {
    if (uriComponent.charCodeAt(i) === 37) {
      const highCharCode = uriComponent.charCodeAt(i + 1)
      const lowCharCode = uriComponent.charCodeAt(i + 2)

      const decodedChar = decodeComponentChar(highCharCode, lowCharCode)
      decoded += uriComponent.slice(lastIndex, i) + decodedChar

      lastIndex = i + 3
    }
  }
  return uriComponent.slice(0, startIndex) + decoded + uriComponent.slice(lastIndex)
}

// It must spot all the chars where decodeURIComponent(x) !== decodeURI(x)
// The chars are: # $ & + , / : ; = ? @
function decodeComponentChar (highCharCode, lowCharCode) {
  if (highCharCode === 50) {
    if (lowCharCode === 53) return '%'

    if (lowCharCode === 51) return '#'
    if (lowCharCode === 52) return '$'
    if (lowCharCode === 54) return '&'
    if (lowCharCode === 66) return '+'
    if (lowCharCode === 98) return '+'
    if (lowCharCode === 67) return ','
    if (lowCharCode === 99) return ','
    if (lowCharCode === 70) return '/'
    if (lowCharCode === 102) return '/'
    return null
  }
  if (highCharCode === 51) {
    if (lowCharCode === 65) return ':'
    if (lowCharCode === 97) return ':'
    if (lowCharCode === 66) return ';'
    if (lowCharCode === 98) return ';'
    if (lowCharCode === 68) return '='
    if (lowCharCode === 100) return '='
    if (lowCharCode === 70) return '?'
    if (lowCharCode === 102) return '?'
    return null
  }
  if (highCharCode === 52 && lowCharCode === 48) {
    return '@'
  }
  return null
}

module.exports = middie
