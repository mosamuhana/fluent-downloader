export interface Options {
	/**
	 * The directory to download the files to.
	 * default to process.cwd()
	 */
	dir?: string;
	/**
	 * directory to download file parts to
	 * default to `{dir}`
	 */
	tempDir?: string;
}

export interface FilePart {
	index: number;
	url: string;
	file: string;
	start: number;
	end: number;
	size: number;
	downloaded: number;
}

export interface Progress {
	url: string;
	file: string;
	total: number;
	downloaded: number;
	percent: number;
	partCount: number;
	finishedParts: number;
}

export interface ProgressSummary {
	url: string;
	file: string;
	size: number;
	downloaded: number;
}

export interface RemoteFile {
	url: string;
	file?: string;
}

// PRIVATE TYPES

export interface DownloadMetadata {
	url: string;
	file: string;
	downloaded: number;
	size: number;
	parts: FilePart[];
	metadataFile: string;
}

export interface Range {
	start: number;
	end: number;
}
