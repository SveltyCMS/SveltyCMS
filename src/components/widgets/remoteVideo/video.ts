// import { env } from '$env/dynamic/private';
import { GOOGLE_API_KEY, TWITCH_TOKEN } from '$env/static/private';

import cheerio from 'cheerio';

export async function youtube(id: string) {
	const response = await fetch(
		`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${GOOGLE_API_KEY}`
	);
	const data = await response.json();

	const responseDuration = await fetch(
		`https://www.googleapis.com/youtube/v3/videos?id=${id}&part=contentDetails&key=${GOOGLE_API_KEY}`
	);
	const dataDuration = await responseDuration.json();

	//convert the ISO 8601 duration format to a readable time format
	const time = dataDuration?.items[0]?.contentDetails?.duration;
	function convertDuration(duration: any) {
		const dayTime = duration.split('T');
		const dayDuration = dayTime[0].replace('P', '');
		let dayList = dayDuration.split('D');
		let day;
		if (dayList.length === 2) {
			day = parseInt(dayList[0], 10) * 60 * 60 * 24;
			dayList = dayList[1];
		} else {
			day = 0;
			dayList = dayList[0];
		}
		let hourList = dayTime[1].split('H');
		let hour;
		if (hourList.length === 2) {
			hour = parseInt(hourList[0], 10) * 60 * 60;
			hourList = hourList[1];
		} else {
			hour = 0;
			hourList = hourList[0];
		}
		let minuteList = hourList.split('M');
		let minute;
		if (minuteList.length === 2) {
			minute = parseInt(minuteList[0], 10) * 60;
			minuteList = minuteList[1];
		} else {
			minute = 0;
			minuteList = minuteList[0];
		}
		const secondList = minuteList.split('S');
		let second;
		if (secondList.length === 2) {
			second = parseInt(secondList[0], 10);
		} else {
			second = 0;
		}
		return new Date((day + hour + minute + second) * 1000).toISOString().substr(11, 8);
	}

	// console.log(convertDuration(time));

	// console.log(dataDuration?.items[0]?.contentDetails);
	// console.log(data?.items[0]?.contentDetails);

	//console.log(data.items[0]?.snippet);

	if (!(data?.items.length || dataDuration?.items.length > 0)) {
		return {
			// videoTitle: 'Invalid URL',
			videoThumbnail: '',
			videoUrl: '',
			channelTitle: '',
			publishedAt: '',
			width: '',
			height: '',
			duration: ''
		};
	} else {
		return {
			videoTitle: data?.items[0]?.snippet?.title,
			videoThumbnail: data?.items[0]?.snippet?.thumbnails?.standard?.url,
			videoUrl: `https://www.youtube.com/watch?v=${id}`,
			channelTitle: data?.items[0]?.snippet?.channelTitle,
			publishedAt: data?.items[0]?.snippet?.publishedAt,
			width: data?.items[0]?.snippet?.thumbnails?.maxres?.width,
			height: data?.items[0]?.snippet?.thumbnails?.maxres?.height,
			duration: convertDuration(time)
		};
	}
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
			Authorization: `Bearer ${TWITCH_TOKEN}`
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
	const $ = cheerio.load(data);

	const videoTitle = $('title').text();

	const videoThumbnail = $('.tiktok-j6dmhd-ImgPoster')?.attr('src');

	return {
		videoTitle: videoTitle,
		videoThumbnail: videoThumbnail,
		videoUrl: url
	};
}
