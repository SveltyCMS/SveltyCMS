<script lang="ts">
	/**
	 * @file src/components/emails/databaseFailure.svelte
	 * @component
	 * Database failure notification email for administrators
	 * Sent when database connection fails and automatic recovery attempts are exhausted
	 */

	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { Body, Button, Column, Container, Head, Heading, Hr, Html, Img, Link, Preview, Row, Section, Text } from 'better-svelte-email';
	import { dev } from '$app/environment';

	interface Props {
		error?: {
			code: string;
			message: string;
			details?: unknown;
		};
		hostLink?: string;
		languageTag?: string;
		metrics?: {
			totalReconnections: number;
			successfulReconnections: number;
			failedRetries: number;
			averageRecoveryTime: number;
			lastFailureTime: string;
		};
		sitename?: string;
		systemState?: {
			overall: string;
			databaseStatus: string;
			databaseMessage: string;
		};
		timestamp?: string;
	}

	const {
		sitename = publicEnv?.SITE_NAME || 'SveltyCMS',
		error = {
			code: 'CONNECTION_FAILED',
			message: 'Database connection lost',
			details: {}
		},
		metrics = {
			totalReconnections: 0,
			successfulReconnections: 0,
			failedRetries: 0,
			averageRecoveryTime: 0,
			lastFailureTime: new Date().toISOString()
		},
		systemState = {
			overall: 'FAILED',
			databaseStatus: 'unhealthy',
			databaseMessage: 'Connection lost'
		},
		timestamp = new Date().toISOString(),
		hostLink = dev ? publicEnv?.HOST_DEV : publicEnv?.HOST_PROD || 'http://localhost:5173',
		languageTag = 'en'
	}: Props = $props();

	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>🚨 Critical Database Alert - {sitename}</title>
	</Head>

	<Preview preview="Critical database failure detected on {sitename}" />

	<Body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f6f9fc;">
		<Container
			style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;"
		>
			<!-- Header Section with Red Alert Background -->
			<Section style="background-color: #dc2626; padding: 32px 24px; text-align: center;">
				<Link href={hostLink}>
					<Img src={logoSrc} alt="{sitename} logo" width="120" height="auto" style="margin: 0 auto 16px; display: block;" />
				</Link>
				<Heading style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 8px;">🚨 Critical Database Alert</Heading>
				<Text style="color: #ffffff; font-size: 16px; margin: 0; opacity: 0.95;">{sitename}</Text>
			</Section>

			<!-- Alert Message Box -->
			<Section style="padding: 24px; background-color: #fef2f2; border-left: 4px solid #dc2626; margin: 24px;">
				<Text style="color: #dc2626; font-size: 18px; font-weight: bold; margin: 0 0 8px;">Database Connection Failure</Text>
				<Text style="color: #991b1b; font-size: 14px; margin: 0; line-height: 1.5;">
					The database connection has failed and automatic recovery attempts were unsuccessful. Immediate action is required.
				</Text>
			</Section>

			<!-- Error Details Section -->
			<Section style="padding: 0 24px 24px;">
				<Heading style="color: #1f2937; font-size: 20px; font-weight: 600; margin: 0 0 16px;">Error Details</Heading>

				<!-- Error Code -->
				<Row style="margin-bottom: 12px;">
					<Column style="width: 40%; padding: 8px 12px 8px 0; vertical-align: top;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Error Code:</Text>
					</Column>
					<Column style="width: 60%; padding: 8px 0; vertical-align: top;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{error.code}</Text>
					</Column>
				</Row>

				<!-- Error Message -->
				<Row style="margin-bottom: 12px;">
					<Column style="width: 40%; padding: 8px 12px 8px 0; vertical-align: top;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Message:</Text>
					</Column>
					<Column style="width: 60%; padding: 8px 0; vertical-align: top;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{error.message}</Text>
					</Column>
				</Row>

				<!-- Timestamp -->
				<Row>
					<Column style="width: 40%; padding: 8px 12px 8px 0; vertical-align: top;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Timestamp:</Text>
					</Column>
					<Column style="width: 60%; padding: 8px 0; vertical-align: top;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;"> {new Date(timestamp).toLocaleString()} </Text>
					</Column>
				</Row>
			</Section>

			<Hr style="margin: 24px; border-color: #e5e7eb;" />

			<!-- Recovery Attempts Section -->
			<Section style="padding: 0 24px 24px;">
				<Heading style="color: #1f2937; font-size: 20px; font-weight: 600; margin: 0 0 16px;">Recovery Attempts</Heading>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 60%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Total Reconnection Attempts:</Text>
					</Column>
					<Column style="width: 40%; padding: 8px 0;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{metrics.totalReconnections}</Text>
					</Column>
				</Row>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 60%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Successful Reconnections:</Text>
					</Column>
					<Column style="width: 40%; padding: 8px 0;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{metrics.successfulReconnections}</Text>
					</Column>
				</Row>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 60%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Failed Retries:</Text>
					</Column>
					<Column style="width: 40%; padding: 8px 0;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{metrics.failedRetries}</Text>
					</Column>
				</Row>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 60%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Average Recovery Time:</Text>
					</Column>
					<Column style="width: 40%; padding: 8px 0;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{metrics.averageRecoveryTime}ms</Text>
					</Column>
				</Row>

				<Row>
					<Column style="width: 60%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Last Failure:</Text>
					</Column>
					<Column style="width: 40%; padding: 8px 0;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;"> {new Date(metrics.lastFailureTime).toLocaleString()} </Text>
					</Column>
				</Row>
			</Section>

			<Hr style="margin: 24px; border-color: #e5e7eb;" />

			<!-- System Status Section -->
			<Section style="padding: 0 24px 24px;">
				<Heading style="color: #1f2937; font-size: 20px; font-weight: 600; margin: 0 0 16px;">System Status</Heading>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 50%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Overall State:</Text>
					</Column>
					<Column style="width: 50%; padding: 8px 0;">
						<Text
							style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background-color: #fef2f2; color: #dc2626;"
						>
							{systemState.overall}
						</Text>
					</Column>
				</Row>

				<Row style="margin-bottom: 12px;">
					<Column style="width: 50%; padding: 8px 12px 8px 0;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Database Status:</Text>
					</Column>
					<Column style="width: 50%; padding: 8px 0;">
						<Text
							style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background-color: #fef2f2; color: #dc2626;"
						>
							{systemState.databaseStatus}
						</Text>
					</Column>
				</Row>

				<Row>
					<Column style="width: 50%; padding: 8px 12px 8px 0; vertical-align: top;">
						<Text style="color: #6b7280; font-size: 14px; margin: 0;">Database Message:</Text>
					</Column>
					<Column style="width: 50%; padding: 8px 0; vertical-align: top;">
						<Text style="color: #1f2937; font-size: 14px; font-weight: 500; margin: 0;">{systemState.databaseMessage}</Text>
					</Column>
				</Row>
			</Section>

			<Hr style="margin: 24px; border-color: #e5e7eb;" />

			<!-- Action Required Section -->
			<Section style="padding: 24px; background-color: #fffbeb; border-left: 4px solid #f59e0b; margin: 24px;">
				<Heading style="color: #92400e; font-size: 18px; font-weight: 600; margin: 0 0 12px;">Action Required</Heading>
				<Text style="color: #92400e; font-size: 14px; margin: 0 0 12px;">Please take the following steps:</Text>

				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;">1. Check if MongoDB/PostgreSQL service is running</Text>
				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;"
					>2. Verify database credentials and connection settings</Text
				>
				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;"
					>3. Review server logs for detailed error information</Text
				>
				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;">4. Check database server disk space and resources</Text>
				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;">5. Verify network connectivity to database server</Text>
				<Text style="color: #92400e; font-size: 14px; margin: 8px 0 4px; font-weight: 500;"
					>6. Consider restoring from backup if database is corrupted</Text
				>
			</Section>

			<!-- Dashboard Button -->
			<Section style="text-align: center; padding: 24px;">
				<Button
					href="{hostLink}/dashboard"
					pX={32}
					pY={14}
					style="background-color: #dc2626; color: #ffffff; border-radius: 8px; font-weight: bold; font-size: 16px; text-decoration: none; display: inline-block;"
				>
					Go to Dashboard
				</Button>
			</Section>

			<Hr style="margin: 24px; border-color: #e5e7eb;" />

			<!-- Footer -->
			<Section style="padding: 24px; text-align: center;">
				<Text style="color: #6b7280; font-size: 12px; margin: 0 0 8px;">
					This is an automated alert from <strong>{sitename}</strong>. If you continue to receive these alerts, please investigate the database
					infrastructure immediately.
				</Text>
				<Text style="color: #6b7280; font-size: 12px; margin: 0;">Server: {hostLink}</Text>
			</Section>
		</Container>
	</Body>
</Html>
