import http from 'node:http'
import https from 'node:https'
import {parse} from 'node:url'

import { makeDeferred } from './util.js'

export const request = async (opts) => {
  const {url, method = 'GET', postData, pipe, followRedirects, timeout = 30_000} = opts
  const {
    protocol,
    isSecure = protocol === 'https:',
    path = '/',
    host,
    hostname,
    port = isSecure ? 443 : 80,
    lib = isSecure ? https : http
  } = parse(url)

  const {promise, resolve, reject} = makeDeferred()

  const params = {
    method,
    host: hostname,
    port,
    path,
    timeout,
    headers: {...pipe?.req?.headers, host },
  }

  const req = lib.request(params, res => {
    res.req = req
    req.res = res
    const statusCode = res.statusCode

    if (statusCode < 200 || statusCode >= 300) {
      if (statusCode === 302 && followRedirects && res.headers.location) {
        return request({
          ...opts,
          url: res.headers.location
        }).then(resolve, reject)
      }

      const err = new Error(`HTTP ${res.statusCode} ${host}${path} ${res.statusMessage}`)
      Object.defineProperty(err, 'res', {enumerable: false, value: res})

      return reject(err)
    }

    const data = []

    res.on('error', reject)
    res.on('data', chunk => data.push(chunk))
    res.on('end', () => {
      Object.assign(res, {
        buffer: Buffer.concat(data),
        get body() { return this.buffer.toString() }
      })
      resolve(res)
    })

    if (pipe) {
      pipe.res.writeHead(res.statusCode, res.headers);
      res.pipe(pipe.res, { end: true })
    }
  })
  req.on('error', reject)
  req.on('timeout', () => {
    req.destroy()
  })

  promise.req = req

  if (pipe) {
    pipe.req.on('error', reject)
    pipe.req.pipe(req, { end: true })// .pipe(pipe.res)

  } else {
    if (postData) {
      req.write(postData)
    }
    req.end()
  }

  return promise
}
