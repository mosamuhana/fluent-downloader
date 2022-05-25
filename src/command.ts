import { join, parse, resolve } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { program, Command } from 'commander';

import { Downloader } from './downloader';
import { showProgress } from './progress';

const CMD = 'fdl';

interface DirOptions {
	dir?: string;
	tmpdir?: string;
}

interface StartCommandOptions extends DirOptions {
	file?: string;
}

const _resolve = (arg: string | undefined) => arg == null ? arg : resolve(arg);

const _getDirOptions = <T extends DirOptions>(options: T) => {
	const dir = _resolve(options.dir);
	let tempDir = _resolve(options.tmpdir);

	if (dir && !existsSync(dir)) mkdirSync(dir);
	if (!tempDir) {
		tempDir = tmpdir();
	} else {
		if (!existsSync(tempDir)) mkdirSync(tempDir);
	}
	return { dir, tempDir };
};

const _parseBatchFile = async (file: string) => {
	if (!existsSync(file)) {
		console.error(`file ${file} does not exist`);
		process.exit(1);
	}
	const content = await readFile(file, 'utf8');
	const result: {url: string; file?: string}[] = [];
	content.split('\n').map(x => x.trim()).filter(x => x.length > 0).forEach((line) => {
		const [url, file] = line.split(' ');
		result.push({ url, file });
	});
	return result;
};

// --------------------------------------------------

async function startAction(url: string, options: StartCommandOptions) {
	if(!url) {
		console.error(`a url is required, type ${CMD} start --help for help`);
		process.exit(1);
	}

	const { dir, tempDir } = _getDirOptions(options);
	const file = _resolve(options.file);

	console.time('download');
	const downloader = new Downloader({ dir, tempDir });
	await showProgress(downloader);
	try {
		await downloader.download({ url, file });
	} finally {
		await downloader.close();
	}
	console.timeEnd('download');
	console.log('\nDONE.');
}

async function batchAction(file: string, options: DirOptions) {
	const { dir, tempDir } = _getDirOptions(options);
	const files = await _parseBatchFile(file);

	console.time('download');
	const downloader = new Downloader({ dir, tempDir });
	await showProgress(downloader);
	try {
		await downloader.download(files);
	} finally {
		await downloader.close();
	}
	console.timeEnd('download');
	console.log('\nDONE.');
}

// --------------------------------------------------

function addDirOptions(program: Command) {
	program
		.option('-d, --dir [save_dir]', 'directory to save file to (generated filename)')
		.option('-t, --tmpdir [temp_dir]', 'temporary directory to save downloaded parts');
}

function startCommand(program: Command) {
	const cmd = program
		.command('start <url>')
		.description('start a new download');

	addDirOptions(cmd);

	cmd
		.option('-f, --file [file_path]', 'filename to save the file as in the current working directory')
		.action(startAction);
}

function batchCommand(program: Command) {
	const cmd = program
		.command('batch <file>')
		.description('start a batch download');

	addDirOptions(cmd);

	cmd
		.action(batchAction);
}

function main() {
	program.version(require('../package.json').version);

	startCommand(program);
	batchCommand(program);

	program.parse(process.argv);
}

main();
