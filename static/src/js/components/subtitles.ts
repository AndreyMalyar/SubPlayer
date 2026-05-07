import { getByID, getButtonByID, modalWindow, createEl } from './utils.js'
import { 
  fetchSubtitlesFile, 
  createSubtitles as createSubtitlesApi, 
  translateSubtitles as translateSubtitlesApi,
  deleteSubtitles as deleteSubtitlesApi,
  generateTts,
  fetchTtsFile} from './api.js'
import { state, setSubtitlesCues, subtitlesCues, VideoItem, SubtitleCue } from './state.js'

const video = getByID('video') as HTMLVideoElement
const subtitlesEl = getByID('subtitles')
const subtitlesBtn = getButtonByID('subtitlesBtn')
const translateBtn = getButtonByID('translateBtn')
const toggleSubtitlesBtn = getButtonByID('toggleSubtitlesBtn')
const playerStatus = getByID('playerStatus')
const playerStatusText = getByID('playerStatusText')
const deleteSubtitlesBtn = getButtonByID('deleteSubtitlesBtn')
const ttsBtn = getButtonByID('ttsBtn')
const ttsAudio = getByID('ttsAudio') as HTMLAudioElement
const audioControls = getByID('audioControls')
const audioSpeed = getByID('audioSpeed') as HTMLInputElement
const audioSpeedValue = getByID('audioSpeedValue')
const audioVolume = getByID('audioVolume') as HTMLInputElement
const audioVolumeValue = getByID('audioVolumeValue')
const audioStopBtn = getButtonByID('audioStopBtn')
const audioResyncBtn = getButtonByID('audioResyncBtn')
const audioSpeedRecommendation = getByID('audioSpeedRecommendation')
const audioPauseBtn = getButtonByID('audioPauseBtn')
const getAudioRatio = (): number => {
    if(!ttsAudio.duration || !video.duration) return 1
    return +(ttsAudio.duration / video.duration).toFixed(2)
}
let originalVideoVolume = 1
let audioActive = false

// для window.__updatePlayerButtons декларация
declare global {
  interface Window {
    __updatePlayerButtons?: (item: VideoItem) => void
  }
}

//блок восстановление
function restoreUi() {
  playerStatus.classList.add('hidden')
  subtitlesBtn.disabled = false
  video.controls = true
}


// показываем субтитры по времени видео
video.addEventListener('timeupdate', () => {
  const currentTime = video.currentTime
  const cue = subtitlesCues.find(c => currentTime >= c.start && currentTime <= c.end)
  subtitlesEl.textContent = cue ? cue.text : ''
})

subtitlesBtn.addEventListener('click', () => {
  const filename = video.dataset.filename
  if(!filename) return
  createSubtitles(filename)
})

translateBtn.addEventListener('click', () => {
  const filename = video.dataset.filename
  if(!filename) return
  translateSubtitles(filename)
})

toggleSubtitlesBtn.addEventListener('click', () => {
  const isVisible = !subtitlesEl.classList.contains('hidden')
  if(isVisible) {
    toggleSubtitlesBtn.textContent = 'показать'
    subtitlesEl.classList.add('hidden')
  } else {
    toggleSubtitlesBtn.textContent = 'скрыть'
    subtitlesEl.classList.remove('hidden')
  }
})

deleteSubtitlesBtn.addEventListener('click', () => {
  const filename = video.dataset.filename
  if(!filename) return
  deleteSubtitles(filename)
})

ttsBtn.addEventListener('click', () => {
  const filename = video.dataset.filename
  if(!filename) return
  generateAudio(filename)
})

audioVolume.addEventListener('input', () => {
    const volume = parseFloat(audioVolume.value)
    ttsAudio.volume = volume
    audioVolumeValue.textContent = `${Math.round(volume * 100)}%`
})

audioStopBtn.addEventListener('click', () => {
  resetAudio()
  const filename = video.dataset.filename
  if(!filename) return
  const videoItem = state.videoList.find(item => item.name === filename)
  if(videoItem) window.__updatePlayerButtons?.(videoItem)
})

audioPauseBtn.addEventListener('click', () => {
    if(ttsAudio.paused) {
        ttsAudio.play()
        audioPauseBtn.textContent = 'Пауза'
    } else {
        ttsAudio.pause()
        audioPauseBtn.textContent = 'Продолжить'
    }
})

