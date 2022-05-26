import mimeDb from 'mime-db';

const EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;

function getAllExtensions() {
	//const mimeDb: Record<string, any> = require('mime-db');
	const map: Record<string, string[]> = {};
	Object.entries(mimeDb).forEach(([type, mime]) => {
		const exts = mime.extensions;
		if (exts && exts.length) {
			map[type] = exts as string[];
		}
	});
	return map;
}

const EXTENSIONS = getAllExtensions();

export function getExtension(type?: string): string | false {
	if (typeof type === 'string') {
		const matches = EXTRACT_TYPE_REGEXP.exec(type);
		if (matches) {
			const exts = EXTENSIONS[matches[1].toLowerCase()];
			if (exts && exts.length) {
				return exts[0];
			}
		}
	}
	return false;
}
