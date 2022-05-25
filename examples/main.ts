import { join, parse } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync } from 'fs';

import { showProgress } from './show-progress';
import { Downloader } from '../src';

const urls = [
	"https://proof.ovh.net/files/1Mb.dat",
	"https://proof.ovh.net/files/10Mb.dat",
	"http://ipv4.download.thinkbroadband.com/5MB.zip",
	"http://ipv4.download.thinkbroadband.com/10MB.zip",

	/*
	"https://proof.ovh.net/files/1Mb.dat",
	"https://proof.ovh.net/files/10Mb.dat",
	"https://proof.ovh.net/files/100Mb.dat",
	"https://proof.ovh.net/files/1Gb.dat",
	"https://proof.ovh.net/files/10Gb.dat",
	"http://ipv4.download.thinkbroadband.com/5MB.zip",
	"http://ipv4.download.thinkbroadband.com/10MB.zip",
	"http://ipv4.download.thinkbroadband.com/20MB.zip",
	"http://ipv4.download.thinkbroadband.com/50MB.zip",
	"http://ipv4.download.thinkbroadband.com/100MB.zip",
	"http://ipv4.download.thinkbroadband.com/200MB.zip",
	"http://ipv4.download.thinkbroadband.com/512MB.zip",
	"http://ipv4.download.thinkbroadband.com/1GB.zip",
	*/

	//"https://example.com/unknown/path",

	//"https://filesamples.com/samples/document/txt/sample1.txt",
	//"https://filesamples.com/samples/document/txt/sample2.txt",
	//"https://filesamples.com/samples/document/txt/sample3.txt",
];

async function main() {
	const dir = join(__dirname, '/output/');
	if (!existsSync(dir)) mkdirSync(dir);

	const files = urls.map(url => ({ url, file: join(dir, parse(url).base) }));
	console.time('download');
	const downloader = new Downloader({ dir, tempDir: tmpdir() });
	await showProgress(downloader);
	try {
		//await downloader.download(files.map(x => x.url));
		await downloader.download(files[2]);
	} finally {
		await downloader.close();
	}
	console.timeEnd('download');
	console.log('\nDONE.');
}

main();
