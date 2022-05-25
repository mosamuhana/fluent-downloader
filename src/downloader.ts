import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import { WorkerPool } from '@devteks/node-workers';

import { Options, FilePart, Progress, RemoteFile, ProgressSummary, DownloadMetadata } from './types';
import { getUrlFileAndSize, getUrlSize } from './url';
import {
	getFileInfo,
	readJsonFile,
	writeJsonFile,
	addFileSuffix,
	partition,
	getPartSize,
	deleteFile,
	parseInput,
} from './utils';

type ProgressListener = (progress: Progress) => void;
type PartProgressListener = (part: FilePart) => void;
type ProgressSummaryListener = (info: ProgressSummary) => void;
type ErrorListener = (errorInfo: ProgressSummary & { error: any }) => void;

export interface Downloader extends EventEmitter {
	on(event: 'total', listener: ProgressSummaryListener): this;
	once(event: 'total', listener: ProgressSummaryListener): this;
	off(event: 'total', listener: ProgressSummaryListener): this;

	on(event: 'complete', listener: ProgressSummaryListener): this;
	once(event: 'complete', listener: ProgressSummaryListener): this;
	off(event: 'complete', listener: ProgressSummaryListener): this;

	on(event: 'error', listener: ErrorListener): this;
	once(event: 'error', listener: ErrorListener): this;
	off(event: 'error', listener: ErrorListener): this;

	on(event: 'progress', listener: ProgressListener): this;
	once(event: 'progress', listener: ProgressListener): this;
	off(event: 'progress', listener: ProgressListener): this;

	on(event: 'part-progress', listener: PartProgressListener): this;
	once(event: 'part-progress', listener: PartProgressListener): this;
	off(event: 'part-progress', listener: PartProgressListener): this;
}

export class Downloader extends EventEmitter {
	#dir?: string;
	#tempDir?: string;
	#_pool?: WorkerPool;
	#metadataMap: Record<string, DownloadMetadata> = {};
	#errorMap: Record<string, any> = {};

	constructor(options?: Options) {
		super();
		this.#dir = options?.dir;
		this.#tempDir = options?.tempDir;
	}

	get hasErrors() {
		return Object.keys(this.#errorMap).length > 0;
	}

	get error() {
		const errors = Object.values(this.#errorMap);
		if (errors.length) {
			return errors.map(e => e.message as string).join('\n');
		}
		return undefined;
	}

	get #pool(): WorkerPool {
		if (!this.#_pool) {
			const pool = new WorkerPool({ workerScript: WORKER_SCRIPT });
			pool.on('progress', (part: FilePart) => this.#onProgress(part));
			this.#_pool = pool;
		}
		return this.#_pool;
	}

	#onProgress(part: FilePart) {
		const url = part.url;
		const metadata = this.#metadataMap[url];

		const parts = metadata.parts;
		parts[part.index].downloaded = part.downloaded;
		this.emit('part-progress', part);

		const finishedParts = parts.filter(x => x.downloaded == x.size).length;
		metadata.downloaded = parts.map(x => x.downloaded).reduce((a, b) => a + b, 0);
		let percent = 100;
		if (metadata.downloaded != metadata.size) {
			percent = Math.round(metadata.downloaded / metadata.size * 10000) / 100;
		}

		this.emit('progress', {
			downloaded: metadata.downloaded,
			total: metadata.size,
			percent,
			partCount: parts.length,
			finishedParts,
			file: metadata.file,
			url,
		} as Progress);
	}

	async #runDownload(url: string) {
		delete this.#errorMap[url];

		const metadata = this.#metadataMap[url];
		const { file, size } = metadata;

		this.emit('total', { url, file, size, downloaded: metadata.downloaded });

		const parts = metadata.parts.filter(x => x.downloaded != x.size);
		const result = await this.#pool.run<FilePart, boolean>(parts);
		if (result.errors.length) {
			const errorMessage = result.errors.map(x => x.message).join('\n');
			const error = new Error(`Download of '${url}'\n${errorMessage}`);
			this.#errorMap[url] = error;
			this.emit('error', { url, file, size, downloaded: metadata.downloaded, error });
			return;
		}

		await finishDownload(metadata);

		this.emit('complete', { url, file, size, downloaded: metadata.downloaded });
	}

	async close() {
		if (this.#_pool) {
			await this.#_pool.close();
		}
	}

