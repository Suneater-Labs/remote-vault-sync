import {App, PluginSettingTab} from "obsidian";
import {createRoot} from "react-dom/client";
import { useState, useRef, useCallback } from "react";
import VaultSync from "./main";
import { S3Config } from "./utils/s3";

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
	let timeout: ReturnType<typeof setTimeout>;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), ms);
	};
}

export interface VaultSyncSettings {
	s3: S3Config;
	devMode: boolean;
}

export const DEFAULT_SETTINGS: VaultSyncSettings = {
	s3: {
		accessKeyId: "",
		secretAccessKey: "",
		region: "",
		bucket: "",
	},
	devMode: false,
};

const tabs = [
	{key: "config", label: "S3 Configuration"},
	{key: "options", label: "Options"},
] as const;
type Tab = (typeof tabs)[number]["key"];

const VaultSyncSettingsUI = ({plugin}: {plugin: VaultSync}) => {
	const [tab, setTab] = useState<Tab>("config");
	const [settings, setSettings] = useState(plugin.settings);

	const debouncedSave = useRef(debounce(() => void plugin.saveSettings(), 300)).current;

	const update = useCallback((mutate: () => void) => {
		mutate();
		setSettings({...plugin.settings});
		debouncedSave();
	}, [debouncedSave]);

	return (
		<div className="vault-sync">
			<div className="flex w-full gap-1 mb-4">
				{tabs.map((t) => (
					<button
						key={t.key}
						className={`px-4 py-2 rounded-t rounded-b-none cursor-pointer text-sm text-semibold ${tab === t.key ? "bg-(--background-modifier-hover) text-(--text-normal)" : "bg-transparent text-(--text-muted) hover:bg-(--background-modifier-hover) hover:text-(--text-normal)"}`}
						onClick={() => setTab(t.key)}
					>
						{t.label}
					</button>
				))}
			</div>

			{tab === "config" && (
				<div className="flex flex-col gap-4 px-2">
					<div className="flex justify-between items-center">
						<span>Access key ID</span>
						<input
							type="text"
							value={settings.s3.accessKeyId}
							onChange={(e) => update(() => { plugin.settings.s3.accessKeyId = e.target.value; })}
						/>
					</div>
					<div className="flex justify-between items-center">
						<span>Secret access key</span>
						<input
							type="password"
							value={settings.s3.secretAccessKey}
							onChange={(e) => update(() => { plugin.settings.s3.secretAccessKey = e.target.value; })}
						/>
					</div>
					<div className="flex justify-between items-center">
						<span>Region</span>
						<input
							type="text"
							value={settings.s3.region}
							onChange={(e) => update(() => { plugin.settings.s3.region = e.target.value; })}
						/>
					</div>
					<div className="flex justify-between items-center">
						<span>Bucket name</span>
						<input
							type="text"
							value={settings.s3.bucket}
							onChange={(e) => update(() => { plugin.settings.s3.bucket = e.target.value; })}
						/>
					</div>
					<button className="bg-(--interactive-accent) text-(--text-on-accent) cursor-pointer self-end" onClick={() => void plugin.connect()}>Connect</button>
				</div>
			)}

			{tab === "options" && (
				<div className="flex flex-col gap-4">
					<div className="flex justify-between items-center">
						<span>Developer mode</span>
						<div
							className={`checkbox-container cursor-pointer ${settings.devMode ? "is-enabled" : ""}`}
							onClick={() => update(() => { plugin.settings.devMode = !plugin.settings.devMode; })}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

export class VaultSyncSettingTab extends PluginSettingTab {
	plugin: VaultSync;

	constructor(app: App, plugin: VaultSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();
		createRoot(this.containerEl).render(<VaultSyncSettingsUI plugin={this.plugin} />);
	}
}

