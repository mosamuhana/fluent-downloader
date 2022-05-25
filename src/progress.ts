import { parse } from 'node:path';
import { ProgressBar } from '@devteks/progress';
import { hideCursor } from '@devteks/cursor';

import { Downloader } from './downloader';
import { Progress } from './types';

const KB = 1024;
const UNITS = ' KMGTPEZYXWVU';

function fmtSize(value: number, precision: number = 0) {
	precision = Math.min(Math.max(precision, 0), 3);
	const p = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(KB)), 12) : 0;
	let rate = value / Math.pow(KB, p);
	const pr = Math.pow(10, precision);
	rate = Math.round(rate * pr) / pr;
	return `${rate} ${UNITS[p].trim()}B`;
}

function limitUrlString(url: string, length: number): string {
	if (url.length <= length) return url;

	url = url.split('#')[0]!.split('?')[0]!;
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
	return new Promise<{ row: number; col: number; }>((resolve) => {
		const prevRawMode = process.stdin.isRaw;
		process.stdin.setRawMode(true);

		const onReadable = () => {
			let row = 0;
			let col = 0;
			const str = process.stdin.read().toString() as string;
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

export async function showProgress(downloader: Downloader) {
	hideCursor(process.stdout);
	// write code to clear the screen
	//process.stdout.write('\u001Bc');

	const bars: Record<string, ProgressBar> = {};
	const { row } = await getCursorPos();
	let barCount = row;

	downloader.on('total', ({ url, size }) => {
		bars[url] = new ProgressBar({
			format: limitUrlString(url, 30) + ' {bar} {percent} {current} / {total} {speed}',
			total: size,
			current: 0,
			line: barCount++,
			width: 50,
			formatValue: fmtSize,
		});
	});

	downloader.on('progress', ({ url, downloaded }: Progress) => {
		bars[url].tick(downloaded);
	});
}
