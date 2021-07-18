'use strict'
const audio = [
  new Audio('popit1.ogg'),
  new Audio('popit2.ogg'),
  new Audio('popit3.ogg'),
  new Audio('popit4.ogg'),
  new Audio('popit5.ogg')
]

for (const pop of document.querySelectorAll('.pop')) {
  pop.addEventListener('click', () => {
    if (!pop.classList.contains('pressed')) {
      audio[Math.floor(Math.random() * audio.length)].play()
      pop.classList.remove('unpressed')
      pop.classList.add('pressed')
    } else {
      pop.classList.remove('pressed')
      pop.classList.add('unpressed')
    }
  })
}
