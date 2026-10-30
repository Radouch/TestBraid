<script setup lang="ts">
import arrowUp from 'bootstrap-icons/icons/arrow-up.svg?raw'
import arrowDown from 'bootstrap-icons/icons/arrow-down.svg?raw'
import arrowLeft from 'bootstrap-icons/icons/arrow-left.svg?raw'
import arrowLeftRight from 'bootstrap-icons/icons/arrow-left-right.svg?raw'
import arrowCounterclockwise from 'bootstrap-icons/icons/arrow-counterclockwise.svg?raw'
import boxArrowUpRight from 'bootstrap-icons/icons/box-arrow-up-right.svg?raw'
import checkLg from 'bootstrap-icons/icons/check-lg.svg?raw'
import checkCircle from 'bootstrap-icons/icons/check2-circle.svg?raw'
import chevronUp from 'bootstrap-icons/icons/chevron-up.svg?raw'
import chevronDown from 'bootstrap-icons/icons/chevron-down.svg?raw'
import circle from 'bootstrap-icons/icons/circle.svg?raw'
import circleHalf from 'bootstrap-icons/icons/circle-half.svg?raw'
import dash from 'bootstrap-icons/icons/dash-lg.svg?raw'
import exclamationCircle from 'bootstrap-icons/icons/exclamation-circle.svg?raw'
import copy from 'bootstrap-icons/icons/copy.svg?raw'
import eye from 'bootstrap-icons/icons/eye.svg?raw'
import filePlus from 'bootstrap-icons/icons/file-earmark-plus.svg?raw'
import folderPlus from 'bootstrap-icons/icons/folder-plus.svg?raw'
import image from 'bootstrap-icons/icons/image.svg?raw'
import link from 'bootstrap-icons/icons/link-45deg.svg?raw'
import listCheck from 'bootstrap-icons/icons/list-check.svg?raw'
import pencil from 'bootstrap-icons/icons/pencil-square.svg?raw'
import play from 'bootstrap-icons/icons/play-btn.svg?raw'
import plus from 'bootstrap-icons/icons/plus-lg.svg?raw'
import save from 'bootstrap-icons/icons/floppy.svg?raw'
import text from 'bootstrap-icons/icons/text-left.svg?raw'
import threeDots from 'bootstrap-icons/icons/three-dots.svg?raw'
import threeDotsVertical from 'bootstrap-icons/icons/three-dots-vertical.svg?raw'
import trash from 'bootstrap-icons/icons/trash3.svg?raw'
import upload from 'bootstrap-icons/icons/upload.svg?raw'
import x from 'bootstrap-icons/icons/x-lg.svg?raw'

const icons = {
  'arrow-up': arrowUp, 'arrow-down': arrowDown, 'arrow-left': arrowLeft, 'arrow-left-right': arrowLeftRight,
  'arrow-counterclockwise': arrowCounterclockwise, 'box-arrow-up-right': boxArrowUpRight,
  'check-lg': checkLg, 'check2-circle': checkCircle, 'chevron-up': chevronUp, 'chevron-down': chevronDown,
  circle, 'circle-half': circleHalf, 'dash-lg': dash, 'exclamation-circle': exclamationCircle,
  copy, eye, 'file-earmark-plus': filePlus, 'folder-plus': folderPlus, image,
  'link-45deg': link, 'list-check': listCheck, 'pencil-square': pencil, 'play-btn': play,
  'plus-lg': plus, floppy: save, 'text-left': text, 'three-dots': threeDots,
  'three-dots-vertical': threeDotsVertical, trash3: trash, upload, 'x-lg': x,
} as const
defineProps<{ name: keyof typeof icons }>()

// Only trusted, build-time package assets reach v-html. Never pass authored
// content here. Own the outer SVG so every icon is decorative and unfocusable;
// the surrounding control supplies its translated text or accessible name.
function paths(svg: string): string {
  return svg.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}
</script>

<template>
  <svg class="app-icon" :data-icon="name" viewBox="0 0 16 16" fill="currentColor"
    aria-hidden="true" focusable="false" v-html="paths(icons[name])" />
</template>

<style scoped>
.app-icon { display: inline-block; width: 1.25em; height: 1.25em; flex-shrink: 0; vertical-align: -.2em; }
</style>
