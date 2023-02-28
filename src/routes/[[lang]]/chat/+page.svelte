<script>
	import { Configuration, OpenAIApi } from 'openai';

	let config;

	function createConfig() {
		if (!import.meta.env.VITE_OPEN_AI_KEY) {
			throw new Error('API key is missing or invalid.');
		}

		config = new Configuration({
			apiKey: import.meta.env.VITE_OPEN_AI_KEY
		});

		return config;
	}

	const openapi = new OpenAIApi(config);

	// send a Completion request
	const genchat = async (msg) => {
		const res = await openapi.createCompletion({
			model: 'text-davinci-003', // Most capable GPT-3 model, Taining Data Up to Jun 2021
			prompt: msg, // input text value of the form input box in sveltekit app ui
			temperature: 0.7, // Higher values means the model will take more risks. Try 0.9 for more creative applications, and 0 (argmax sampling) for ones with a well-defined answer.
			max_tokens: 50, // The maximum number of tokens to generate in the completion. (Max 4.000)
			top_p: 1, // alternative to sampling with temperature, called nucleus sampling
			frequency_penalty: 0.5, // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
			presence_penalty: 0.0, // Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
			n: 1,
			stop: '###' // Use this to indicate the end of the response
		});

		// SEND RESPONSE
		let response = res.data.choices[0].text ?? '';
		if (response.includes('./n')) {
			response = response
				.split('./n')
				.map((snippet) => {
					if (snippet.startsWith('doe ')) {
						// CODE SNIPPET
						return `<pre><code>${snippet.slice(4)}</code></pre>`;
					} else {
						// PLAIN TEXT
						return addLinks(snippet);
					}
				})
				.join('\n');
		}
		return response;

		function addLinks(text) {
			// Match URLs in text
			const urlRegex = /(https?:\/\/[^\s]+)/g;
			return text.replace(urlRegex, (url) => {
				// Wrap URLs in anchor tags
				return `<a href="${url}" target="_blank">${url}</a>`;
			});
		}
	};
	let mymessage = '';
	let allchat = [];

	const btnsend = async () => {
		// YOU TYPE HERE
		allchat = [...allchat, { type: 'user', text: mymessage }];
		// CLEAN MESSAGE YOU
		mymessage = '';

		const printresponse = await genchat(allchat.map((m) => m.text).join('/n'));

		// PUSH TO OBJECT IF CHATBOT RESPONSE
		allchat = [...allchat, { type: 'bot', text: printresponse }];
	};
</script>

<!-- Todo: add propper formating support -->
<h2>OpenAI Chat</h2>

{#if !import.meta.env.VITE_OPEN_AI_KEY}
	<p>Error: API key is missing or invalid.</p>
{:else}
	<div class="mt-2">
		{#each allchat as res_msg}
			<div class="p-2 mb-1 flex items-center bg-surface-500 gap {res_msg.type}">
				<span
					class="rounded-l-full px-2 py-1 mr-3 mb-1 border-r-2 border-white
          {res_msg.type === 'user' ? 'bg-tertiary-500 text-white' : 'bg-success-500 text-white'}"
				>
					{res_msg.type === 'user' ? 'You' : 'chatBot'}
				</span>
				{#if res_msg.type === 'user'}
					{res_msg.text}
				{:else}
					<p>{@html res_msg.text}</p>
				{/if}
			</div>
		{/each}
	</div>

	<!-- CREATE INPUT TEXT MESSAGE -->
	<div style="display: flex;flex-direction: row;justify-content: center;">
		<input
			placeholder="Type Message You Here ....."
			class="input"
			type="text"
			bind:value={mymessage}
		/>

		<button class="ml-1 btn variant-filled-tertiary" on:click={btnsend}>Send</button>
	</div>
{/if}
