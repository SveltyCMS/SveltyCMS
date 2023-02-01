<!-- <script lang="ts">
	import env from '@root/env';
	import { onMount } from 'svelte';
	import axios from 'axios';

	export let field = undefined;
	export let value = '';
	export let widgetValue;
	$: widgetValue = value;

	let videoUrl = '';
	let videoId = '';
	let videoTitle = '';
	let videoThumbnail = '';

	onMount(async () => {
    // fetch video url, id, title, and thumbnail from server or some other source
    const data = await axios.get('/video-data').then((res) => res.data);
    videoUrl = data.url;
    videoId = data.id;
    videoTitle = data.title;
    videoThumbnail = data.thumbnail;
});

function handleUrlChange(e) {
    const url = e.target.value;
    if (!url.match(/(youtube\.com|vimeo\.com|twitch\.tv|tiktok\.com)/)) {
        // display an error message or throw an error
        return;
    }

    if (url.includes('youtube.com')) {
        videoId = extractYoutubeId(url);
        videoThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        if (!env.YOUTUBE_API_KEY) return;
        // Use the YouTube Data API to fetch the video title
        const apiKey = env.YOUTUBE_API_KEY;
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
        axios.get(apiUrl)
            .then(res => {
                videoTitle = res.data.items[0].snippet.title;
                videoUrl = url;
                videoId = videoId;
                videoTitle = videoTitle;
                videoThumbnail = videoThumbnail;
            })
            .catch(error => {
                console.log(error);
                // display an error message or throw an error
            });
    } else if (url.includes('vimeo.com')) {
        videoId = extractVimeoId(url);
        if (!env.VIMEO_API_KEY) return;
        // Use the Vimeo API to fetch the video title and thumbnail
        const apiKey = env.VIMEO_API
        const apiUrl = `https://api.vimeo.com/videos/${videoId}`;
        axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        })
        .then(res => {
            videoTitle = res.data.name;
            videoThumbnail = res.data.pictures.sizes[2].link;
            videoUrl = url;
            videoId = videoId;
            videoTitle = videoTitle;
            videoThumbnail = videoThumbnail;
        })
        .catch(error => {
            console.log(error);
            // display an error message or throw an error
        });
    } else if (url.includes('twitch.tv')) {
        videoId = extractTwitchId(url);
        if (!env.TWITCH_API_KEY) return;
        // Use the Twitch API to fetch the video title and thumbnail
        const apiKey = env.TWITCH_API_KEY;
        const apiUrl = `https://api.twitch.tv/helix/videos?id=${videoId}`;
        axios.get(apiUrl, {
            headers: {
                'Client-ID': apiKey
            }
        })
        .then(res => {
            videoTitle = res.data.data[0].title;
            videoThumbnail = res.data.data[0].thumbnail_url;
            videoUrl = url;
            videoId = videoId;
            videoTitle = videoTitle;
            videoThumbnail = videoThumbnail;
        })
        .catch(error => {
            console.log(error);
            // display an error message or throw an error
        });
    } else if (url.includes('tiktok.com')) {
        videoId = extractTikTokId(url);
        if (!env.TIKTOK_API_KEY) return;
        // Use the TikTok API to fetch the video title and thumbnail
        const apiKey = env.TIKTOK_API_KEY;
        const apiUrl = `https://api.tiktok.com/v1/video/info?video_id=${videoId}&app_key=${apiKey}`;
        axios.get(apiUrl)
            .then(res => {
                videoTitle = res.data.data.title;
                videoThumbnail = res.data.data.thumbnail;
                videoUrl = url;
                videoId = videoId;
                videoTitle = videoTitle;
                videoThumbnail = videoThumbnail;
            })
            .catch(error => {
                console.log(error);
                // display an error message or throw an error
            });
    }
}

function extractYoutubeId(url) {
    const queryParams = url.split('?')[1];
    const id = queryParams
        .split('&')
        .filter((param) => param.startsWith('v='))[0]
        .split('=')[1];
    return id;
}

function extractVimeoId(url) {
    return url.split('/')[3];
}

function extractTwitchId(url) {
    return
    return url.split('/')[3];
}

function extractTikTokId(url) {
    return url.split('/')[4];
}

	console.log(videoUrl);
	console.log(videoId);
	console.log(videoTitle);
	console.log(videoThumbnail);
</script>

<input type="text" bind:value={videoUrl} on:input={handleUrlChange} />
<div>
	{#if videoThumbnail}
		<img src={videoThumbnail} alt={videoTitle} />
		<p>{videoTitle}</p>
	{/if}
</div> -->
<script lang="ts">
	// TODO: needs more work see poosible ypoutube example
	// https://github.com/sharu725/youtube-embed
	// https://www.sanity.io/guides/portable-text-how-to-add-a-custom-youtube-embed-block

	import env from '@root/env';

	export let field: any = undefined;
	export let value = '';

	let url: string = '';
	let thumbnail: string = '';
	let title: string = '';
	let videoId: string = 'rsmLu5nmh4g';

	export let widgetValue;
	$: widgetValue = value;

	// Grab Youtube Video information
	function handlePaste() {
		console.log('value: ' + value);

		const urlValue = value;
		const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
		const match = urlValue.match(regExp);
		const videoId = match && match[2].length === 11 ? match[2] : null;

		console.log('videoId: ' + videoId);
		// if (videoId) {
		// 	fetch(
		// 		`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${env.GOOGLE_API_TOKEN}&part=snippet`
		// 	)
		// 		.then((response) => response.json())
		// 		.then((data) => {
		// 			const video = data.items[0];
		// 			thumbnail = video.snippet.thumbnails.medium.url;
		// 			title = video.snippet.title;
		// 			url = `https://www.youtube.com/watch?v=${videoId}`;
		// 		});
		// }
	}
	console.log('videoId: ' + videoId);
	console.log('thumbnail: ' + thumbnail);
	console.log('title: ' + title);
	console.log('url: ' + url);
</script>

<input
	bind:value
	id="youtube-url"
	type="text"
	placeholder="Paste a YouTube URL here"
	on:blur={handlePaste}
	class="input w-full rounded-md"
/>

<a href={url} class="flex justify-between items-center border-b mt-1 py-1">
	<div>
		<div class="text-base font-medium">Title: {title}</div>
		<div class="text-base font-medium">VideoId: {videoId}</div>
		Image from Api not working:
		<img src={thumbnail} class="mr-4 h-12 w-12 rounded-full" alt={title} />
	</div>
	{#if videoId != null}
		<div>
			Image from ytimg:
			<img
				src="https://i.ytimg.com/vi/{videoId}/{thumbnail ? 'hqdefault' : 'maxresdefault'}.jpg"
				{title}
				alt="Youtube video: {title}"
				referrerpolicy="no-referrer"
				class="h-[150px]"
			/>
		</div>{/if}
</a>