audioResyncBtn.addEventListener('click', () => {
    const ratio = getAudioRatio()
    ttsAudio.currentTime = video.currentTime * ratio
})

audioSpeed.addEventListener('input', () => {
  const speed = parseFloat(audioSpeed.value)
  ttsAudio.playbackRate = speed
  audioSpeedValue.textContent = `${speed.toFixed(2)}x`
})

export async function loadSubtitles(srtName: string) {
  const text = await fetchSubtitlesFile(srtName)
  if(!text) return
  const normalized = (text as string).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  setSubtitlesCues(parseStr(normalized))
}

export function resetSubtitles() {
  setSubtitlesCues([])
  subtitlesEl.textContent = ''
  toggleSubtitlesBtn.textContent = 'показать'
}

async function createSubtitles(filename: string) {
  subtitlesBtn.disabled = true
  video.pause()
  video.controls = false
  playerStatus.classList.remove('hidden')
  playerStatusText.textContent = 'Подготовка...'
  let counter: number = 0
  let currentName: string = ''

  const result = await createSubtitlesApi(filename, (line) => {
    if(line.includes('Starting sequential faster-whisper inference')) {
      playerStatusText.textContent = 'Создаем субтитры...'
    } else if(line.includes('Starting to process')) {
      const match = line.match(/:\s(.+)/)
      if(match) currentName = match[1].split('\\').pop() || match[1]
    } else if(line.includes('Operation finished in:')) {
      const time = line.split('in:')[1]?.trim().split('.')[0]
      const name = currentName.replace(/\.(webm|mp4)$/, '')
      const info = createEl('div', 'modal__info')
      info.append(
        createEl('p', 'modal__info-file', `Название: ${name}`),
        createEl('p', 'modal__info-file', `Завершино за: ${time}`)
      )
      modalWindow(info)
      restoreUi()

      const videoItem = state.videoList.find(item => item.name === filename)
      if(videoItem) {
        videoItem.hasSrt = true
        window.__updatePlayerButtons?.(videoItem)
      } 
      const srtName = filename.replace(/\.(webm|mp4)$/, '.srt')
      loadSubtitles(srtName)
    } else if(line.includes('-->')) {
      counter++
      playerStatusText.textContent = `Создали субтитров: ${counter}`
    } else if(line.includes('ERROR')) {
      modalWindow('Ошибка! Попробуй еще раз')
      restoreUi()
    }
  })

  if(result && (result as any).success === false) {
    modalWindow((result as any).message)
    restoreUi()
  }
}

async function translateSubtitles(filename: string) {
  translateBtn.disabled = true
  video.pause()
  video.controls = false
  playerStatus.classList.remove('hidden')
  playerStatusText.textContent = 'Подготовка...'

  let totalPhrase: number = 0
  let currentPhrase: number = 0

  const result = await translateSubtitlesApi(filename, (line) => {
    if(line.startsWith('TOTAL:')) {
      totalPhrase = parseInt(line.replace('TOTAL:', ''))
      playerStatusText.textContent = `Переводим... 0/${totalPhrase}`
    } else if(line === 'DONE') {
      if(totalPhrase < 5) modalWindow(`Переведено ${totalPhrase} фразы`) 
      else modalWindow(`Переведено ${totalPhrase} фраз`)
      playerStatus.classList.add('hidden')
      onTranslateComplete(filename)
    } else if(line.startsWith('ERROR')) {
      playerStatusText.textContent = 'Ошибка перевода!'
      video.controls = true
      translateBtn.disabled = false
    } else if(line) {
      currentPhrase++
      playerStatusText.textContent = `Переводим... ${currentPhrase}/${totalPhrase}`
    }
  })

  if(result?.success === false) {
    playerStatusText.textContent = result.message
    video.controls = true
    translateBtn.disabled = false
  }
}

function onTranslateComplete(filename: string) {
  translateBtn.disabled = false
  video.controls = true
  const videoItem = state.videoList.find(item => item.name === filename)
  if(videoItem) {
    videoItem.hasRuSrt = true
    window.__updatePlayerButtons?.(videoItem)
  }
  const ruSrtName = filename.replace(/\.(webm|mp4)$/, '.ru.srt')
  loadSubtitles(ruSrtName)
}

