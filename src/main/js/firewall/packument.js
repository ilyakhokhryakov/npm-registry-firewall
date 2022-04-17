import {getDirectives, getPolicy} from './engine.js'
import {request} from '../http/index.js'

export const getPackument = async ({boundContext, rules}) => {
  const {cache, registry, authorization, entrypoint, name} = boundContext
  const key = `packument-${name}`
  const cached = cache?.get(key)

  if (cached) {
    return cached
  }

  const {body, headers} = await request({
    url: `${registry}/${name}`,
    authorization
  })
  const packument = JSON.parse(body)
  const directives = await getDirectives({ packument, rules, boundContext})
  const _packument = patchPackument({ packument, directives, entrypoint, registry })
  const result = {
    directives,
    headers,
    packument: _packument
  }

  cache?.add(key, result)

  return result
}

export const patchVersions = ({packument, directives, entrypoint, registry}) => Object.values(packument.versions).reduce((m, v) => {
  if (getPolicy(directives, v.version) === 'deny') {
    return m
  }
  v.dist.tarball = v.dist.tarball.replace(registry, entrypoint)
  m[v.version] = v
  return m
}, {})

export const patchTime = (time, versions) => Object.entries(time).reduce((m, [k, v]) => {
  if (versions[k]) {
    m[k] = v
  }
  return m
}, {
  created: time.created,
  modified: time.modified,
})

export const patchPackument = ({packument, directives, entrypoint, registry}) => {
  const versions = patchVersions({packument, directives, entrypoint, registry})
  const time = patchTime(packument.time, versions)

  const latestVersion = Object.keys(versions).reduce((m, v) => time[m] > time[v] ? m : v , null);
  const distTags = { latest: latestVersion }
  const latestEntry = versions[latestVersion] || {}

  return {
    ...packument,
    author: latestEntry.author,
    license: latestEntry.license,
    maintainer: latestEntry.maintainer,
    'dist-tags': distTags,
    time,
    versions
  }
}