import { extname, parse } from 'node:path';
import { IncomingHttpHeaders } from 'node:http';
import axios, { AxiosResponse } from 'axios';

import { getExtension } from './mime';

export async function getUrlFileAndSize(urlOrResponse: string | AxiosResponse): Promise<{ url: string; file: string; size: number; }> {
	if (typeof urlOrResponse === 'string') {
		try {
			const response = await axios.head(urlOrResponse);
			return getUrlFileAndSize(response);
		} catch (ex: any) {
			throw new Error(ex.message || ex.toString());
		}
	}

	const url = urlOrResponse.config.url!;
	const headers = urlOrResponse.headers;
	const size = getContentLength(headers) ?? 0;
	let file = getFileName(url, headers);
	const ext = extname(file);
	if (ext == '' || ext == '.') {
		if (file.endsWith('.')) file = file.substring(0, file.length - 1);
		const ext2 = getExtension(headers[CONTENT_TYPE]);
		if (ext2) {
			file += '.' + ext2;
		}
	}
	return { url, file, size };
}

export async function getUrlSize(urlOrResponse: string | AxiosResponse): Promise<number> {
	if (typeof urlOrResponse === 'string') {
		try {
			const response = await axios.head(urlOrResponse);
			return getUrlSize(response);
		} catch (ex: any) {
			throw new Error(ex.message || ex.toString());
		}
	}

	return getContentLength(urlOrResponse.headers) ?? 0;
}

function getUrlPath(url: string) {
	try {
		return new URL(url, "https://example.com").pathname;
	} catch (e) {}
	return undefined;
}

function getUrlFile(url: string) {
	try {
		const pathname = getUrlPath(url);
		if (pathname) {
			const { base } = parse(pathname);
			return base;
		}
	} catch (e) {}
	return '';
}

function getUrlFileWithExtension(url: string) {
	try {
		const pathname = getUrlPath(url);
		if (pathname) {
			const { ext, base } = parse(pathname);
			if (ext.length && ext != '.' && ext != '..') {
				return base;
			}
		}
	} catch (e) {}
	return undefined;
}

function getFileName(url: string, headers: Record<string, string>): string {
	let fileName: string | undefined;

	if (fileName = getUrlFileWithExtension(url)) return fileName;
	if (fileName = getFilenameFromContentDisposition(headers)) return fileName;

	const baseName = getUrlFile(url);
	if (baseName.length) {
		fileName = baseName;
	} else {
		fileName = `${new URL(url).hostname}.html`;
	}
	return fileName;
}

function getFilenameFromContentDisposition(headers: IncomingHttpHeaders): string | undefined {
  let fileName = (headers[CONTENT_DISPOSITION] || '').trim();
  if (fileName.length) {
    let matches: RegExpMatchArray | null;
    if ((matches = fileName.match(RX_FILENAME_AND_ENCODING))) {
      fileName = matches[1];
    } else if ((matches = fileName.match(RX_FILENAME_WITH_QUOTES))) {
      fileName = matches[1];
    } else if ((matches = fileName.match(RX_FILENAME_WITHOUT_QUOTES))) {
      fileName = matches[1];
    }

    return fileName.replace(/[/\\]/g, '');
  }
	return undefined;
}

function getContentLength(headers: Record<string, string>) {
	const len = headers && headers[CONTENT_LENGTH] ? parseInt(headers[CONTENT_LENGTH], 10) : undefined;
	return len && !isNaN(len) ? len : undefined;
}

// match everything after the specified encoding behind a case-insensitive `filename*=`
const RX_FILENAME_AND_ENCODING = /.*filename\*=.*?'.*?'([^"].+?[^"])(?:(?:;)|$)/i;
// match everything inside the quotes behind a case-insensitive `filename=`
const RX_FILENAME_WITH_QUOTES = /.*filename="(.*?)";?/i;
// match everything immediately after `filename=` that isn't surrounded by quotes and is followed by either a `;` or the end of the string
const RX_FILENAME_WITHOUT_QUOTES = /.*filename=([^"].+?[^"])(?:(?:;)|$)/i;

const CONTENT_DISPOSITION = 'content-disposition';
const CONTENT_LENGTH = 'content-length';
const CONTENT_TYPE = 'content-type';
