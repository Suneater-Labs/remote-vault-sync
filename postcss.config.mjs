export default {
	plugins: {
		"@tailwindcss/postcss": {},
		"postcss-prefix-selector": {
			prefix: ".remote-vault-sync",
			transform(prefix, selector) {
				if (selector.match(/^(html|:root|\.remote-vault-sync-|\.nav-file)/)) return selector;
				return `${prefix} ${selector}`;
			}
		}
	}
}
