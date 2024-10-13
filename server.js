import express from 'express'
import enableWs from 'express-ws'
import Redis from 'ioredis'
import { ReJSON } from 'redis-modules-sdk'
import { promises as fs } from 'fs'
import * as https from 'https'
import * as http from 'http'

(async () => {
  const Finals = Object.freeze({
    OPPONENT_DISCONNECTED: 0,
    WIN: 1,
    LOSE: 2
  })
  const app = express()

  app.use(express.static('www'))

  let redisURI = new URL(process.env.REDIS_URI || 'redis://localhost')
  const db = new Redis(redisURI.href)
  let cleanup = (async () => {
    const keys = await db.keys('?????')
    if (keys.length !== 0) {
      await db.del(...keys)
    }
  })()
  const jsonDB = new ReJSON(redisURI.href)
  let connect = jsonDB.connect()

  const endpoints = {}

  const checkAuth = async (token, ws) => {
    if (!(await db.sismember('tokens', token))) {
      if (ws !== undefined) { ws.send(JSON.stringify({ result: 'auth_error' })) }
      return false
    }
    return true
  }

  await Promise.all([cleanup, connect])
  connect = undefined
  cleanup = undefined
  redisURI = undefined

  const update = async (reqData, ws) => {
    if (!(await checkAuth(reqData.token, ws))) return
    let currentMove, members, poped, final
    const popedXY = []
    let valid = true
    const parsePromises = [jsonDB.get(reqData.game, '.poped').then(r => { poped = JSON.parse(r) }),
      jsonDB.get(reqData.game, '.move').then(r => { currentMove = parseInt(r) }),
      jsonDB.get(reqData.game, '.members').then(r => { members = JSON.parse(r) })]
    await parsePromises[0]
    for (const [i, p] of reqData.poped.entries()) {
      if (poped.includes(p)) {
        valid = false
        break
      }
      popedXY.push({ x: p % 6, y: Math.floor(p / 6) })
      if (i > 0 && (Math.abs(popedXY[i - 1].x - popedXY[i].x) > 1 || Math.abs(popedXY[i - 1].y - popedXY[i].y) > 1)) {
        valid = false
        break
      }
    }
    await Promise.all(parsePromises.slice(-2))
    if (members[currentMove] !== reqData.token) { valid = false }
    if (!valid) {
      ws.send(JSON.stringify({ move: currentMove }))
      return
    }
    poped.push(...reqData.poped)
    currentMove = currentMove ? 0 : 1
    const setPromises = [jsonDB.set(reqData.game, '.poped', JSON.stringify(poped)),
      jsonDB.set(reqData.game, '.move', currentMove)]
    if (poped.length === 35) {
      final = Finals.LOSE
    } else if (poped.length === 36) {
      final = Finals.WIN
    }
    let c = 0
    const game = {
      move: currentMove,
      poped,
      final
    }
    for (const wsKey of Object.keys(endpoints)) {
      if (c === 2) { break }
      if (members.includes(wsKey)) {
        c++
        if (endpoints[wsKey] === ws) {
          if (game.final !== undefined) {
            final = game.final === Finals.WIN ? Finals.LOSE : Finals.WIN
          } else {
            final = undefined
          }
          endpoints[wsKey].send(JSON.stringify({ ...game, final }))
        } else {
          endpoints[wsKey].send(JSON.stringify(game))
        }
      }
    }
    await Promise.all(setPromises)
    if (game.final !== undefined) {
      await db.del(reqData.game)
    }
  }

  const getGame = async (reqData, ws) => {
    if (!(await checkAuth(reqData.token, ws))) return
    let gameToken, game
    if (reqData.gameToken !== undefined) {
      const fail = () => ws.send(JSON.stringify({ error: '<span style="color:red">Неправильный токен!</span>' }))
      gameToken = reqData.gameToken
      if (gameToken.length !== 5) { return fail() }
      game = await jsonDB.get(gameToken, '.')
      if (game === null) { return fail() }
      game = JSON.parse(game)
      game.members.push(reqData.token)
      game.started = true
    } else {
      const dbKeys = (await db.keys('?????'))
      if (dbKeys.length !== 0) {
        for (const [i, started] of (await jsonDB.mget(dbKeys, '.started')).entries()) {
          if (JSON.parse(started)) {
            continue
          }
          game = JSON.parse(await jsonDB.get(dbKeys[i], '.'))
          if (game === null || game.members[0] === reqData.token) {
            continue
          }
          gameToken = dbKeys[i]
          game.members.push(reqData.token)
          game.started = true
          break
        }
      }
    }
    if (gameToken === undefined) {
      do { gameToken = Math.random().toString(36).slice(-5) }
      while (await jsonDB.objlen(gameToken) !== null)
      game = { started: false, members: [reqData.token], poped: [], move: 0 }
    }
    const setGame = jsonDB.set(gameToken, '.', JSON.stringify(game))
    for (const wsKey of Object.keys(endpoints)) {
      if (!game.members.includes(wsKey)) {
        continue
      }
      endpoints[wsKey].send(JSON.stringify({
        started: game.started,
        poped: game.poped,
        move: 0,
        you: game.members.indexOf(wsKey),
        token: gameToken
      }))
    }
    await setGame
  }

  const auth = async (reqData, ws) => {
    const genNewToken = async () => {
      let newToken
      do {
        newToken = ''
        for (let i = 0; i < 2; i++) { newToken += Math.random().toString(36).substring(2) }
      } while (await db.sismember('tokens', newToken))
      const addToken = db.sadd('tokens', newToken)
      endpoints[newToken] = ws
      ws.send(JSON.stringify({ result: newToken }))
      await addToken
    }
    if (reqData.token !== undefined) {
      if (!(await checkAuth(reqData.token))) {
        genNewToken()
      } else {
        ws.send(JSON.stringify({ result: reqData.token }))
        endpoints[reqData.token] = ws
      }
      return
    }
    genNewToken()
  }

  const wsHandler = (ws) => {
    ws.on('message', async (msg) => {
      const reqData = JSON.parse(msg)
      switch (reqData.method) {
        case 'update':
          await update(reqData, ws)
          break
        case 'get_game':
          await getGame(reqData, ws)
          break
        case 'auth':
          await auth(reqData, ws)
          break
      }
    })
    ws.on('close', async () => {
      for (const [key, e] of Object.entries(endpoints)) {
        if (e !== ws) {
          continue
        }
        const dbKeys = await db.keys('?????')
        if (dbKeys.length === 0) {
          continue
        }
        for (let [i, members] of (await jsonDB.mget(dbKeys, '.members')).entries()) {
          members = JSON.parse(members)
          if (!members.includes(key)) {
            continue
          }
          members = members.filter(member => member !== key)
          for (const member of members) {
            endpoints[member].send(JSON.stringify({ final: Finals.OPPONENT_DISCONNECTED }))
          }
          db.del(dbKeys[i])
        }
      }
    })
  }
  let server
  if (process.env.SSL_PRIV && process.env.SSL_PUB) {
    const keys = await Promise.all([fs.readFile(process.env.SSL_PRIV), fs.readFile(process.env.SSL_CERT)])
    server = https.createServer({
      key: keys[0],
      cert: keys[1]
    }, app)
  } else {
    server = http.createServer(app)
  }
  enableWs(app, server)
  app.ws('/ws', wsHandler)
  server.listen(3000)
})()