	async #download(files: RemoteFile[]): Promise<void> {
		if (files.length === 0) {
			throw new Error('invalid parameters');
		}
		files = files.filter(x => !this.#metadataMap[x.url]);
		if (files.length) {
			const list = await getMetadataList(files, this.#dir, this.#tempDir);
			list.forEach(metadata => this.#metadataMap[metadata.url] = metadata);
			await Promise.all(list.map(({ url }) => this.#runDownload(url)));
		}
	}

	async download(input: string | RemoteFile | (string | RemoteFile)[]): Promise<void> {
		let files = parseInput(input);
		await this.#download(files);
	}

	static async download(input: string | RemoteFile | (string | RemoteFile)[], options?: Options): Promise<void> {
		const files = parseInput(input)
		const downloader = new Downloader(options);
		try {
			await downloader.#download(files);
		} catch (ex) {
		} finally {
			await downloader.close();
		}
		const error = downloader.error;
		if (error) {
			throw new Error(error);
		}
	}
}

async function deleteMetadataFiles(metadata: DownloadMetadata) {
	const files: string[] = [...metadata.parts.map(x => x.file), metadata.metadataFile];
	const all = await Promise.all(files.map(deleteFile));
	return all.every(x => x);
}

async function finishDownload(metadata: DownloadMetadata) {
	// merge file parts
	const { file, parts } = metadata;
	const writer = createWriteStream(file);
	const files: string[] = [];
	parts.forEach(part => files[part.index] = part.file);
	const readers = files.map(file => createReadStream(file));
	for (const reader of readers) {
		reader.pipe(writer, { end: false });
		await finished(reader);
	}

	writer.close();

	// delete files
	await deleteMetadataFiles(metadata);
}

async function readMetadata(metadataFile: string) {
	const metadata: DownloadMetadata = await readJsonFile(metadataFile);

	metadata.parts = await Promise.all(
		metadata.parts.map(async part => {
			const info = await getFileInfo(part.file);
			const downloaded = info.exists ? info.size : 0;
			return { ...part, downloaded };
		})
	);

	return metadata;
}

async function getMetadataList(files: RemoteFile[], dir?: string, tempDir?: string) {
	const createMetadataFilePath = (file: string): string => addFileSuffix(file, '.metadata.json');

	function createMetadata(url: string, file: string, size: number): DownloadMetadata {
		const partFile = addFileSuffix(file, '', tempDir);
		//const partFile = addFileSuffix(file, '');
		const parts = partition(size, getPartSize(size)).map<FilePart>(({ start, end }, index) => ({
			index,
			url,
			start,
			end,
			file: partFile + '-part' + index,
			size: end - start + 1,
			downloaded: 0
		}));
		return { url, file, size, downloaded: 0, parts, metadataFile: createMetadataFilePath(file) };
	}

	async function initDownload({ url, file }: RemoteFile) {
		let metadata: DownloadMetadata;
		let metadataFile: string;

		if (file) {
			metadataFile = createMetadataFilePath(file);
			if (existsSync(metadataFile)) {
				metadata = await readMetadata(metadataFile);
			} else {
				const size = await getUrlSize(url);
				metadata = createMetadata(url, file, size);
			}
		} else {
			const info = await getUrlFileAndSize(url);
			file = join(dir ?? process.cwd(), info.file);
			metadataFile = createMetadataFilePath(file);
			if (existsSync(metadataFile)) {
				metadata = await readMetadata(metadataFile);
			} else {
				metadata = createMetadata(url, file, info.size);
			}
		}

		const downloaded = metadata.parts.reduce((acc, part) => acc + part.downloaded, 0);

		const fileInfo = await getFileInfo(file);
		let completed = false;

		if (fileInfo.exists) {
			completed = metadata.size == fileInfo.size;
			if (completed) {
				if (downloaded > 0) await deleteMetadataFiles(metadata);
				metadata.parts.forEach(x => x.downloaded = x.size);
			} else {
				await deleteFile(file);
			}
		}

		metadata.downloaded = metadata.parts.reduce((acc, part) => acc + part.downloaded, 0);

		if (!completed) {
			await writeJsonFile(metadataFile, metadata);
		}

		return metadata;
	}

	const metadataList = await Promise.all(files.map(initDownload));
	return metadataList.filter(x => x.size != x.downloaded);
}

const WORKER_SCRIPT = `
const axios = require('axios');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { startWorker } = require('@devteks/node-workers');

async function getStream(url, start, end) {
	try {
		const response = await axios({
			url,
			responseType: 'stream',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36',
				Range: 'bytes=' + start + '-' + end
			}
		});
		return response.data;
	} catch (ex) {
		throw new Error(ex.message || ex.toString());
	}
}

startWorker(async (part, emit) => {
	const { url, file, start, end } = part;
	let current = part.downloaded;

	const reader = await getStream(url, start + current, end);
	const writer = createWriteStream(file, { flags: current > 0 ? 'a' : 'w' });

	reader.on('data', chunk => {
		current += chunk.length;
		part.downloaded = current;
		emit('progress', part);
	});

	await pipeline(reader, writer);
});
`;
