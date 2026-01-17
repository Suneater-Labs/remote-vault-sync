import {Plugin, addIcon} from 'obsidian';

// Cloud with history/restore icon
const CLOUD_BACKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><polyline points="16 16 12 12 8 16"/></svg>`;

// Ribbon button management for push/pull/restore actions
export class RibbonButtons {
	private pushEl: HTMLElement;
	private pullEl: HTMLElement;
	private restoreEl: HTMLElement;

	constructor(plugin: Plugin, onPush: () => void, onPull: () => void, onRestore: () => void) {
		addIcon('cloud-backup', CLOUD_BACKUP_SVG);
		this.pushEl = plugin.addRibbonIcon('upload-cloud', 'Push to Remote', onPush);
		this.restoreEl = plugin.addRibbonIcon('cloud-backup', 'Restore Changes', onRestore);
		this.pullEl = plugin.addRibbonIcon('download-cloud', 'Pull from Remote', onPull);
	}

	reorder() {
		const ribbon = this.pushEl.parentElement;
		if (ribbon) {
			ribbon.appendChild(this.pushEl);
			ribbon.appendChild(this.restoreEl);
			ribbon.appendChild(this.pullEl);
		}
	}

	setLocked(locked: boolean) {
		this.pushEl.toggleClass('remote-vault-sync-ribbon-disabled', locked);
		this.pullEl.toggleClass('remote-vault-sync-ribbon-disabled', locked);
		this.restoreEl.toggleClass('remote-vault-sync-ribbon-disabled', locked);
	}

	setRestoreDisabled(disabled: boolean) {
		this.restoreEl.toggleClass('remote-vault-sync-ribbon-disabled', disabled);
	}

	destroy() {
		this.pushEl.remove();
		this.pullEl.remove();
		this.restoreEl.remove();
	}
}
