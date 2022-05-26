#!/usr/bin/env node

import { resolve, parse } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { program } from 'commander';
import { ProgressBar } from '@devteks/progress';
import { hideCursor } from '@devteks/cursor';

import { Downloader } from '../dist/index.mjs';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

const KB = 1024;
const UNITS = ' KMGTPEZYXWVU';
const BAR_INFO = [
	' {bar} ',
	chalk.green('{percent}'),
	' [ ',
	chalk.cyan('{current}'),
	' / ',
	chalk.blue('{total}'),
	' ] ',
	chalk.magenta('{speed}'),
].join('');

function fmtSize(value, precision = 0) {
	precision = Math.min(Math.max(precision, 0), 3);
	const p = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(KB)), 12) : 0;
	let rate = value / Math.pow(KB, p);
	const pr = Math.pow(10, precision);
	rate = Math.round(rate * pr) / pr;
	return `${rate} ${UNITS[p].trim()}B`;
}

function limitUrlString(url, length) {
	if (url.length <= length) return url;

	url = url.split('#')[0].split('?')[0];
	if (url.length <= length) return url;

	const { protocol, pathname } = new URL(url);
	const { base } = parse(pathname);

	if (!protocol.length || !base.length) {
		throw new Error('Invalid downloadable URL');
	}

	let suffix = base.length + 1;
	let prefix = protocol.length + 2;
	let n = length - (prefix + suffix + 3);
	if (n < 0) {
		n = Math.abs(n);
		if (prefix < n) {
			n -= prefix;
			prefix = 0;
			suffix -= n;
			n = 0;
		} else {
			prefix -= n;
			n = 0;
		}
	} else {
		const half = Math.round(n / 2);
		suffix += half;
		prefix += (n - half);
	}

	return url.slice(0, prefix) + '...' + url.slice(-suffix);
}

function getCursorPos() {
	return new Promise((resolve) => {
		const prevRawMode = process.stdin.isRaw;
		process.stdin.setRawMode(true);

		const onReadable = () => {
			let row = 0;
			let col = 0;
			const str = process.stdin.read().toString();
			const matches = /\[(\d+)\;(\d+)R$/.exec(str);
			if (matches) {
				[row, col] = matches.slice(1, 3).map(Number);
			}
			process.stdin.setRawMode(prevRawMode);
			process.stdin.off('readable', onReadable);
			resolve({ row, col });
		};

		process.stdin.once('readable', onReadable);
		process.stdout.write('\u001b[6n');
	});
}

async function initProgress(downloader) {
	hideCursor(process.stdout);
	// write code to clear the screen
	//process.stdout.write('\u001Bc');

	const bars = {};
	const { row } = await getCursorPos();
	let barCount = row;

	downloader.on('total', ({ url, size }) => {
		bars[url] = new ProgressBar({
			format: chalk.yellow(limitUrlString(url, 40)) + BAR_INFO,
			total: size,
			current: 0,
			line: barCount++,
			width: 40,
			formatValue: x => fmtSize(x, 1),
		});
	});

	downloader.on('progress', ({ url, downloaded }) => bars[url].tick(downloaded));
}

const resolvePath = arg => arg == null ? undefined : resolve(arg);

function getDirOptions(options) {
	const dir = resolvePath(options.dir);
	let tempDir = resolvePath(options.tmpdir);
	if (dir && !existsSync(dir)) mkdirSync(dir);
	if (!tempDir) {
		tempDir = tmpdir();
	} else {
		if (!existsSync(tempDir)) mkdirSync(tempDir);
	}
	return { dir, tempDir };
}

async function parseBatchFile(file) {
	if (!existsSync(file)) {
		console.error(`file ${file} does not exist`);
		process.exit(1);
	}
	const content = await readFile(file, 'utf8');
	const result = [];
	content.split('\n').map(x => x.trim()).filter(x => x.length > 0).forEach((line) => {
		const [url, file] = line.split(' ');
		result.push({ url, file });
	});
	return result;
}

// --------------------------------------------------

const dirOption = ['-d, --dir [save_dir]', 'directory to save file to (generated filename)'];
const tempDirOption = ['-t, --tmpdir [temp_dir]', 'temporary directory to save downloaded parts'];

program.name(pkg.cliName).version(pkg.version);

program
	.command('start <url>', { isDefault: true })
	.usage('<url> [options]')
	.description('start a new download')
	.option('-f, --file [file_path]', 'filename to save the file as in the current working directory')
	.option(dirOption[0], dirOption[1])
	.option(tempDirOption[0], tempDirOption[1])
	.action(async (url, options) => {
		if(!url) {
			console.error(`url is required`);
			process.exit(1);
		}

		const { dir, tempDir } = getDirOptions(options);
		const file = resolvePath(options.file);

		console.time('download');
		const downloader = new Downloader({ dir, tempDir });
		await initProgress(downloader);
		try {
			await downloader.download({ url, file });
		} finally {
			await downloader.close();
		}
		console.timeEnd('download');
	});

program
	.command('batch <file>')
	.usage('<file> [options]')
	.description('start a batch download')
	.option(dirOption[0], dirOption[1])
	.option(tempDirOption[0], tempDirOption[1])
	.action(async (file, options) => {
		const { dir, tempDir } = getDirOptions(options);
		const files = await parseBatchFile(file);

		console.time('download');
		const downloader = new Downloader({ dir, tempDir });
		await initProgress(downloader);
		try {
			await downloader.download(files);
		} finally {
			await downloader.close();
		}
		console.timeEnd('download');
	});

program.parse();
