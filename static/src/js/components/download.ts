import { getByID, getInputByID, getButtonByID, modalWindow, createEl} from './utils.js'
import { downloadVideo as downloadVideoApi} from './api.js'
import { state } from './state.js'
import { getVideoList } from './player.js'

const downloadBtn = getButtonByID('downloadBtn')
const urlInput = getInputByID('urlInput')
const progressBox = getByID('progressBox')
const progressText = getByID('progressText')
const progressFill = getByID('progressFill')
const urlError = getByID('urlError')


downloadBtn.addEventListener('click', () => {
  if(validateUrl(urlInput.value)) {
    urlError.classList.add('hidden')
    downloadBtn.disabled = true
    urlInput.disabled = true
    progressBox.classList.remove('hidden')

    progressText.textContent = 'Сбор информации...'
    downloadVideo(urlInput.value)
  }
})

interface DownloadResult {
  success: boolean
  message: string
}

function validateUrl(url: string) {
  progressBox.classList.add('hidden')
  const isYoutube = url.includes('youtube.com/') || url.includes('youtu.be/')

  if(url === '') {
    urlError.textContent = '* Поле не должно быть пустым'
    urlError.classList.remove('hidden')
    return null
  } else if(!isYoutube) {
    urlError.textContent = '* Ссылка должна быть с Youtube'
    urlError.classList.remove('hidden')
    return null
  }

  return true
}

async function downloadVideo(url: string) {
  let alreadyHandler = false
  let fileName: string = ''
  let fileSize: string = ''

  const result = await downloadVideoApi(url, (line) => {
    if(line.includes('Extracting URL')) {
      progressText.textContent = 'Подключаюсь...'
    } else if(line.includes('has already been download')) {
      alreadyHandler = true
      progressBox.classList.add('hidden')
      modalWindow('Файл уже существует!')
      onDownloadComplite({ success: true, message: 'Файл уже существует!'})
    } else if(line.includes('FixupM3u8') || line.includes('Merger') || line.includes('container of') ) {
      const match = line.match(/"([^"]+)"/)
      if(match) fileName = match[1].split('\\').pop() || match[1]
    } else if(line.includes('%')) {
      if(alreadyHandler) return
      const match = line.match(/(\d+\.?\d*)%\s+of\s+([\d.]+\w+)/) 
      if(match) {
        const percent = parseFloat(match[1])
        fileSize = match[2]
        progressFill.style.width = `${percent}%`
        progressText.textContent = `${percent}%`
      }
    } else if(line === 'DONE') {
      if(alreadyHandler) return
      const currentName = fileName.replace(/\.(webm|mp4)$/, '')
      const info = createEl('div', 'modal__info')
      info.append(
        createEl('p', 'modal__info-file', `Название: ${currentName}`),
        createEl('p', 'modal__info-file', `Размер: ${fileSize}`)
      )
      modalWindow(info)
      progressBox.classList.add('hidden')
      onDownloadComplite({ success: true, message: 'Видео скачено!'})
    }
  })

  // Ошибка сети или сервера
  if(result?.success === false) {
    urlError.textContent = result.message
    urlError.classList.remove('hidden')
    downloadBtn.disabled = false
    urlInput.disabled = false
    progressBox.classList.add('hidden')
  }
}


function onDownloadComplite(data: DownloadResult) {
  state.download = { inProgress: false, message: data.message }
  urlInput.value = ''
  progressFill.style.width = '0%'
  downloadBtn.disabled = false
  urlInput.disabled = false
  getVideoList()
}

export { onDownloadComplite }
