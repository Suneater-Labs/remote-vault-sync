import {Command} from 'obsidian';
import VaultSync from './main';

export function createCommands(plugin: VaultSync): Command[] {
	return [
		{
			id: 'push',
			name: 'Push to Remote',
			callback: () => plugin.push(),
		},
		{
			id: 'pull',
			name: 'Pull from Remote',
			callback: () => plugin.pull(),
		},
		{
			id: 'restore',
			name: 'Restore Changes',
			callback: () => plugin.restore(),
		},
		{
			id: 'log',
			name: 'Show Log',
			callback: () => plugin.showLogModal(),
		},
		{
			id: 'diff',
			name: 'View Changes/Diff',
			callback: () => plugin.showDiffModal(),
		},
	];
}