async function deleteSubtitles(filename: string) {
  const data = await deleteSubtitlesApi(filename)
  if(data.success) {
    // обновляем state
    const videoItem = state.videoList.find(item => item.name === filename)
    if(videoItem) {
      videoItem.hasSrt = false
      videoItem.hasRuSrt = false
      videoItem.hasRuMp3 = false
      window.__updatePlayerButtons?.(videoItem)
    }
    resetSubtitles()
    resetAudio()
  }
}

function parseStr(text: string) {
  const block = text.trim().split(/\n\n+/)
  return block.map((item: string) => {
    const lines = item.split('\n')
    if(lines.length < 3) return null
    const time = lines[1].split(' --> ')
    if(time.length < 2) return null
    return {
      start: timeToSeconds(time[0]),
      end: timeToSeconds(time[1]),
      text: lines.slice(2).join(' ')
    }
  }).filter((c): c is SubtitleCue => c !== null && !!c.text)
}

function timeToSeconds(t: string) {
  const [h, m, s] = t.trim().replace(',', '.').split(':')
  return +h * 3600 + +m * 60 + +s
}

async function generateAudio(filename: string) {
  const videoItem = state.videoList.find(item => item.name === filename)

  //если mp3 уже есть - просто играем
  if(videoItem?.hasRuMp3) {
    playAudio(filename)
    return
  }

  //генерируем
  ttsBtn.disabled = true
  video.pause()
  video.controls = false
  playerStatus.classList.remove('hidden')
  playerStatusText.textContent = 'Подготовка озвучки...'

  let total = 0
  let current = 0

  const result = await generateTts(filename, (line) => {
    if(line.startsWith('TOTAL:')) {
      total = parseInt(line.replace('TOTAL:', ''))
      playerStatusText.textContent = `Озвучиваем... 0/${total}`
    } else if(line === 'DONE') {
      playerStatus.classList.add('hidden')
      ttsBtn.disabled = false
      video.controls = true
      modalWindow(`Озвучили ${total} фраз`)
      if(videoItem) {
        videoItem.hasRuMp3 = true
        window.__updatePlayerButtons?.(videoItem)
      }
      //playAudio(filename)
    } else if(line.startsWith('ERROR')) {
      modalWindow('Ошибка генерации озвучки!')
      playerStatus.classList.add('hidden')
      ttsBtn.disabled = false
      video.controls = true
    } else if(line) {
      current++
      playerStatusText.textContent = `Озвучиваем... ${current}/${total}`
    }
  })

  if(result && (result as any).success === false) {
    modalWindow((result as any).message)
    playerStatus.classList.add('hidden')
    ttsBtn.disabled = false
    video.controls = true
  }
}

function onVideoPause() { ttsAudio.pause() }
function onVideoPlay() { ttsAudio.play() }
function onVideoSeeked() {
    const ratio = getAudioRatio()
    ttsAudio.currentTime = video.currentTime * ratio
    audioSpeedRecommendation.textContent = `${ratio}x`
}

function playAudio(filename: string) {
  audioActive = true
  const url = fetchTtsFile(filename)
  const startTime = video.currentTime

  originalVideoVolume = video.volume
  video.volume = 0.05

  ttsAudio.src = url
  ttsAudio.playbackRate = parseFloat(audioSpeed.value)

  ttsAudio.addEventListener('canplay', () => {
    const ratio = getAudioRatio()
    ttsAudio.currentTime = startTime * ratio
    audioSpeedRecommendation.textContent = `${ratio}x`
    ttsAudio.play()
    video.play()
  }, { once: true })

  audioControls.classList.remove('hidden')
  ttsBtn.classList.add('hidden')

  video.addEventListener('pause', onVideoPause)
  video.addEventListener('play', onVideoPlay)
  video.addEventListener('seeked', onVideoSeeked)
}

export function resetAudio() {
  audioActive = false
  ttsAudio.pause()
  ttsAudio.src = ''
  audioControls.classList.add('hidden')
  ttsBtn.classList.add('hidden')
  video.volume = originalVideoVolume
  audioPauseBtn.textContent = 'Пауза'

  video.removeEventListener('pause', onVideoPause)
  video.removeEventListener('play', onVideoPlay)
  video.removeEventListener('seeked', onVideoSeeked)
}
