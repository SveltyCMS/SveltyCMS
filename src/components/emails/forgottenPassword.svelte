<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	export let tokenLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@src/stores/store';

	// Svelty-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expiresIn: string;
	}
	export let email: EmailProps['email'];

	//TODO: send rest to domain? Token and delete used token
	export let token: EmailProps['token'];
	export let resetLink: EmailProps['resetLink'];
	export let expiresIn: EmailProps['expiresIn'];

	// Readable ExpireIn time sec to year
	const currentTime = new Date();
	const expiresInNumber = parseInt(expiresIn, 10); // Assuming expiresIn is a string representation of a number
	const expirationTime = expiresInNumber ? new Date(currentTime.getTime() + expiresInNumber * 1000) : new Date(); // Convert expiresIn to milliseconds

	const timeDiff = expirationTime.getTime() - currentTime.getTime();
	const secondsDiff = Math.floor(timeDiff / 1000);
	const minutesDiff = Math.floor(secondsDiff / 60);
	const hoursDiff = Math.floor(minutesDiff / 60);
	const daysDiff = Math.floor(hoursDiff / 24);
	const weeksDiff = Math.floor(daysDiff / 7);
	const monthsDiff = Math.floor(weeksDiff / 4); // Assuming a month is 4 weeks
	const yearsDiff = Math.floor(monthsDiff / 12); // Assuming a year is 12 months

	const remainingSeconds = secondsDiff % 60;
	const remainingMinutes = minutesDiff % 60;
	const remainingHours = hoursDiff % 24;
	const remainingDays = daysDiff % 7;
	const remainingWeeks = weeksDiff % 4; // Assuming a month is 4 weeks

	const yearsText = yearsDiff > 0 ? `${yearsDiff} year${yearsDiff > 1 ? 's' : ''}` : '';
	const monthsText = monthsDiff > 0 ? `${monthsDiff} month${monthsDiff > 1 ? 's' : ''}` : '';
	const weeksText = remainingWeeks > 0 ? `${remainingWeeks} week${remainingWeeks > 1 ? 's' : ''}` : '';
	const daysText = remainingDays > 0 ? `${remainingDays} day${remainingDays > 1 ? 's' : ''}` : '';
	const hoursText = remainingHours > 0 ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}` : '';
	const minutesText = remainingMinutes > 0 ? `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : '';
	const secondsText = remainingSeconds > 0 ? `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}` : '';

	const readable_expiresIn = `${yearsText} ${monthsText} ${weeksText} ${daysText} ${hoursText} ${minutesText} ${secondsText}`.trim();

	// console.log('readable_expires_at', readable_expiresIn);

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

<Html lang={$systemLanguage}>
	<Head>
		<title>Reset your password for {publicEnv.SITE_NAME}</title>
		<meta name="description" content="Reset your password for {publicEnv.SITE_NAME}" />
	</Head>
	<Preview preview="Reset your password for {publicEnv.SITE_NAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/Rar9/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						width="150"
						height="auto"
						style={{ display: 'block', margin: '0 auto' }}
					/>
				</Link>
			</Section>
			<Text style={paragraph}>Hello {email}</Text>
			<Text style={paragraph}>You have requested to reset your Password to get access to {publicEnv.SITE_NAME}</Text>
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
			<Text style={footer}>Your {publicEnv.SITE_NAME} Team</Text>
		</Container>
	</Section>
</Html>
