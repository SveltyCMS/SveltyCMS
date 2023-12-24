<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	export let tokenLink = dev ? HOST_DEV : HOST_PROD;

	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expiresIn: string;
	}
	export let email: EmailProps['email'];

	//TODO: send rest to domain?Token and delete used token
	export let token: EmailProps['token'];
	export let resetLink: EmailProps['resetLink'];
	// export let resetLink = tokenLink + '/login?token=' + token + 'email=' + email;

	export let expiresIn: EmailProps['expiresIn'];

	console.log('EmailProps Token: ', token);
	console.log('EmailProps resetLink', resetLink);
	console.log('EmailProps expiresIn', expiresIn);

	//Readable ExpireIn time sec to year
	let currentTime = new Date();
	let expiresInNumber = parseInt(expiresIn, 10); // Assuming expiresIn is a string representation of a number
	let expirationTime = expiresInNumber ? new Date(currentTime.getTime() + expiresInNumber * 1000) : new Date(); // Convert expiresIn to milliseconds

	let timeDiff = expirationTime.getTime() - currentTime.getTime();
	let secondsDiff = Math.floor(timeDiff / 1000);
	let minutesDiff = Math.floor(secondsDiff / 60);
	let hoursDiff = Math.floor(minutesDiff / 60);
	let daysDiff = Math.floor(hoursDiff / 24);
	let weeksDiff = Math.floor(daysDiff / 7);
	let monthsDiff = Math.floor(weeksDiff / 4); // Assuming a month is 4 weeks
	let yearsDiff = Math.floor(monthsDiff / 12); // Assuming a year is 12 months

	let remainingSeconds = secondsDiff % 60;
	let remainingMinutes = minutesDiff % 60;
	let remainingHours = hoursDiff % 24;
	let remainingDays = daysDiff % 7;
	let remainingWeeks = weeksDiff % 4; // Assuming a month is 4 weeks

	let yearsText = yearsDiff > 0 ? `${yearsDiff} year${yearsDiff > 1 ? 's' : ''}` : '';
	let monthsText = monthsDiff > 0 ? `${monthsDiff} month${monthsDiff > 1 ? 's' : ''}` : '';
	let weeksText = remainingWeeks > 0 ? `${remainingWeeks} week${remainingWeeks > 1 ? 's' : ''}` : '';
	let daysText = remainingDays > 0 ? `${remainingDays} day${remainingDays > 1 ? 's' : ''}` : '';
	let hoursText = remainingHours > 0 ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}` : '';
	let minutesText = remainingMinutes > 0 ? `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : '';
	let secondsText = remainingSeconds > 0 ? `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : '';

	let readable_expiresIn = `${yearsText} ${monthsText} ${weeksText} ${daysText} ${hoursText} ${minutesText} ${secondsText}`.trim();

	console.log('readable_expires_at', readable_expiresIn);

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '16px 0 48px',
		width: '480px'
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px'
	};

	const paragraph_center = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px',
		textAlign: 'center'
	};

	const paragraphbold = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px',
		fontWeight: '600'
	};

	const review = {
		padding: '6px',
		backgroundColor: '#f2f3f3'
	};

	const btnContainer = {
		textAlign: 'center'
	};

	const button = {
		fontFamily,
		backgroundColor: '#8ddd15',
		borderRadius: '3px',
		color: '#000000',
		fontSize: '16px',
		textDecoration: 'none',
		textAlign: 'center',
		display: 'block'
	};

	const hr = {
		borderColor: '#cccccc',
		margin: '15px 0'
	};

	const footer = {
		fontFamily,
		color: '#8898aa',
		fontSize: '12px',
		textAlign: 'center'
	};

	const styleToString = (style: Record<string, string | number | null>) => {
		return Object.keys(style).reduce(
			(acc, key) =>
				acc +
				key
					.split(/(?=[A-Z])/)
					.join('-')
					.toLowerCase() +
				':' +
				style[key] +
				';',
			''
		);
	};
</script>

<Html lang={languageTag()}>
	<Head>
		<title> {m.forgottenpassword_title({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={m.forgottenpassword_meta({ PUBLIC_SITENAME })} />
	</Head>
	<Preview preview={m.forgottenpassword_preview({ PUBLIC_SITENAME })} />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/Rar9/SveltyCMS/raw/main/static/SveltyCMS_Logo_Round.png"
						alt="{PUBLIC_SITENAME} logo"
						width="150"
						height="auto"
						style={{ display: 'block', margin: '0 auto' }}
					/>
				</Link>
			</Section>
			<Text style={paragraph}>{m.forgottenpassword_hello({ email })}</Text>
			<Text style={paragraph}>{m.forgottenpassword_request({ PUBLIC_SITENAME })}</Text>
			<Section style={review}>
				<Text style={paragraph_center}>{m.forgottenpassword_token()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{token}</span></Text>
				<br />
				<Text style={paragraph_center}>{m.forgottenpassword_valid()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{readable_expiresIn}</span></Text>
			</Section>

			<Text style={paragraph_center}>{m.forgottenpassword_ignore()}</Text>
			<Text style={paragraph_center}>{m.forgottenpassword_button()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={resetLink}>{m.forgottenpassword_resetbutton()}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>{m.forgottenpassword_team({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
