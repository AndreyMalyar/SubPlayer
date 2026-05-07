
export const getByID = (id: string): HTMLElement => { 
  const el = document.getElementById(id)
  if(!el) throw new Error(`Element #${id} not found`)
  return el
}

export const getInputByID = (id: string): HTMLInputElement => {
  const el = document.getElementById(id) as HTMLInputElement
  if(!el) throw new Error(`Input #${id} not found`)
  return el
}

export const getButtonByID = (id: string): HTMLButtonElement => {
  const el = document.getElementById(id) as HTMLButtonElement
  if(!el) throw new Error(`Button #${id} not found`)
  return el
}

export const createEl = (tag: string, className: string, content: string | SVGSVGElement =''): HTMLElement => {
  const el = document.createElement(tag)
  el.classList.add(...className.split(' '))

  if(content instanceof SVGSVGElement) el.append(content)
  else if(content !== '') el.textContent = content
  return el
}

export const modalWindow = (content: HTMLElement | string) => {
  const overlay = createEl('div', 'overlay')
  const modal = createEl('div', 'modal')
  const title = createEl('h6', 'modal__title', 'Готово!')
  const closeModal = createEl('button', 'close-modal button', 'закрыть')

  const body = typeof content === 'string'
    ? createEl('p', 'modal__body', content)
    : content

  const closeHandler = (evt: MouseEvent) => {
    const target = evt.target as HTMLElement
    if(target === overlay || target === closeModal) {
      overlay.remove()
      modal.remove()
      document.body.removeEventListener('click', closeHandler)
    }
  }

  modal.append(title, body, closeModal)
  document.body.append(overlay, modal)

  requestAnimationFrame(() => {
    modal.classList.add('modal__active')
  })

  document.body.addEventListener('click', closeHandler)
}


function createIcon(d: string, viewBox: string): SVGSVGElement{
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', viewBox)

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)

  svg.append(path)
  return svg
}

interface IconInt {
  d: string
  viewBox: string
}

const ICONS = {
  close: {
    d: "M195.2 195.2a64 64 0 0 1 90.496 0L512 421.504 738.304 195.2a64 64 0 0 1 90.496 90.496L602.496 512 828.8 738.304a64 64 0 0 1-90.496 90.496L512 602.496 285.696 828.8a64 64 0 0 1-90.496-90.496L421.504 512 195.2 285.696a64 64 0 0 1 0-90.496z",
    viewBox: '0 0 1024 1024'
  },
  check: {
    d: "M8.294 16.998c-.435 0-.847-.203-1.111-.553L3.61 11.724a1.392 1.392 0 0 1 .27-1.951 1.392 1.392 0 0 1 1.953.27l2.351 3.104 5.911-9.492a1.396 1.396 0 0 1 1.921-.445c.653.406.854 1.266.446 1.92L9.478 16.34a1.39 1.39 0 0 1-1.12.656c-.022.002-.042.002-.064.002z",
    viewBox: '0 0 20 20'
  },
  back: {
    d: "M9.66088 8.53078C9.95402 8.23813 9.95442 7.76326 9.66178 7.47012C9.36913 7.17698 8.89426 7.17658 8.60112 7.46922L9.66088 8.53078ZM4.47012 11.5932C4.17698 11.8859 4.17658 12.3607 4.46922 12.6539C4.76187 12.947 5.23674 12.9474 5.52988 12.6548L4.47012 11.5932ZM5.51318 11.5771C5.21111 11.2936 4.73648 11.3088 4.45306 11.6108C4.16964 11.9129 4.18475 12.3875 4.48682 12.6709L5.51318 11.5771ZM8.61782 16.5469C8.91989 16.8304 9.39452 16.8152 9.67794 16.5132C9.96136 16.2111 9.94625 15.7365 9.64418 15.4531L8.61782 16.5469ZM5 11.374C4.58579 11.374 4.25 11.7098 4.25 12.124C4.25 12.5382 4.58579 12.874 5 12.874V11.374ZM15.37 12.124V12.874L15.3723 12.874L15.37 12.124ZM17.9326 13.1766L18.4614 12.6447V12.6447L17.9326 13.1766ZM18.25 15.7351C18.2511 16.1493 18.5879 16.4841 19.0021 16.483C19.4163 16.4819 19.7511 16.1451 19.75 15.7309L18.25 15.7351ZM8.60112 7.46922L4.47012 11.5932L5.52988 12.6548L9.66088 8.53078L8.60112 7.46922ZM4.48682 12.6709L8.61782 16.5469L9.64418 15.4531L5.51318 11.5771L4.48682 12.6709ZM5 12.874H15.37V11.374H5V12.874ZM15.3723 12.874C16.1333 12.8717 16.8641 13.1718 17.4038 13.7084L18.4614 12.6447C17.6395 11.8276 16.5267 11.3705 15.3677 11.374L15.3723 12.874ZM17.4038 13.7084C17.9435 14.245 18.2479 14.974 18.25 15.7351L19.75 15.7309C19.7468 14.572 19.2833 13.4618 18.4614 12.6447L17.4038 13.7084Z",
    viewBox: '0 0 24 24'
  }
} satisfies Record<string, IconInt>

type IconName = keyof typeof ICONS

export function getIcon(name: IconName, className?: string): SVGSVGElement {
  const {d, viewBox} = ICONS[name]
  const svg = createIcon(d, viewBox)
  svg.classList.add('icon', `icon__${name}`)
  if(className) svg.classList.add(...className.split(' '))
  return svg
}

