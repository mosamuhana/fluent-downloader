import { join, parse } from 'node:path';
import { cpus } from 'node:os';
import { readFile, writeFile, unlink, lstat } from 'node:fs/promises';

import { RemoteFile, Range } from './types';

const MIN_PART_SIZE = 1024 * 1024;
const MAX_PARTS = cpus().length * 2;

export async function getFileInfo(file: string) {
	let exists = false;
	let size = 0;
	try {
		size = (await lstat(file)).size;
		exists = true;
	} catch (ex) {}
	return { file, size, exists };
}

export async function deleteFile(file: string) {
	try {
		await unlink(file);
		return true;
	} catch (ex) {}
	return false;
}

export async function readJsonFile(file: string): Promise<any> {
	const json = await readFile(file, 'utf8');
	return JSON.parse(json);
}

export async function writeJsonFile(file: string, data: any): Promise<void> {
	await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export function addFileSuffix(file: string, suffix: string, baseDir?: string): string {
	const { dir, name, ext } = parse(file);
	return join(baseDir || dir, `${name}${ext}${suffix}`);
}

export function partition(total: number, chunk: number) {
	const ranges: Range[] = [];
	let start = 0;
	while (total > chunk) {
		ranges.push({ start, end: start + chunk - 1 });
		start += chunk;
		total -= chunk;
	}
	if (total > 0) {
		ranges.push({ start, end: start + total - 1 });
	}
	return ranges;
}

export function getPartSize(size: number) {
	let partSize = Math.ceil(size / MAX_PARTS);
	if (partSize < MIN_PART_SIZE) partSize = MIN_PART_SIZE;
	return partSize;
}

function isValidUrl(str: string) {
  let url: URL;
  try {
		if (str && str.length > 1 && str.slice(0, 2) == '//') str = 'http:' + str;
    url = new URL(str);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function parseInput(input: string | RemoteFile | (string | RemoteFile)[]) {
	return (Array.isArray(input) ? input : [input])
		.map<RemoteFile>(url => {
			if (url == null) {
				throw new Error('invalid parameters');
			}
			const arg = typeof url === 'string' ? { url } : url;

			if (arg.url == null || !isValidUrl(arg.url)) {
				throw new Error('invalid url');
			}

			if (typeof arg.file !== 'undefined' && typeof arg.file !== 'string') {
				throw new Error('invalid file');
			}

			return arg;
		});
}
