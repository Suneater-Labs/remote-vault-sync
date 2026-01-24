import {Command} from 'obsidian';
import VaultSync from './main';

export function createCommands(plugin: VaultSync): Command[] {
	return [
		{
			id: 'push',
			name: 'Push to remote',
			callback: () => plugin.push(),
		},
		{
			id: 'pull',
			name: 'Pull from remote',
			callback: () => plugin.pull(),
		},
		{
			id: 'restore',
			name: 'Restore changes',
			callback: () => plugin.restore(),
		},
		{
			id: 'log',
			name: 'Show log',
			callback: () => plugin.showLogModal(),
		},
		{
			id: 'diff',
			name: 'View changes/diff',
			callback: () => plugin.showDiffModal(),
		},
	];
}
