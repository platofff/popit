'use strict'
import express from 'express'
import enableWs from 'express-ws'
import Redis from 'ioredis'
import { ReJSON } from 'redis-modules-sdk'

(async () => {
  const Finals = Object.freeze({
    OPPONENT_DISCONNECTED: 0,
    WIN: 1,
    LOSE: 2
  })
  const app = express()

  app.use(express.static('www'))

  enableWs(app)
  let redis_uri = new URL(process.env.REDIS_URI || 'redis://localhost')
  const db = new Redis(redis_uri.href)
  let cleanup = (async () => {
    const keys = await db.keys('?????')
    if (keys.length !== 0) {
      await db.del(...keys)
    }
  })()
  const json_db = new ReJSON(redis_uri.href)
  let connect = json_db.connect()

  let endpoints = {}

  const checkAuth = async (token, ws) => {
    if (!(await db.sismember('tokens', token))) {
      if (ws !== undefined)
        ws.send(JSON.stringify({ result: 'auth_error' }))
      return false
    }
    return true
  }

  await Promise.all([cleanup, connect])
  connect = undefined
  cleanup = undefined
  redis_uri = undefined

  app.ws('/ws', (ws) => {
    ws.on('message', async (msg) => {
      const reqData = JSON.parse(msg)
      let game
      switch (reqData.method) {
        case 'update':
          if (!(await checkAuth(reqData.token, ws))) break
          let currentMove, members, poped, final
          const popedXY = []
          let valid = true
          const parsePromises = [json_db.get(reqData.game, '.poped').then(r => poped = JSON.parse(r)),
          json_db.get(reqData.game, '.move').then(r => currentMove = Number(r)),
          json_db.get(reqData.game, '.members').then(r => members = JSON.parse(r))]
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
          if (members[currentMove] !== reqData.token)
            valid = false
          if (!valid) {
            ws.send(JSON.stringify({ move: currentMove }))
            break
          }
          poped.push(...reqData.poped)
          currentMove = Boolean(currentMove) ? 0 : 1
          const setPromises = [json_db.set(reqData.game, '.poped', JSON.stringify(poped)),
          json_db.set(reqData.game, '.move', currentMove)]
          if (poped.length === 35)
            final = Finals.LOSE
          else if (poped.length === 36)
            final = Finals.WIN
          let c = 0
          game = {
            move: currentMove,
            poped: poped,
            final: final
          }
          for (const wsKey of Object.keys(endpoints)) {
            if (c === 2)
              break
            if (members.includes(wsKey)) {
              c++
              if (endpoints[wsKey] == ws) {
                if (game.final !== undefined)
                  final = game.final === Finals.WIN ? Finals.LOSE : Finals.WIN
                else
                  final = undefined
                endpoints[wsKey].send(JSON.stringify({ ...game, final: final }))
              } else {
                endpoints[wsKey].send(JSON.stringify(game))
              }
            }
          }
          await Promise.all(setPromises)
          if (game.final !== undefined) {
            await db.del(reqData.game)
          }
          break
        case 'get_game':
          if (!(await checkAuth(reqData.token, ws))) break
          let gameToken
          if (reqData.gameToken !== undefined) {
            const fail = () => ws.send(JSON.stringify({ error: 'Invalid token!' }))
            gameToken = reqData.gameToken
            if (gameToken.length !== 5)
              return fail()
            game = await json_db.get(gameToken, '.')
            if (game === null)
              return fail()
            game = JSON.parse(game)
            game.members.push(reqData.token)
            game.started = 1
          } else {
            const keys = (await db.keys('?????'))
            if (keys) {
              for (let [i, started] of await json_db.mget(keys, '.started')) {
                started = Number(started)
                if (started !== 0) {
                  game = JSON.parse(await json_db.get(keys[i], '.'))
                  if (game === null || game.members[0] === reqData.token)
                    break
                  gameToken = keys[i]
                  game.members.push(reqData.token)
                  game.started = 1
                  break
                }
              }
            }
          }
          if (gameToken === undefined) {
            do
              gameToken = Math.random().toString(36).slice(-5)
            while (await json_db.objlen(gameToken) !== null)
            game = { started: 0, members: [reqData.token], poped: [], move: 0 }
          }
          const setGame = json_db.set(gameToken, '.', JSON.stringify(game))
          for (const wsKey of Object.keys(endpoints))
            if (game.members.includes(wsKey))
              endpoints[wsKey].send(JSON.stringify({
                started: game.started,
                poped: game.poped,
                move: 0,
                you: game.members.indexOf(wsKey),
                token: gameToken
              }))
          await setGame
          break
        case 'auth':
          const genNewToken = async () => {
            let newToken
            do {
              newToken = ''
              for (let i = 0; i < 2; i++)
                newToken += Math.random().toString(36).substring(2)
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
    })
    ws.on('close', async () => {
      for (const [key, e] of Object.entries(endpoints)) {
        if (e == ws) {
          const dbKeys = await db.keys('?????')
          if (dbKeys) {
            for (let [i, members] of (await json_db.mget(dbKeys, '.members')).entries()) {
              members = JSON.parse(members)
              if (members.includes(key)) {
                members = members.filter(member => member !== key)
                for (const member of members) {
                  endpoints[member].send(JSON.stringify({ final: Finals.OPPONENT_DISCONNECTED }))
                }
                db.del(dbKeys[i])
              }
            }
          }
        }
      }
    })
  })
  app.listen(process.env.PORT || 8080)
})()
