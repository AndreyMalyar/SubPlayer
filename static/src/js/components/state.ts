export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export interface VideoItem {
  name: string
  url: string
  duration: number
  hasSrt: boolean
  hasRuSrt: boolean
  hasRuMp3: boolean
}

export const state = {
  videoList: [] as VideoItem[],
  download: {
    inProgress: false,
    message: ""
  }
}

export let subtitlesCues: SubtitleCue[] = []
export let subtitlesVisible: boolean = false

export function setSubtitlesCues(cues: SubtitleCue[]) {
  subtitlesCues = cues
}

export function setSubtitlesVisible(val: boolean) {
  subtitlesVisible = val
}
