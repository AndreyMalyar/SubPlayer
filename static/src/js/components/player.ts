import { getByID, getButtonByID, createEl, getIcon } from './utils.js'
import { state, VideoItem } from './state.js'
import { deleteVideo as deleteVideoApi, fetchVideoList } from './api.js'
import { loadSubtitles, resetSubtitles, resetAudio } from './subtitles.js'

const video = getByID('video') as HTMLVideoElement
const videoSource = getByID('videoSource') as HTMLSourceElement
const bodyBox = getByID('tableBody')
const tableLoader = getByID('tableLoader')
const subtitlesBtn = getButtonByID('subtitlesBtn')
const translateBtn = getButtonByID('translateBtn')
const toggleSubtitlesBtn = getByID('toggleSubtitlesBtn')
const sectionDownload = getByID('sectionDownload')
const sectionList = getByID('sectionList')
const sectionPlayer = getByID('sectionPlayer')
const backBtn = getButtonByID('backBtn')
const deleteSubtitlesBtn = getButtonByID('deleteSubtitlesBtn')
const ttsBtn = getButtonByID('ttsBtn')
const audioDesc = getByID('ttsDesc')
const cross = '—'

backBtn.append(getIcon('back'))


export async function getVideoList() {
  tableLoader.classList.remove('hidden')
  try {
    const data = await fetchVideoList()
    if(data?.success === false) {
      console.log('Ошибка загрузки списка: ', data.message)
      return
    }
    showVideoList(data)
  } finally {
    tableLoader.classList.add('hidden')
  }
}

function showVideoList(arr: VideoItem[]) {
  state.videoList = arr
  bodyBox.innerHTML = ''

  arr.forEach(item => {
    const name = item.name.replace(/\.(webm|mp4)$/, '')
    const currentTime = formatDuration(item.duration)
    
    const hasSrt = item.hasSrt ? getIcon('check') : cross
    const hasRuSrt = item.hasRuSrt ? getIcon('check') : cross
    const hasRuMp3 = item.hasRuMp3 ? getIcon('check') : cross


    const rowBody = createEl('div', 'table-row table-body__row')
    const label = createEl('span', 'table-row__item table-body__label', name)
    label.dataset.filename = item.name
    const duration = createEl('span', 'table-row__item', currentTime)
    const srt = createEl('span', 'table-row__item', hasSrt)
    const ruSrt = createEl('span', 'table-row__item', hasRuSrt)
    const ruMp3 = createEl('span', 'table-row__item', hasRuMp3)
    const delBtn = createEl('span', 'table-row__item table-body__del', getIcon('close'))

    rowBody.append(label, duration, srt, ruSrt, ruMp3, delBtn)
    bodyBox.append(rowBody)
  })
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function updatePlayerButtons(videoItem: VideoItem) {
  subtitlesBtn.classList.add('hidden')
  translateBtn.classList.add('hidden')
  toggleSubtitlesBtn.classList.add('hidden')
  deleteSubtitlesBtn.classList.add('hidden')
  ttsBtn.classList.add('hidden')
  audioDesc.classList.remove('hidden')

  if(!videoItem.hasSrt) {
    subtitlesBtn.classList.remove('hidden')
  } else if(!videoItem.hasRuSrt) {
    translateBtn.classList.remove('hidden')
    deleteSubtitlesBtn.classList.remove('hidden')
  } else {
    toggleSubtitlesBtn.classList.remove('hidden')
    deleteSubtitlesBtn.classList.remove('hidden')
    audioDesc.classList.add('hidden')
    ttsBtn.classList.remove('hidden')
    ttsBtn.textContent = videoItem.hasRuMp3 ? 'включить' : 'создать'
  }
}

bodyBox.addEventListener('click', (evt) => {
  const target = evt.target as HTMLElement
  if(target === evt.currentTarget) return

  if(target.classList.contains('table-body__label')) {
    const filename = target.dataset.filename
    const found = state.videoList.find(item => item.name === filename)

    video.dataset.filename = filename
    if(!found) return

    updatePlayerButtons(found)

    if(found.hasRuSrt) {
      if(!filename) return
      const ruSrtName = filename.replace(/\.(webm|mp4)$/, '.ru.srt')
      loadSubtitles(ruSrtName)
    }
    
    videoSource.src = found.url
    video.load()
    sectionDownload.classList.add('hidden')
    sectionList.classList.add('hidden')
    sectionPlayer.classList.remove('hidden')
  }

  if(target.closest('.table-body__del')) {
    const removeEl = target.closest('div')
    const label = removeEl?.querySelector('.table-body__label') as HTMLElement | null
    if(!label) return
    const filename = label.dataset.filename
    if(!filename) return
    deleteVideo(filename)
  }
})

async function deleteVideo(filename: string) {
  const data = await deleteVideoApi(filename)
  if(data.success) {
    state.videoList = state.videoList.filter(item => item.name !== filename)
    bodyBox.innerHTML = ''
    getVideoList()
  }
}

backBtn.addEventListener('click', () => {
  sectionDownload.classList.remove('hidden')
  sectionList.classList.remove('hidden')
  sectionPlayer.classList.add('hidden')

  videoSource.src = ''
  video.load()
  resetSubtitles()
  resetAudio()
  getVideoList()
})
