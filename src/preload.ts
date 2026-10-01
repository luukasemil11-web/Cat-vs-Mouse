import { contextBridge, ipcRenderer } from 'electron'
import type { GameState } from './types'

contextBridge.exposeInMainWorld('cursorCat', {
	onState: (cb: (state: GameState) => void) => {
		ipcRenderer.on('state', (_event, state: GameState) => cb(state))
	},
})
