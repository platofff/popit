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
const touchSupported = 'ontouchstart' in document.documentElement
const blackout = document.getElementById('blackout')
const status = document.getElementById('status')
const room = document.getElementById('room')
const error = document.getElementById('error')
const popit = document.getElementById('popit')
const cancel = document.getElementById('cancel')
const pops = document.querySelectorAll('.pop')
let startButton = document.getElementById('start')
let token, ws
let game = {}
let playedAudio = []
let selectedX = null
let selectedY = null
let filledCount = 0
let fillType = null
let popit_event_listener = false
let cancel_event_listener = false


if (document.cookie.includes('token='))
  token = document.cookie.replace('token=', '')

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
    document.cookie = `token=${token}; SameSite=Strict; Secure`
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.error) {
        error.textContent = data.error
        return
      }
      game = { ...game, ...data }
      console.log(`Game: ${JSON.stringify(game)}`)
      if (blackout.children !== [])
        blackout.innerHTML = `Waiting for the opponent...<br>Room id: ${game.token}`
      if (game.started) {
        blackout.style.display = 'none'
        status.style.display = 'block'
      }
      if (game.move === game.you)
        status.innerHTML = `Move: <span style="color:green">your</span>`
      else
        status.innerHTML = `Move: <span style="color:red">opponent's</span>`
      if (game.final !== undefined) {
        switch (game.final) {
          case Finals.OPPONENT_DISCONNECTED:
            blackout.innerHTML = 'Opponent disconected.'
            break
          case Finals.WIN:
            blackout.innerHTML = 'You won!'
            break
          case Finals.LOSE:
            blackout.innerHTML = 'You lost!'
            break
        }
        blackout.style.display = 'block'
        playedAudio = []
        game = {}
        for (const pop of document.querySelectorAll('.pop')) {
          pop.classList.remove('pressed')
          pop.classList.add('unpressed')
        }
        blackout.innerHTML += '<br><div id="start">Play again</div>'
        startButton = document.getElementById('start')
        startButton.addEventListener('click', () => {
          ws.send(JSON.stringify({method: 'get_game', token: token}))
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

for (const [i, pop] of pops.entries()) {
  pop.addEventListener(touchSupported ? 'touchstart' : 'mousedown', () => {
    if (game.move !== game.you)
      return
    if (!pop.classList.contains('pressed')) {
      pop.classList.remove('unpressed')
      pop.classList.add('selected')
      selectedX = i % 6
      selectedY = Math.floor(i / 6)
    }
    if (!popit_event_listener) {
      popit.addEventListener(touchSupported ? 'touchend' : 'mouseup', () => {
        const poped = []
        for (const [i, pop] of document.querySelectorAll('.pop').entries())
          if (pop.classList.contains('selected'))
            poped.push(i)
        selectedX = null
        selectedY = null
        filledCount = 0
        fillType = null
        ws.send(JSON.stringify({ method: 'update', poped: poped, token: token, game: game.token }))
        popit_event_listener = false
      }, { once: true })
      popit_event_listener = true
    }
    if (!cancel_event_listener) {
      cancel.addEventListener(touchSupported ? 'touchend' : 'mouseup', () => {
        for (const pop of document.querySelectorAll('.selected')) {
          pop.classList.remove('selected')
          pop.classList.add('unpressed')
        }
        selectedX = null
        selectedY = null
        filledCount = 0
        fillType = null
        cancel_event_listener = false
      }, { once: true })
      cancel_event_listener = true
    }
  })
  pop.addEventListener(touchSupported ? 'touchmove' : 'mouseover', () => {
    if (game.move === game.you && !pop.classList.contains('selected') && !pop.classList.contains('pressed') && selectedX !== null && filledCount < 4) {
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
  })
}
