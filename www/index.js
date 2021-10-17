'use strict'
const audio = [
  new Audio('popit1.ogg'),
  new Audio('popit2.ogg'),
  new Audio('popit3.ogg'),
  new Audio('popit4.ogg'),
  new Audio('popit5.ogg')
]
const Finals = Object.freeze({
  OPPONENT_DISCONNECTED: 0,
  WIN: 1,
  LOSE: 2
})
const blackout = document.getElementById('blackout')
const status = document.getElementById('status')
const room = document.getElementById('room')
const error = document.getElementById('error')
const popit = document.getElementById('popit')
const cancel = document.getElementById('cancel')
const pops = document.querySelectorAll('.pop')
let startButton = document.getElementById('start')
let ws
let game = {}
let playedAudio = []
let selectedX = null
let selectedY = null
let filledCount = 0
let fillType = null
let cancel_event_listener = false

const getCookie = (name) => {
  let matches = document.cookie.match(new RegExp(
    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
  ))
  return matches ? decodeURIComponent(matches[1]) : undefined
}

const setCookie = (name, value, options = {}) => {
  options = {
    path: '/',
    ...options
  }
  if (options.expires instanceof Date) {
    options.expires = options.expires.toUTCString()
  }
  let updatedCookie = encodeURIComponent(name) + "=" + encodeURIComponent(value)
  for (let optionKey in options) {
    updatedCookie += "; " + optionKey
    let optionValue = options[optionKey]
    if (optionValue !== true) {
      updatedCookie += "=" + optionValue
    }
  }
  document.cookie = updatedCookie
}

let token = getCookie('token')
if (getCookie('noWelcome') === undefined) {
  document.getElementById('close-welcome').addEventListener('click', () => {
    document.getElementById('welcome-blackout').style.display = 'none'
  })
  document.getElementById('close-welcome-dont-show').addEventListener('click', () => {
    setCookie('noWelcome', '1', { secure: true, samesite: 'lax' })
    document.getElementById('welcome-blackout').style.display = 'none'
  })
  document.getElementById('welcome-blackout').style.display = 'block'
}
startButton.addEventListener('click', () => {
  ws = new WebSocket(document.location.href.replace('https://', 'wss://').replace('http://', 'ws://') + 'ws')
  ws.onopen = () => {
    const req = token === undefined ? { method: 'auth' } : { method: 'auth', token: token }
    ws.send(JSON.stringify(req))
  }
  ws.onmessage = (event) => {
    token = JSON.parse(event.data).result
    if (token === 'auth_error') {
      console.error('Auth error!')
      ws.send(JSON.stringify({ method: 'auth' }))
      return
    }
    setCookie('token', token, { secure: true, samesite: 'lax' })
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.error) {
        error.innerHTML = data.error
        return
      }
      game = { ...game, ...data }
      console.log(`Game: ${JSON.stringify(game)}`)
      if (blackout.children !== [])
        blackout.innerHTML = `Ищем соперника...<br>Токен комнаты: ${game.token}`
      if (game.started) {
        blackout.style.display = 'none'
        status.style.display = 'block'
      }
      if (game.move === game.you)
        status.innerHTML = `Ход: <span style="color:green">твой</span>`
      else
        status.innerHTML = `Ход: <span style="color:red">противника</span>`
      if (game.final !== undefined) {
        switch (game.final) {
          case Finals.OPPONENT_DISCONNECTED:
            blackout.innerHTML = 'Противник отключился.'
            break
          case Finals.WIN:
            blackout.innerHTML = 'Ты выиграл!'
            break
          case Finals.LOSE:
            blackout.innerHTML = 'Ты проиграл!'
            break
        }
        blackout.style.display = 'block'
        playedAudio = []
        game = {}
        for (const pop of document.querySelectorAll('.pop')) {
          pop.classList.remove('pressed')
          pop.classList.add('unpressed')
        }
        blackout.innerHTML += '<br><div id="start">Сыграть ещё раз</div>'
        startButton = document.getElementById('start')
        startButton.addEventListener('click', () => {
          ws.send(JSON.stringify({ method: 'get_game', token: token }))
        })
        return
      }
      for (const [i, pop] of document.querySelectorAll('.pop').entries()) {
        if (game.poped.includes(i)) {
          pop.classList.remove('selected')
          pop.classList.remove('unpressed')
          pop.classList.add('pressed')
          if (!playedAudio.includes(i))
            audio[Math.floor(Math.random() * audio.length)].play()
          playedAudio.push(i)
        } else {
          pop.classList.remove('selected')
          pop.classList.add('unpressed')
        }
      }
    }
    if (room.value !== '')
      ws.send(JSON.stringify({ method: 'get_game', token: token, gameToken: room.value }))
    else
      ws.send(JSON.stringify({ method: 'get_game', token: token }))
  }
})

const cancelHandler = (e) => {
  for (const pop of document.querySelectorAll('.selected')) {
    pop.classList.remove('selected')
    pop.classList.add('unpressed')
  }
  selectedX = null
  selectedY = null
  filledCount = 0
  fillType = null
  cancel_event_listener = false
  e.stopPropagation()
}

for (const [i, pop] of pops.entries()) {
  pop.ondragstart = () => false
  pop.addEventListener('pointerdown', (e) => {
    if (game.move !== game.you || !e.isPrimary || pop.classList.contains('pressed') || document.querySelector('.selected') !== null) {
      return
    }
    pop.classList.remove('unpressed')
    pop.classList.add('selected')
    selectedX = i % 6
    selectedY = Math.floor(i / 6)

    if (!cancel_event_listener) {
      cancel.addEventListener('pointerover', cancelHandler, { once: true })
      cancel_event_listener = true
    }
  })
}

popit.addEventListener('pointermove', (e) => {
  const pop = document.elementFromPoint(e.pageX, e.pageY)
  if (pop.classList.contains('pop') && game.move === game.you && !pop.classList.contains('selected') && !pop.classList.contains('pressed') && selectedX !== null && filledCount < 4) {
    const i = Number(pop.getAttribute('name'))
    const x = i % 6
    const y = Math.floor(i / 6)
    if (selectedX === x) {
      if (![null, 'x'].includes(fillType) || Math.abs(selectedY - y) > 1)
        return
      fillType = 'x'
    } else if (selectedY === y) {
      if (![null, 'y'].includes(fillType) || Math.abs(selectedX - x) > 1)
        return
      fillType = 'y'
    } else return
    filledCount++
    selectedX = x
    selectedY = y
    pop.classList.remove('unpressed')
    pop.classList.add('selected')
  }
  e.stopPropagation()
})

popit.addEventListener('pointerup', (e) => {
  if (document.elementFromPoint(e.pageX, e.pageY).getAttribute('id') === 'cancel') {
    return cancelHandler(e)
  }
  const poped = []
  for (const [i, pop] of document.querySelectorAll('.pop').entries()) {
    if (pop.classList.contains('selected')) {
      poped.push(i)
    }
  }
  if (poped.length === 0) { return }
  selectedX = null
  selectedY = null
  filledCount = 0
  fillType = null
  ws.send(JSON.stringify({ method: 'update', poped: poped, token: token, game: game.token }))
})

popit.addEventListener('pointercancel', cancelHandler)