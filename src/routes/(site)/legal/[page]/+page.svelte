<!--
@file src/routes/(site)/legal/[page]/+page.svelte
@component Trader notice, privacy summary, and terms for the store.
-->
<script lang="ts">
	import CommerceLegalBar from '@components/site/commerce-legal-bar.svelte';

	let { data } = $props();
	const de = $derived(data.legal.storeLanguage !== 'en');
</script>

<section class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
	{#if data.page === 'impressum'}
		<h1 class="text-2xl font-bold">{data.labels.impressum}</h1>
		{#if data.legal.legalName}
			<div class="mt-4 space-y-1 text-sm whitespace-pre-wrap">
				<p class="font-medium">{data.legal.legalName}</p>
				<p>{data.legal.legalAddress}</p>
				<p>{data.legal.legalEmail}</p>
				<p>{data.legal.phone}</p>
				{#if data.legal.representative}<p>{data.legal.representative}</p>{/if}
				{#if data.legal.registerCourt}<p>
						{data.legal.registerCourt}
						{data.legal.registerNumber}
					</p>{/if}
				{#if data.legal.vatId}<p>USt-IdNr. {data.legal.vatId}</p>{/if}
				{#if data.legal.taxNumber}<p>{data.legal.taxNumber}</p>{/if}
			</div>
		{:else}
			<p class="mt-4 text-sm">
				{de
					? 'Der Händlername, die Anschrift und die Kontaktdaten stehen in den Commerce-Einstellungen.'
					: 'The trader name, address, and contact details are set in the Commerce plugin.'}
			</p>
		{/if}
	{:else if data.page === 'privacy'}
		<h1 class="text-2xl font-bold">{data.labels.privacy}</h1>
		<div class="mt-4 space-y-3 text-sm">
			{#if de}
				<p>
					Für Bestellungen verarbeiten wir Name, Anschrift, E-Mail und die Bestelldaten, um den
					Vertrag zu erfüllen (Art. 6 Abs. 1 lit. b DSGVO). Rechnungen bewahren wir für die
					steuerliche Aufbewahrung auf.
				</p>
				<p>
					Verantwortlich ist {data.legal.legalName || 'der im Impressum genannte Händler'}, {data
						.legal.legalEmail}. Zahlungsdaten der Karte verarbeitet Stripe, nicht dieser Shop.
				</p>
			{:else}
				<p>
					Orders use your name, address, email, and order lines to perform the contract (GDPR Art. 6
					(1) (b)). Invoices are kept for the tax retention period.
				</p>
				<p>
					The controller is {data.legal.legalName || 'the trader named in the legal notice'}, {data
						.legal.legalEmail}. Card data is processed by Stripe.
				</p>
			{/if}
		</div>
	{:else}
		<h1 class="text-2xl font-bold">{data.labels.terms}</h1>
		<div class="mt-4 space-y-3 text-sm">
			{#if de}
				<p>
					Es gilt das Recht der Bundesrepublik Deutschland unter Vorbehalt zwingender
					Verbraucherschutzregeln Ihres Wohnsitzstaates. Preise sind Bruttopreise inklusive der
					gesetzlichen Mehrwertsteuer.
				</p>
				<p>
					Verbraucher können den Vertrag innerhalb von 14 Tagen nach Erhalt der Ware widerrufen.
					Digitale Inhalte, deren Ausführung Sie vor Ablauf der Frist verlangt haben, sind vom
					Widerruf ausgenommen, sobald wir mit der Ausführung begonnen haben.
				</p>
				<p>Die Widerrufsfunktion steht unter „{data.labels.withdraw}“ dauerhaft bereit.</p>
			{:else}
				<p>
					Prices are gross and include statutory VAT. Mandatory consumer rules of your country of
					residence still apply.
				</p>
				<p>
					Consumers may withdraw within 14 days of receiving the goods. Digital content that you
					asked us to start before the period ends is excluded once performance has begun.
				</p>
				<p>The withdrawal function is always available as “{data.labels.withdraw}”.</p>
			{/if}
		</div>
	{/if}
	<CommerceLegalBar labels={data.labels} />
</section>
