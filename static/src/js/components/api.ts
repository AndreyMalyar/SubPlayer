// Хелпер для стримов
async function readStream(res: Response, onChunk: (line: string) => void) {
  if(!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while(true) {
    const {done, value} = await reader.read()
    if(done) break

    const text = decoder.decode(value)
    const lines = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => l.replace('data: ', ''))

    for(const line of lines) {
      onChunk(line)
    }
  }
}

// GET /api/videos
export async function fetchVideoList() {
  try {
    const res = await fetch('/api/videos')
    if(!res.ok) return { success: false, message: 'Ошибка загрузки списка'}
    return res.json()
  } catch(err) {
    return { success: false, message: 'Нет связи с сервером' }
  }
}

//DELETE /api/vodeos/:filename
export async function deleteVideo(filename: string) {
  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    })
    if(!res.ok) return { success: false, message: 'Ошибка удаления'}
    return res.json()
  } catch(err) {
    return { success: false, message: 'Нет связи с сервером' }
  }
}

// GET /api/subtiles-file/:name
export async function fetchSubtitlesFile(srtName: string) {
  try {
    const res = await fetch(`/api/subtitles-file/${encodeURIComponent(srtName)}`)
    if(!res.ok) return null
    return res.text()
  } catch(err){
    return { success: false, message: 'Нет связи с сервером' }
  }
}

//POST /api/download - стрим
export async function downloadVideo(url: string, onChunk: (line: string) => void) {
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: { 'content-type': 'application/json'}
    })

    if(!res.ok) return res.json() 

    await readStream(res, onChunk)
  } catch(err) {
    return { success: false, message: 'Нет связи с сервером' }
  }
}

//DELETE /api/subtiles/:filename
export async function deleteSubtitles(filename: string) {
  try {
    const res = await fetch(`/api/subtitles/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    })
    if(!res.ok) return { success: false, message: 'Ошибка удаления субтитров'}
    return res.json()
  } catch(err) {
    return { success: false, message: 'Нет связи с сервером'}
  }
}

//POST - стрим или JSON
async function postWithStream(url: string, body: object, onChunk: (line: string) => void) {
  try {
    const res = await fetch (url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {'content-type': 'application/json'}
    })

    if(!res.ok) {
      const data = await res.json()
      return {success: false, message: data.message ?? 'Ошибка сервера'}
    }

    const contentType = res.headers.get('content-type') ?? ''
    if(contentType.includes('application/json')) return res.json()

    await readStream(res, onChunk)
  } catch(err) {
    return { success: false, message: 'Нет связи с сервером' }
  }
}

//POST /api/subtitles - стрим или JSON
export async function createSubtitles(filename: string, onChunk: (line: string) => void) {
  return postWithStream('/api/subtitles', { name: filename, url: '' }, onChunk)
}

//POST /api/translate - стрим или JSON
export async function translateSubtitles(filename: string, onChunk: (line: string) => void) {
  return postWithStream('/api/translate', { name: filename }, onChunk)
}

// POST /api/tts - генерируем mp3
export async function generateTts(filename: string, onChunk: (line: string) => void) {
  return postWithStream('/api/tts', { name: filename }, onChunk)
}

// GET /api/tts-file/:name
export function fetchTtsFile(filename: string): string {
  const baseName = filename.replace(/\.(webm|mp4)$/, '')
  return `/api/tts-file/${encodeURIComponent(baseName + '.ru.mp3')}`
}
