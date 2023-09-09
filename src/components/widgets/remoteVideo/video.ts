import {
	SECRET_GOOGLE_API_KEY,
	SECRET_TWITCH_TOKEN,
	SECRET_TIKTOK_TOKEN
} from '$env/static/private';

const cache = new Map();

interface YoutubeData {
	videoTitle: string;
	videoThumbnail: string;
	videoUrl: string;
	channelTitle: string;
	publishedAt: string;
	width: string;
	height: string;
	duration: string;
}

export async function youtube(id: string): Promise<YoutubeData> {
	if (cache.has(id)) {
		return cache.get(id)!;
	}

	const response = await fetch(
		`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${SECRET_GOOGLE_API_KEY}`
	);
	const data = await response.json();

	const responseDuration = await fetch(
		`https://www.googleapis.com/youtube/v3/videos?id=${id}&part=contentDetails&key=${SECRET_GOOGLE_API_KEY}`
	);
	const dataDuration = await responseDuration.json();

	if (!(data?.items.length || dataDuration?.items.length > 0)) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: '',
			channelTitle: '',
			publishedAt: '',
			width: '',
			height: '',
			duration: ''
		};
	}

	const videoTitle = data?.items[0]?.snippet?.title ?? '';
	const videoThumbnail = data?.items[0]?.snippet?.thumbnails?.high?.url ?? '';
	const videoUrl = `https://www.youtube.com/watch?v=${id}`;
	const channelTitle = data?.items[0]?.snippet?.channelTitle ?? '';
	const publishedAt = data?.items[0]?.snippet?.publishedAt ?? '';

	//convert the ISO 8601 duration format to a readable time format
	const time = dataDuration?.items[0]?.contentDetails?.duration ?? '';
	function convertDuration(duration: any) {
		const dayTime = duration.split('T');
		const dayDuration = dayTime[0].replace('P', '');
		let dayList = dayDuration.split('D');
		let day: number;
		if (dayList.length === 2) {
			day = parseInt(dayList[0], 10) * 60 * 60 * 24;
			dayList = dayList[1];
		} else {
			day = 0;
			dayList = dayList[0];
		}
		let hourList = dayTime[1].split('H');
		let hour: number;
		if (hourList.length === 2) {
			hour = parseInt(hourList[0], 10) * 60 * 60;
			hourList = hourList[1];
		} else {
			hour = 0;
			hourList = hourList[0];
		}
		let minuteList = hourList.split('M');
		let minute: number;
		if (minuteList.length === 2) {
			minute = parseInt(minuteList[0], 10) * 60;
			minuteList = minuteList[1];
		} else {
			minute = 0;
			minuteList = minuteList[0];
		}
		const secondList = minuteList.split('S');
		let second: number;
		if (secondList.length === 2) {
			second = parseInt(secondList[0], 10);
		} else {
			second = 0;
		}
		return new Date((day + hour + minute + second) * 1000).toISOString().substr(11, 8);
	}

	const duration = convertDuration(time);

	const width = data?.items[0]?.snippet?.thumbnails?.high?.width ?? '';
	const height = data?.items[0]?.snippet?.thumbnails?.high?.height ?? '';

	const result = {
		videoTitle,
		videoThumbnail,
		videoUrl,
		channelTitle,
		publishedAt,
		width,
		height,
		duration
	};
	cache.set(id, result);
	return result;
}

export async function vimeo(id: string) {
	const vimeoApi = 'https://vimeo.com/api/v2/video/{video_id}.json';

	const response = await fetch(vimeoApi.replace('{video_id}', id));

	if (!response.ok) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: '',
			user_name: '',
			upload_date: '',
			duration: '',
			width: '',
			height: ''
		};
	}
	const data = await response.json();

	return {
		videoTitle: data[0].title,
		videoThumbnail: data[0].thumbnail_large,
		videoUrl: data[0].url,
		user_name: data[0].user_name,
		upload_date: data[0].upload_date,
		duration: data[0].duration,
		width: data[0].width,
		height: data[0].height
	};
}

export async function twitch(id: string) {
	const response = await fetch(`https://api.twitch.tv/helix/videos?id=${id}`, {
		headers: {
			'Client-ID': 'vdsqv7peymxi12vb3pgut0lk4ca9oc',
			Authorization: `Bearer ${SECRET_TWITCH_TOKEN}`
		}
	});
	const data = await response.json();
	if (!(data?.data.length > 0)) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: ''
		};
	} else {
		return {
			videoTitle: data?.data[0]?.title,
			videoThumbnail: data?.data[0]?.thumbnail_url,
			videoUrl: `https://www.twitch.tv/videos/${id}`
		};
	}
}

export async function tiktok(url: string) {
	const response = await fetch(url);
	const data = await response.text();

	if (response.status === 404) {
		return {
			videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: ''
		};
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(data, 'text/html');

	const titleElement = doc.querySelector('title');
	const videoTitle = titleElement ? titleElement.textContent : '';

	const thumbnailElement = doc.querySelector('.tiktok-j6dmhd-ImgPoster');
	const videoThumbnail = thumbnailElement ? thumbnailElement.getAttribute('src') : '';

	return {
		videoTitle: videoTitle,
		videoThumbnail: videoThumbnail,
		videoUrl: url
	};
}

export async function getTokensProvided() {
	const tokensProvided = {
		google: false,
		twitch: false
	};
	if (SECRET_GOOGLE_API_KEY) {
		tokensProvided.google = true;
	}
	if (SECRET_TWITCH_TOKEN) {
		tokensProvided.twitch = true;
	}
	return {
		tokensProvided
	};
}
