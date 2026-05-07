import Utils from '/src/js/components/utils.js';

const {getByID, getSelector, createEl} = Utils


const state = {
  videoList: [],
  download: {
    inProgress: false,
    message: "",
  }
}

////////////
// Загрузка списка видео
///////////
const bodyBox = getByID('tableBody')
const tableLoader = getByID('tableLoader')

async function getVideoList() {
  tableLoader.classList.remove('hidden')
  try {
    const res = await fetch("/api/videos")
    const data = await res.json()
    showVideoList(data)
  } catch(err) {
    console.log('Ошибка загрузки списка:', err)
  } finally {
    tableLoader.classList.add('hidden')
  }
}

function showVideoList(arr) {
  state.videoList = arr
  bodyBox.innerHTML = ""

  arr.forEach(item => {
    const name = item.name.replace(/\.(webm|mp4)$/, '')
    const currentTime = formatDuration(item.duration)
    const hasSrt = item.hasSrt ? 'yes' : 'no'
    const hasRuSrt = item.hasRuSrt ? 'yes' : 'no'

    const rowBody = createEl('div', 'table-row table-body__row')
    const label = createEl('span', 'table-row__item table-body__label', name)
    label.dataset.filename = item.name
    const duration = createEl('span', 'table-row__item', currentTime)
    const srt = createEl('span', 'table-row__item', hasSrt)
    const ruSrt = createEl('span', 'table-row__item', hasRuSrt)
    const closeBtn = createEl('span', 'table-row__item table-body__del', 'x')

    rowBody.append(label, duration, srt, ruSrt, closeBtn)
    bodyBox.append(rowBody)
  })
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  const pad = n => String(n).padStart(2, '0')

  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`
}

////////////
// Скачать видео
///////////
const downloadBtn = getByID('downloadBtn')
const urlInput = getByID('urlInput')
const progressBox = getByID('progressBox')
const progressText = getByID('progressText')
const progressFill = getByID('progressFill')
const progressDone = getByID('progressDone')
const urlError = getByID('urlError')

progressDone.addEventListener('click', () => {
  progressBox.classList.add('hidden')
})

downloadBtn.addEventListener('click', () => {
  if(validateUrl(urlInput.value)) {
    urlError.classList.add("hidden")
    downloadBtn.disabled = true
    urlInput.disabled = true
    progressBox.classList.remove('hidden')
    progressDone.disabled = true
    downloadVideo(urlInput.value)
  }
})

function validateUrl(url) {
  const isYotube = url.includes("youtube.com/") || url.includes("youtu.be/")

  if(url === "") {
    urlError.textContent = '* Поле не должно быть пустым'
    urlError.classList.remove("hidden")
    return null
  } else if(!isYotube) {
    urlError.textContent = '* Ссылка должна быть с Youtube'
    urlError.classList.remove("hidden")
    return null
  }

  return true
}

async function downloadVideo(url) {
  const res = await fetch("/api/download", {
    method: "POST",
    body: JSON.stringify({ url }),
    headers: { 'content-type': 'application/json' }
  })

  if(!res.ok) {
    const data = await res.json()
    urlError.textContent = data.message
    urlError.classList.remove("hidden")
    downloadBtn.disabled = false
    urlInput.disabled = false
    progressBox.classList.add("hidden")
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while(true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    const lines = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => l.replace('data: ', ''))

    for(const line of lines) {
      if(line.includes('Extracting URL')) {
        progressText.textContent = 'Подключаюсь...'
      }
      if(line.includes('has already been download')) {
        progressText.textContent = 'Файл уже существует!'
        onDownLoadComplite({ success: true, message: 'Файл уже существует!'})
        return
      }
      if(line === 'DONE') {
        onDownLoadComplite({ success: true, message: 'Видео скачено!' })
        progressText.textContent = 'Готово!'
        return
      }
      // показать прогресс
      if(line.includes('%')) {
        const match = line.match(/(\d+\.?\d*)%/)
        if(match) {
          const percent = parseFloat(match[1])
          progressFill.style.width = `${percent}%`
          progressText.textContent = `${percent}%`
        }
        //progressText.textContent = line.trim()
      }
    }
  }
}

function onDownLoadComplite(data) {
  state.download = { inProgress: false, message: data.message }
  if(data.success) {
    urlInput.value = ''
    progressFill.style.width = '0%' 
    progressDone.disabled = false
    downloadBtn.disabled = false
    urlInput.disabled = false
    getVideoList()
  }
}

////////////
// субтитры
///////////
// subtitlesBtn так же переменная учавствует в просмотре видео
const subtitlesBtn = getByID('subtitlesBtn')

subtitlesBtn.addEventListener('click', () => {
  const filename = getByID('video').dataset.filename
  createSubtitles(filename)
})


async function createSubtitles(filename) {
  const res = await fetch("/api/subtitles", {
    method: "POST",
    body: JSON.stringify({name: filename, url: "" }),
    headers: { 'content-type': 'application/json' }
  })


// Проверяем — сервер вернул JSON или стрим?
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const answer = await res.json();
    if (answer.success) {
      const srtName = filename.replace(/\.(webm|mp4)$/, '.srt')
      await loadSubtitles(srtName)
    }
    return;
  }
  
  subtitlesBtn.disabled = true
  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while(true) {
    const { done, value } = await reader.read()
    if(done) break

    const text = decoder.decode(value)
    const lines = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => l.replace('data: ', ''))


      console.log('Подготовка...')
    for(const line of lines) {
      if( line.includes("Starting sequential faster-whisper inference") ) {
        console.log('Начинаем создавать субтитры...')
      } else if(line.includes('Operation finished')) {
        const index = line.indexOf(":") + 1
        const finishTime = line.slice(index)
        console.log('Whiper завершил работу за: ' + finishTime.trim() + 'сек')
      } else if (line === 'DONE') {
        subtitlesBtn.disabled = false

        const videoItem = state.videoList.find(item => item.name === filename)
        if(videoItem) {
          videoItem.hasSrt = true
          updatePlayerButtons(videoItem)
        }
        const srtName = filename.replace(/\.(webm|mp4)$/, '.srt')
        await loadSubtitles(srtName)
      }
    }
  }
}

let subtitlesCues = []

async function loadSubtitles(srtName) {
  const res = await fetch(`/api/subtitles-file/${encodeURIComponent(srtName)}`)
  const text = await res.text()
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  subtitlesCues = parseStr(normalized)
}

function parseStr(text) {
  const blocks = text.trim().split(/\n\n+/)
  return blocks.map(block => {
    const lines = block.split('\n')
    if(lines.length < 3) return null // пропускаем не полные блоки
    const time = lines[1].split(' --> ')
    if(time.length < 2) return null
      return {
        start: timeToSeconds(time[0]),
        end: timeToSeconds(time[1]),
        text: lines.slice(2).join(' ')
      }
  }).filter(c => c !== null && c.text)
}

function timeToSeconds(t) {
  const [h, m, s] = t.trim().replace(',', '.').split(':')
  return +h * 3600 + +m * 60 + +s
}

////////////
// переводим субтитры
////////////
// video так же относится к просмотру видео
const video = getByID("video")
const translateBtn = getByID('translateBtn')
const playerStatus = getByID('playerStatus')
const playerStatusText = getByID('playerStatusText')

translateBtn.addEventListener('click', () => {
  const filename = getByID('video').dataset.filename
  translateSubtitles(filename)
}) 

async function translateSubtitles(filename) {
  translateBtn.disabled = true
  // паузим и блокируем видео
  video.pause()
  video.controls = false
  // показываем статус
  playerStatus.classList.remove('hidden')
  playerStatusText.textContent = 'Подготовка...'

  const res = await fetch('/api/translate', {
    method: "POST",
    body: JSON.stringify({ name: filename }),
    headers: {'Content-type': 'application/json'}
  })

  // сервер вернул JSON (перевод уже есть)
  const contentType = res.headers.get('content-type') ?? ''
  if(contentType.includes('application/json')) {
    const answer = await res.json()
    if(answer.success) {
      onTranslateComplete(filename)
    }
    return
  }
  // стрим
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let totalPhrase = 0
  let currentPhrase = 0

  while(true) {
    const { done, value } = await reader.read()
    if(done) break

    const text = decoder.decode(value)
    const lines = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => l.replace('data: ', ''))

    for(const line of lines) {
      if(line.startsWith('TOTAL:')) {
        totalPhrase = parseInt(line.replace('TOTAL:', ''))
        playerStatusText.textContent = `Переводим... 0/${totalPhrase}`
      } else if(line === 'DONE') {
        playerStatusText.textContent = 'Готово!'
        setTimeout(() => {
          playerStatus.classList.add('hidden')
        }, 1500)
        onTranslateComplete(filename)
        return
      } else if(line.startsWith('ERROR')) {
        playerStatusText = 'Ошибка перевода!'
        video.controls = true
        translateBtn.disabled = false
        return
      } else if(line) {
        currentPhrase++
        playerStatusText.textContent = `Переводим... ${currentPhrase}/${totalPhrase}`
      }
    }
  }
}

function onTranslateComplete(filename) {
  translateBtn.disabled = false
  video.controls = true
  // обновляем state
  const videoItem = state.videoList.find(item => item.name === filename)
  if(videoItem) {
    videoItem.hasRuSrt = true
    updatePlayerButtons(videoItem) // переключаемся на toggleSubtitlesBtn 
  }
  // загружаем переведенные субтитры
  const ruSrtName = filename.replace(/\.(webm|mp4)$/, '.ru.srt')
  loadSubtitles(ruSrtName)
}

let subtitlesVisible = false
const toggleSubtitlesBtn = getByID('toggleSubtitlesBtn')

toggleSubtitlesBtn.addEventListener('click', () => {
  const subtitlesEl = getByID('subtitles')
  subtitlesVisible = !subtitlesVisible

  if(subtitlesVisible) {
    toggleSubtitlesBtn.textContent = 'Скрыть субтитры'
    subtitlesEl.classList.remove('hidden')
  } else {
    toggleSubtitlesBtn.textContent = 'Показать субтитры'
    subtitlesEl.classList.add('hidden')
  }
})

const subtitlesEl = getByID('subtitles')
// показываем субтитры
video.addEventListener('timeupdate', () => {
  const currentTime = video.currentTime
  const cue = subtitlesCues.find(c => currentTime >= c.start && currentTime <= c.end)
  subtitlesEl.textContent = cue ? cue.text : ''
})

////////////
// просмотр видео
///////////
const sectionDownload = getByID('sectionDownload')
const sectionList = getByID('sectionList')
const sectionPlayer = getByID('sectionPlayer')
const tableBody = getByID("tableBody")
const videoSource = getByID('videoSource')


tableBody.addEventListener('click', (evt) => {
  if(evt.target === evt.currentTarget) return
  // Воиспроизведение
  if(evt.target.classList.contains('table-body__label')) {
    const filename = evt.target.dataset.filename
    const found = state.videoList.find(item => item.name === filename)

    video.dataset.filename = filename
    if(!found) return

    updatePlayerButtons(found)

    // загружаем субтитры если они уже есть
    if(found.hasRuSrt) {
      const ruSrtName = filename.replace(/\.(webm|mp4)$/, '.ru.srt')
      loadSubtitles(ruSrtName)
    }

    videoSource.src = found.url
    video.load()
    video.play()
    sectionDownload.classList.add('hidden')
    sectionList.classList.add('hidden')
    sectionPlayer.classList.remove('hidden')
  }
  //Удаление
  if(evt.target.classList.contains('table-body__del')) {
    const removeEl = evt.target.closest('div')
    const label = removeEl.querySelector('.table-body__label')
    const filename = label.dataset.filename

    deleteVideo(filename, removeEl)
  }
})

function updatePlayerButtons(videoItem) {
  subtitlesBtn.classList.add('hidden')
  translateBtn.classList.add('hidden')
  toggleSubtitlesBtn.classList.add('hidden')

  if(!videoItem.hasSrt) {
    subtitlesBtn.classList.remove('hidden')
  } else if(!videoItem.hasRuSrt) {
    translateBtn.classList.remove('hidden')
  } else {
    toggleSubtitlesBtn.classList.remove('hidden')
  }
}

async function deleteVideo(filename, removeEl) {
  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    })
    const data = await res.json()
    if(data.success) {
      //Убираем из DOM, перерисовываем список
      bodyBox.innerHTML = ''
      getVideoList()
      //Убираем из state
      state.videoList = state.videoList.filter(item => item.name !== filename)
    }
  } catch(err) {
    console.log(err)
  }
}


const closeBtn = getByID("closeBtn")
closeBtn.addEventListener('click', () => {
  sectionDownload.classList.remove('hidden')
  sectionList.classList.remove('hidden')
  sectionPlayer.classList.add('hidden')

  videoSource.src = ''
  video.load()

  subtitlesEl.textContent = ''
  subtitlesEl.classList.add('hidden')
  toggleSubtitlesBtn.textContent = 'Показать субтитры'
  subtitlesVisible = false

  getVideoList()
})

getVideoList()
