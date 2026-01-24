export default {
	plugins: {
		"@tailwindcss/postcss": {},
		"postcss-prefix-selector": {
			prefix: ".remote-vault-sync",
			transform(prefix, selector) {
				if (selector.match(/^(html|:root|\.remote-vault-sync-|\.nav-file)/)) return selector;
				// Output both: descendant (.remote-vault-sync .class) and same-element (.remote-vault-sync.class)
				return `${prefix} ${selector}, ${prefix}${selector}`;
			}
		}
	}
}
