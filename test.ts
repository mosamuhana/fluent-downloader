import axios, { AxiosError } from 'axios';
import { setTimeout as delay } from 'timers/promises';

async function getStream(url: string) {
	const response = await axios({
		url,
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.101 Safari/537.36'
		}
	});
	return response.data;
}

async function main() {
	const url = 'https://example.com/file.txt';
	console.log("The console size is:", process.stdout.getWindowSize());
	console.log("The console size is:", [process.stdout.columns, process.stdout.rows]);
	process.stdout.on('resize', () => {
		console.log('screen size has changed!');
		console.log(process.stdout.columns + 'x' + process.stdout.rows);
	});
	try {
		const res = await getStream(url);
	} catch (ex: any) {
		if (ex instanceof AxiosError) {
			console.log(ex.message || ex.toString());
		}
		//throw new Error(ex.toString());
		//throw new Error(ex.message || ex);
	}
	await delay(100_000)
}

main();
