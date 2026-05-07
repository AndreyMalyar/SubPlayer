import { getVideoList } from './components/player.js'
import { updatePlayerButtons } from './components/player.js'
import './components/download.js'
import './components/subtitles.js'

// решаем circular dependecy:
// subtitles.js нужен updatePlayerButtons из player.js
// передаем его через window как мост (временное решение до ts)

window.__updatePlayerButtons = updatePlayerButtons

getVideoList()

