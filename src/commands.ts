import {Command} from 'obsidian';
import VaultSync from './main';

export function createCommands(plugin: VaultSync): Command[] {
	return [
		{
			id: 'remote-vault-sync-push',
			name: 'Push to Remote',
			callback: () => plugin.push(),
		},
		{
			id: 'remote-vault-sync-pull',
			name: 'Pull from Remote',
			callback: () => plugin.pull(),
		},
		{
			id: 'remote-vault-sync-restore',
			name: 'Restore Changes',
			callback: () => plugin.restore(),
		},
		{
			id: 'remote-vault-sync-log',
			name: 'Show Log',
			callback: () => plugin.showLogModal(),
		},
		{
			id: 'remote-vault-sync-diff',
			name: 'View Changes',
			callback: () => plugin.showDiffModal(),
		},
	];
}
