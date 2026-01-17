import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier/standalone';
import parserHtml from 'prettier/parser-html';
import { r as render } from '../../../chunks/index5.js';
import { parse, serialize } from 'parse5';
import postcss from 'postcss';
import { compile } from 'tailwindcss';
import valueParser from 'postcss-value-parser';
import 'html-to-text';
import { l as logger } from '../../../chunks/logger.server.js';
import { error } from '@sveltejs/kit';
function walk(ast, callback) {
	if (!('childNodes' in ast) || !ast.childNodes) {
		return ast;
	}
	for (let i = ast.childNodes.length - 1; i >= 0; i--) {
		const node = ast.childNodes[i];
		const newNode = callback(node);
		if (newNode === null) {
			ast.childNodes.splice(i, 1);
		} else {
			ast.childNodes[i] = newNode;
			if ('childNodes' in newNode && Array.isArray(newNode.childNodes) && newNode.childNodes.length > 0) {
				walk(newNode, callback);
			}
		}
	}
	return ast;
}
const css$3 = `
@layer theme, base, components, utilities;

@layer theme {
  @theme default {
    --font-sans:
      ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
      "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    --font-mono:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;

    --color-red-50: oklch(97.1% 0.013 17.38);
    --color-red-100: oklch(93.6% 0.032 17.717);
    --color-red-200: oklch(88.5% 0.062 18.334);
    --color-red-300: oklch(80.8% 0.114 19.571);
    --color-red-400: oklch(70.4% 0.191 22.216);
    --color-red-500: oklch(63.7% 0.237 25.331);
    --color-red-600: oklch(57.7% 0.245 27.325);
    --color-red-700: oklch(50.5% 0.213 27.518);
    --color-red-800: oklch(44.4% 0.177 26.899);
    --color-red-900: oklch(39.6% 0.141 25.723);
    --color-red-950: oklch(25.8% 0.092 26.042);

    --color-orange-50: oklch(98% 0.016 73.684);
    --color-orange-100: oklch(95.4% 0.038 75.164);
    --color-orange-200: oklch(90.1% 0.076 70.697);
    --color-orange-300: oklch(83.7% 0.128 66.29);
    --color-orange-400: oklch(75% 0.183 55.934);
    --color-orange-500: oklch(70.5% 0.213 47.604);
    --color-orange-600: oklch(64.6% 0.222 41.116);
    --color-orange-700: oklch(55.3% 0.195 38.402);
    --color-orange-800: oklch(47% 0.157 37.304);
    --color-orange-900: oklch(40.8% 0.123 38.172);
    --color-orange-950: oklch(26.6% 0.079 36.259);

    --color-amber-50: oklch(98.7% 0.022 95.277);
    --color-amber-100: oklch(96.2% 0.059 95.617);
    --color-amber-200: oklch(92.4% 0.12 95.746);
    --color-amber-300: oklch(87.9% 0.169 91.605);
    --color-amber-400: oklch(82.8% 0.189 84.429);
    --color-amber-500: oklch(76.9% 0.188 70.08);
    --color-amber-600: oklch(66.6% 0.179 58.318);
    --color-amber-700: oklch(55.5% 0.163 48.998);
    --color-amber-800: oklch(47.3% 0.137 46.201);
    --color-amber-900: oklch(41.4% 0.112 45.904);
    --color-amber-950: oklch(27.9% 0.077 45.635);

    --color-yellow-50: oklch(98.7% 0.026 102.212);
    --color-yellow-100: oklch(97.3% 0.071 103.193);
    --color-yellow-200: oklch(94.5% 0.129 101.54);
    --color-yellow-300: oklch(90.5% 0.182 98.111);
    --color-yellow-400: oklch(85.2% 0.199 91.936);
    --color-yellow-500: oklch(79.5% 0.184 86.047);
    --color-yellow-600: oklch(68.1% 0.162 75.834);
    --color-yellow-700: oklch(55.4% 0.135 66.442);
    --color-yellow-800: oklch(47.6% 0.114 61.907);
    --color-yellow-900: oklch(42.1% 0.095 57.708);
    --color-yellow-950: oklch(28.6% 0.066 53.813);

    --color-lime-50: oklch(98.6% 0.031 120.757);
    --color-lime-100: oklch(96.7% 0.067 122.328);
    --color-lime-200: oklch(93.8% 0.127 124.321);
    --color-lime-300: oklch(89.7% 0.196 126.665);
    --color-lime-400: oklch(84.1% 0.238 128.85);
    --color-lime-500: oklch(76.8% 0.233 130.85);
    --color-lime-600: oklch(64.8% 0.2 131.684);
    --color-lime-700: oklch(53.2% 0.157 131.589);
    --color-lime-800: oklch(45.3% 0.124 130.933);
    --color-lime-900: oklch(40.5% 0.101 131.063);
    --color-lime-950: oklch(27.4% 0.072 132.109);

    --color-green-50: oklch(98.2% 0.018 155.826);
    --color-green-100: oklch(96.2% 0.044 156.743);
    --color-green-200: oklch(92.5% 0.084 155.995);
    --color-green-300: oklch(87.1% 0.15 154.449);
    --color-green-400: oklch(79.2% 0.209 151.711);
    --color-green-500: oklch(72.3% 0.219 149.579);
    --color-green-600: oklch(62.7% 0.194 149.214);
    --color-green-700: oklch(52.7% 0.154 150.069);
    --color-green-800: oklch(44.8% 0.119 151.328);
    --color-green-900: oklch(39.3% 0.095 152.535);
    --color-green-950: oklch(26.6% 0.065 152.934);

    --color-emerald-50: oklch(97.9% 0.021 166.113);
    --color-emerald-100: oklch(95% 0.052 163.051);
    --color-emerald-200: oklch(90.5% 0.093 164.15);
    --color-emerald-300: oklch(84.5% 0.143 164.978);
    --color-emerald-400: oklch(76.5% 0.177 163.223);
    --color-emerald-500: oklch(69.6% 0.17 162.48);
    --color-emerald-600: oklch(59.6% 0.145 163.225);
    --color-emerald-700: oklch(50.8% 0.118 165.612);
    --color-emerald-800: oklch(43.2% 0.095 166.913);
    --color-emerald-900: oklch(37.8% 0.077 168.94);
    --color-emerald-950: oklch(26.2% 0.051 172.552);

    --color-teal-50: oklch(98.4% 0.014 180.72);
    --color-teal-100: oklch(95.3% 0.051 180.801);
    --color-teal-200: oklch(91% 0.096 180.426);
    --color-teal-300: oklch(85.5% 0.138 181.071);
    --color-teal-400: oklch(77.7% 0.152 181.912);
    --color-teal-500: oklch(70.4% 0.14 182.503);
    --color-teal-600: oklch(60% 0.118 184.704);
    --color-teal-700: oklch(51.1% 0.096 186.391);
    --color-teal-800: oklch(43.7% 0.078 188.216);
    --color-teal-900: oklch(38.6% 0.063 188.416);
    --color-teal-950: oklch(27.7% 0.046 192.524);

    --color-cyan-50: oklch(98.4% 0.019 200.873);
    --color-cyan-100: oklch(95.6% 0.045 203.388);
    --color-cyan-200: oklch(91.7% 0.08 205.041);
    --color-cyan-300: oklch(86.5% 0.127 207.078);
    --color-cyan-400: oklch(78.9% 0.154 211.53);
    --color-cyan-500: oklch(71.5% 0.143 215.221);
    --color-cyan-600: oklch(60.9% 0.126 221.723);
    --color-cyan-700: oklch(52% 0.105 223.128);
    --color-cyan-800: oklch(45% 0.085 224.283);
    --color-cyan-900: oklch(39.8% 0.07 227.392);
    --color-cyan-950: oklch(30.2% 0.056 229.695);

    --color-sky-50: oklch(97.7% 0.013 236.62);
    --color-sky-100: oklch(95.1% 0.026 236.824);
    --color-sky-200: oklch(90.1% 0.058 230.902);
    --color-sky-300: oklch(82.8% 0.111 230.318);
    --color-sky-400: oklch(74.6% 0.16 232.661);
    --color-sky-500: oklch(68.5% 0.169 237.323);
    --color-sky-600: oklch(58.8% 0.158 241.966);
    --color-sky-700: oklch(50% 0.134 242.749);
    --color-sky-800: oklch(44.3% 0.11 240.79);
    --color-sky-900: oklch(39.1% 0.09 240.876);
    --color-sky-950: oklch(29.3% 0.066 243.157);

    --color-blue-50: oklch(97% 0.014 254.604);
    --color-blue-100: oklch(93.2% 0.032 255.585);
    --color-blue-200: oklch(88.2% 0.059 254.128);
    --color-blue-300: oklch(80.9% 0.105 251.813);
    --color-blue-400: oklch(70.7% 0.165 254.624);
    --color-blue-500: oklch(62.3% 0.214 259.815);
    --color-blue-600: oklch(54.6% 0.245 262.881);
    --color-blue-700: oklch(48.8% 0.243 264.376);
    --color-blue-800: oklch(42.4% 0.199 265.638);
    --color-blue-900: oklch(37.9% 0.146 265.522);
    --color-blue-950: oklch(28.2% 0.091 267.935);

    --color-indigo-50: oklch(96.2% 0.018 272.314);
    --color-indigo-100: oklch(93% 0.034 272.788);
    --color-indigo-200: oklch(87% 0.065 274.039);
    --color-indigo-300: oklch(78.5% 0.115 274.713);
    --color-indigo-400: oklch(67.3% 0.182 276.935);
    --color-indigo-500: oklch(58.5% 0.233 277.117);
    --color-indigo-600: oklch(51.1% 0.262 276.966);
    --color-indigo-700: oklch(45.7% 0.24 277.023);
    --color-indigo-800: oklch(39.8% 0.195 277.366);
    --color-indigo-900: oklch(35.9% 0.144 278.697);
    --color-indigo-950: oklch(25.7% 0.09 281.288);

    --color-violet-50: oklch(96.9% 0.016 293.756);
    --color-violet-100: oklch(94.3% 0.029 294.588);
    --color-violet-200: oklch(89.4% 0.057 293.283);
    --color-violet-300: oklch(81.1% 0.111 293.571);
    --color-violet-400: oklch(70.2% 0.183 293.541);
    --color-violet-500: oklch(60.6% 0.25 292.717);
    --color-violet-600: oklch(54.1% 0.281 293.009);
    --color-violet-700: oklch(49.1% 0.27 292.581);
    --color-violet-800: oklch(43.2% 0.232 292.759);
    --color-violet-900: oklch(38% 0.189 293.745);
    --color-violet-950: oklch(28.3% 0.141 291.089);

    --color-purple-50: oklch(97.7% 0.014 308.299);
    --color-purple-100: oklch(94.6% 0.033 307.174);
    --color-purple-200: oklch(90.2% 0.063 306.703);
    --color-purple-300: oklch(82.7% 0.119 306.383);
    --color-purple-400: oklch(71.4% 0.203 305.504);
    --color-purple-500: oklch(62.7% 0.265 303.9);
    --color-purple-600: oklch(55.8% 0.288 302.321);
    --color-purple-700: oklch(49.6% 0.265 301.924);
    --color-purple-800: oklch(43.8% 0.218 303.724);
    --color-purple-900: oklch(38.1% 0.176 304.987);
    --color-purple-950: oklch(29.1% 0.149 302.717);

    --color-fuchsia-50: oklch(97.7% 0.017 320.058);
    --color-fuchsia-100: oklch(95.2% 0.037 318.852);
    --color-fuchsia-200: oklch(90.3% 0.076 319.62);
    --color-fuchsia-300: oklch(83.3% 0.145 321.434);
    --color-fuchsia-400: oklch(74% 0.238 322.16);
    --color-fuchsia-500: oklch(66.7% 0.295 322.15);
    --color-fuchsia-600: oklch(59.1% 0.293 322.896);
    --color-fuchsia-700: oklch(51.8% 0.253 323.949);
    --color-fuchsia-800: oklch(45.2% 0.211 324.591);
    --color-fuchsia-900: oklch(40.1% 0.17 325.612);
    --color-fuchsia-950: oklch(29.3% 0.136 325.661);

    --color-pink-50: oklch(97.1% 0.014 343.198);
    --color-pink-100: oklch(94.8% 0.028 342.258);
    --color-pink-200: oklch(89.9% 0.061 343.231);
    --color-pink-300: oklch(82.3% 0.12 346.018);
    --color-pink-400: oklch(71.8% 0.202 349.761);
    --color-pink-500: oklch(65.6% 0.241 354.308);
    --color-pink-600: oklch(59.2% 0.249 0.584);
    --color-pink-700: oklch(52.5% 0.223 3.958);
    --color-pink-800: oklch(45.9% 0.187 3.815);
    --color-pink-900: oklch(40.8% 0.153 2.432);
    --color-pink-950: oklch(28.4% 0.109 3.907);

    --color-rose-50: oklch(96.9% 0.015 12.422);
    --color-rose-100: oklch(94.1% 0.03 12.58);
    --color-rose-200: oklch(89.2% 0.058 10.001);
    --color-rose-300: oklch(81% 0.117 11.638);
    --color-rose-400: oklch(71.2% 0.194 13.428);
    --color-rose-500: oklch(64.5% 0.246 16.439);
    --color-rose-600: oklch(58.6% 0.253 17.585);
    --color-rose-700: oklch(51.4% 0.222 16.935);
    --color-rose-800: oklch(45.5% 0.188 13.697);
    --color-rose-900: oklch(41% 0.159 10.272);
    --color-rose-950: oklch(27.1% 0.105 12.094);

    --color-slate-50: oklch(98.4% 0.003 247.858);
    --color-slate-100: oklch(96.8% 0.007 247.896);
    --color-slate-200: oklch(92.9% 0.013 255.508);
    --color-slate-300: oklch(86.9% 0.022 252.894);
    --color-slate-400: oklch(70.4% 0.04 256.788);
    --color-slate-500: oklch(55.4% 0.046 257.417);
    --color-slate-600: oklch(44.6% 0.043 257.281);
    --color-slate-700: oklch(37.2% 0.044 257.287);
    --color-slate-800: oklch(27.9% 0.041 260.031);
    --color-slate-900: oklch(20.8% 0.042 265.755);
    --color-slate-950: oklch(12.9% 0.042 264.695);

    --color-gray-50: oklch(98.5% 0.002 247.839);
    --color-gray-100: oklch(96.7% 0.003 264.542);
    --color-gray-200: oklch(92.8% 0.006 264.531);
    --color-gray-300: oklch(87.2% 0.01 258.338);
    --color-gray-400: oklch(70.7% 0.022 261.325);
    --color-gray-500: oklch(55.1% 0.027 264.364);
    --color-gray-600: oklch(44.6% 0.03 256.802);
    --color-gray-700: oklch(37.3% 0.034 259.733);
    --color-gray-800: oklch(27.8% 0.033 256.848);
    --color-gray-900: oklch(21% 0.034 264.665);
    --color-gray-950: oklch(13% 0.028 261.692);

    --color-zinc-50: oklch(98.5% 0 0);
    --color-zinc-100: oklch(96.7% 0.001 286.375);
    --color-zinc-200: oklch(92% 0.004 286.32);
    --color-zinc-300: oklch(87.1% 0.006 286.286);
    --color-zinc-400: oklch(70.5% 0.015 286.067);
    --color-zinc-500: oklch(55.2% 0.016 285.938);
    --color-zinc-600: oklch(44.2% 0.017 285.786);
    --color-zinc-700: oklch(37% 0.013 285.805);
    --color-zinc-800: oklch(27.4% 0.006 286.033);
    --color-zinc-900: oklch(21% 0.006 285.885);
    --color-zinc-950: oklch(14.1% 0.005 285.823);

    --color-neutral-50: oklch(98.5% 0 0);
    --color-neutral-100: oklch(97% 0 0);
    --color-neutral-200: oklch(92.2% 0 0);
    --color-neutral-300: oklch(87% 0 0);
    --color-neutral-400: oklch(70.8% 0 0);
    --color-neutral-500: oklch(55.6% 0 0);
    --color-neutral-600: oklch(43.9% 0 0);
    --color-neutral-700: oklch(37.1% 0 0);
    --color-neutral-800: oklch(26.9% 0 0);
    --color-neutral-900: oklch(20.5% 0 0);
    --color-neutral-950: oklch(14.5% 0 0);

    --color-stone-50: oklch(98.5% 0.001 106.423);
    --color-stone-100: oklch(97% 0.001 106.424);
    --color-stone-200: oklch(92.3% 0.003 48.717);
    --color-stone-300: oklch(86.9% 0.005 56.366);
    --color-stone-400: oklch(70.9% 0.01 56.259);
    --color-stone-500: oklch(55.3% 0.013 58.071);
    --color-stone-600: oklch(44.4% 0.011 73.639);
    --color-stone-700: oklch(37.4% 0.01 67.558);
    --color-stone-800: oklch(26.8% 0.007 34.298);
    --color-stone-900: oklch(21.6% 0.006 56.043);
    --color-stone-950: oklch(14.7% 0.004 49.25);

    --color-black: #000;
    --color-white: #fff;

    --spacing: 0.25rem;

    --breakpoint-sm: 40rem;
    --breakpoint-md: 48rem;
    --breakpoint-lg: 64rem;
    --breakpoint-xl: 80rem;
    --breakpoint-2xl: 96rem;

    --container-3xs: 16rem;
    --container-2xs: 18rem;
    --container-xs: 20rem;
    --container-sm: 24rem;
    --container-md: 28rem;
    --container-lg: 32rem;
    --container-xl: 36rem;
    --container-2xl: 42rem;
    --container-3xl: 48rem;
    --container-4xl: 56rem;
    --container-5xl: 64rem;
    --container-6xl: 72rem;
    --container-7xl: 80rem;

    --text-xs: 0.75rem;
    --text-xs--line-height: calc(1 / 0.75);
    --text-sm: 0.875rem;
    --text-sm--line-height: calc(1.25 / 0.875);
    --text-base: 1rem;
    --text-base--line-height: calc(1.5 / 1);
    --text-lg: 1.125rem;
    --text-lg--line-height: calc(1.75 / 1.125);
    --text-xl: 1.25rem;
    --text-xl--line-height: calc(1.75 / 1.25);
    --text-2xl: 1.5rem;
    --text-2xl--line-height: calc(2 / 1.5);
    --text-3xl: 1.875rem;
    --text-3xl--line-height: calc(2.25 / 1.875);
    --text-4xl: 2.25rem;
    --text-4xl--line-height: calc(2.5 / 2.25);
    --text-5xl: 3rem;
    --text-5xl--line-height: 1;
    --text-6xl: 3.75rem;
    --text-6xl--line-height: 1;
    --text-7xl: 4.5rem;
    --text-7xl--line-height: 1;
    --text-8xl: 6rem;
    --text-8xl--line-height: 1;
    --text-9xl: 8rem;
    --text-9xl--line-height: 1;

    --font-weight-thin: 100;
    --font-weight-extralight: 200;
    --font-weight-light: 300;
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    --font-weight-extrabold: 800;
    --font-weight-black: 900;

    --tracking-tighter: -0.05em;
    --tracking-tight: -0.025em;
    --tracking-normal: 0em;
    --tracking-wide: 0.025em;
    --tracking-wider: 0.05em;
    --tracking-widest: 0.1em;

    --leading-tight: 1.25;
    --leading-snug: 1.375;
    --leading-normal: 1.5;
    --leading-relaxed: 1.625;
    --leading-loose: 2;

    --radius-xs: 0.125rem;
    --radius-sm: 0.25rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.75rem;
    --radius-2xl: 1rem;
    --radius-3xl: 1.5rem;
    --radius-4xl: 2rem;

    --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
    --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md:
      0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg:
      0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl:
      0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);

    --inset-shadow-2xs: inset 0 1px rgb(0 0 0 / 0.05);
    --inset-shadow-xs: inset 0 1px 1px rgb(0 0 0 / 0.05);
    --inset-shadow-sm: inset 0 2px 4px rgb(0 0 0 / 0.05);

    --drop-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.05);
    --drop-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.15);
    --drop-shadow-md: 0 3px 3px rgb(0 0 0 / 0.12);
    --drop-shadow-lg: 0 4px 4px rgb(0 0 0 / 0.15);
    --drop-shadow-xl: 0 9px 7px rgb(0 0 0 / 0.1);
    --drop-shadow-2xl: 0 25px 25px rgb(0 0 0 / 0.15);

    --text-shadow-2xs: 0px 1px 0px rgb(0 0 0 / 0.15);
    --text-shadow-xs: 0px 1px 1px rgb(0 0 0 / 0.2);
    --text-shadow-sm:
      0px 1px 0px rgb(0 0 0 / 0.075), 0px 1px 1px rgb(0 0 0 / 0.075),
      0px 2px 2px rgb(0 0 0 / 0.075);
    --text-shadow-md:
      0px 1px 1px rgb(0 0 0 / 0.1), 0px 1px 2px rgb(0 0 0 / 0.1),
      0px 2px 4px rgb(0 0 0 / 0.1);
    --text-shadow-lg:
      0px 1px 2px rgb(0 0 0 / 0.1), 0px 3px 2px rgb(0 0 0 / 0.1),
      0px 4px 8px rgb(0 0 0 / 0.1);

    --ease-in: cubic-bezier(0.4, 0, 1, 1);
    --ease-out: cubic-bezier(0, 0, 0.2, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

    --animate-spin: spin 1s linear infinite;
    --animate-ping: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
    --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    --animate-bounce: bounce 1s infinite;

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes ping {
      75%,
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }

    @keyframes pulse {
      50% {
        opacity: 0.5;
      }
    }

    @keyframes bounce {
      0%,
      100% {
        transform: translateY(-25%);
        animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
      }

      50% {
        transform: none;
        animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
      }
    }

    --blur-xs: 4px;
    --blur-sm: 8px;
    --blur-md: 12px;
    --blur-lg: 16px;
    --blur-xl: 24px;
    --blur-2xl: 40px;
    --blur-3xl: 64px;

    --perspective-dramatic: 100px;
    --perspective-near: 300px;
    --perspective-normal: 500px;
    --perspective-midrange: 800px;
    --perspective-distant: 1200px;

    --aspect-video: 16 / 9;

    --default-transition-duration: 150ms;
    --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    --default-font-family: --theme(--font-sans, initial);
    --default-font-feature-settings: --theme(
      --font-sans--font-feature-settings,
      initial
    );
    --default-font-variation-settings: --theme(
      --font-sans--font-variation-settings,
      initial
    );
    --default-mono-font-family: --theme(--font-mono, initial);
    --default-mono-font-feature-settings: --theme(
      --font-mono--font-feature-settings,
      initial
    );
    --default-mono-font-variation-settings: --theme(
      --font-mono--font-variation-settings,
      initial
    );
  }

  /* Deprecated */
  @theme default inline reference {
    --blur: 8px;
    --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
    --drop-shadow: 0 1px 2px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.06);
    --radius: 0.25rem;
    --max-width-prose: 65ch;
  }
}

@layer base {
  /*
  1. Prevent padding and border from affecting element width. (https://github.com/mozdevs/cssremedy/issues/4)
  2. Remove default margins and padding
  3. Reset all borders.
*/

  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    box-sizing: border-box; /* 1 */
    margin: 0; /* 2 */
    padding: 0; /* 2 */
    border: 0 solid; /* 3 */
  }

  /*
  1. Use a consistent sensible line-height in all browsers.
  2. Prevent adjustments of font size after orientation changes in iOS.
  3. Use a more readable tab size.
  4. Use the user's configured \`sans\` font-family by default.
  5. Use the user's configured \`sans\` font-feature-settings by default.
  6. Use the user's configured \`sans\` font-variation-settings by default.
  7. Disable tap highlights on iOS.
*/

  html,
  :host {
    line-height: 1.5; /* 1 */
    -webkit-text-size-adjust: 100%; /* 2 */
    tab-size: 4; /* 3 */
    font-family: --theme(
      --default-font-family,
      ui-sans-serif,
      system-ui,
      sans-serif,
      "Apple Color Emoji",
      "Segoe UI Emoji",
      "Segoe UI Symbol",
      "Noto Color Emoji"
    ); /* 4 */
    font-feature-settings: --theme(
      --default-font-feature-settings,
      normal
    ); /* 5 */
    font-variation-settings: --theme(
      --default-font-variation-settings,
      normal
    ); /* 6 */
    -webkit-tap-highlight-color: transparent; /* 7 */
  }

  /*
  1. Add the correct height in Firefox.
  2. Correct the inheritance of border color in Firefox. (https://bugzilla.mozilla.org/show_bug.cgi?id=190655)
  3. Reset the default border style to a 1px solid border.
*/

  hr {
    height: 0; /* 1 */
    color: inherit; /* 2 */
    border-top-width: 1px; /* 3 */
  }

  /*
  Add the correct text decoration in Chrome, Edge, and Safari.
*/

  abbr:where([title]) {
    -webkit-text-decoration: underline dotted;
    text-decoration: underline dotted;
  }

  /*
  Remove the default font size and weight for headings.
*/

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-size: inherit;
    font-weight: inherit;
  }

  /*
  Reset links to optimize for opt-in styling instead of opt-out.
*/

  a {
    color: inherit;
    -webkit-text-decoration: inherit;
    text-decoration: inherit;
  }

  /*
  Add the correct font weight in Edge and Safari.
*/

  b,
  strong {
    font-weight: bolder;
  }

  /*
  1. Use the user's configured \`mono\` font-family by default.
  2. Use the user's configured \`mono\` font-feature-settings by default.
  3. Use the user's configured \`mono\` font-variation-settings by default.
  4. Correct the odd \`em\` font sizing in all browsers.
*/

  code,
  kbd,
  samp,
  pre {
    font-family: --theme(
      --default-mono-font-family,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      "Liberation Mono",
      "Courier New",
      monospace
    ); /* 1 */
    font-feature-settings: --theme(
      --default-mono-font-feature-settings,
      normal
    ); /* 2 */
    font-variation-settings: --theme(
      --default-mono-font-variation-settings,
      normal
    ); /* 3 */
    font-size: 1em; /* 4 */
  }

  /*
  Add the correct font size in all browsers.
*/

  small {
    font-size: 80%;
  }

  /*
  Prevent \`sub\` and \`sup\` elements from affecting the line height in all browsers.
*/

  sub,
  sup {
    font-size: 75%;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
  }

  sub {
    bottom: -0.25em;
  }

  sup {
    top: -0.5em;
  }

  /*
  1. Remove text indentation from table contents in Chrome and Safari. (https://bugs.chromium.org/p/chromium/issues/detail?id=999088, https://bugs.webkit.org/show_bug.cgi?id=201297)
  2. Correct table border color inheritance in all Chrome and Safari. (https://bugs.chromium.org/p/chromium/issues/detail?id=935729, https://bugs.webkit.org/show_bug.cgi?id=195016)
  3. Remove gaps between table borders by default.
*/

  table {
    text-indent: 0; /* 1 */
    border-color: inherit; /* 2 */
    border-collapse: collapse; /* 3 */
  }

  /*
  Use the modern Firefox focus style for all focusable elements.
*/

  :-moz-focusring {
    outline: auto;
  }

  /*
  Add the correct vertical alignment in Chrome and Firefox.
*/

  progress {
    vertical-align: baseline;
  }

  /*
  Add the correct display in Chrome and Safari.
*/

  summary {
    display: list-item;
  }

  /*
  Make lists unstyled by default.
*/

  ol,
  ul,
  menu {
    list-style: none;
  }

  /*
  1. Make replaced elements \`display: block\` by default. (https://github.com/mozdevs/cssremedy/issues/14)
  2. Add \`vertical - align: middle\` to align replaced elements more sensibly by default. (https://github.com/jensimmons/cssremedy/issues/14#issuecomment-634934210)
      This can trigger a poorly considered lint error in some tools but is included by design.
*/

  img,
  svg,
  video,
  canvas,
  audio,
  iframe,
  embed,
  object {
    display: block; /* 1 */
    vertical-align: middle; /* 2 */
  }

  /*
  Constrain images and videos to the parent width and preserve their intrinsic aspect ratio. (https://github.com/mozdevs/cssremedy/issues/14)
*/

  img,
  video {
    max-width: 100%;
    height: auto;
  }

  /*
  1. Inherit font styles in all browsers.
  2. Remove border radius in all browsers.
  3. Remove background color in all browsers.
  4. Ensure consistent opacity for disabled states in all browsers.
*/

  button,
  input,
  select,
  optgroup,
  textarea,
  ::file-selector-button {
    font: inherit; /* 1 */
    font-feature-settings: inherit; /* 1 */
    font-variation-settings: inherit; /* 1 */
    letter-spacing: inherit; /* 1 */
    color: inherit; /* 1 */
    border-radius: 0; /* 2 */
    background-color: transparent; /* 3 */
    opacity: 1; /* 4 */
  }

  /*
  Restore default font weight.
*/

  :where(select:is([multiple], [size])) optgroup {
    font-weight: bolder;
  }

  /*
  Restore indentation.
*/

  :where(select:is([multiple], [size])) optgroup option {
    padding-inline-start: 20px;
  }

  /*
  Restore space after button.
*/

  ::file-selector-button {
    margin-inline-end: 4px;
  }

  /*
  Reset the default placeholder opacity in Firefox. (https://github.com/tailwindlabs/tailwindcss/issues/3300)
*/

  ::placeholder {
    opacity: 1;
  }

  /*
  Set the default placeholder color to a semi-transparent version of the current text color in browsers that do not
  crash when using \`color - mix(…)\` with \`currentcolor\`. (https://github.com/tailwindlabs/tailwindcss/issues/17194)
*/

  @supports (not (-webkit-appearance: -apple-pay-button)) /* Not Safari */ or
    (contain-intrinsic-size: 1px) /* Safari 17+ */ {
    ::placeholder {
      color: color-mix(in oklab, currentcolor 50%, transparent);
    }
  }

  /*
  Prevent resizing textareas horizontally by default.
*/

  textarea {
    resize: vertical;
  }

  /*
  Remove the inner padding in Chrome and Safari on macOS.
*/

  ::-webkit-search-decoration {
    -webkit-appearance: none;
  }

  /*
  1. Ensure date/time inputs have the same height when empty in iOS Safari.
  2. Ensure text alignment can be changed on date/time inputs in iOS Safari.
*/

  ::-webkit-date-and-time-value {
    min-height: 1lh; /* 1 */
    text-align: inherit; /* 2 */
  }

  /*
  Prevent height from changing on date/time inputs in macOS Safari when the input is set to \`display: block\`.
*/

  ::-webkit-datetime-edit {
    display: inline-flex;
  }

  /*
  Remove excess padding from pseudo-elements in date/time inputs to ensure consistent height across browsers.
*/

  ::-webkit-datetime-edit-fields-wrapper {
    padding: 0;
  }

  ::-webkit-datetime-edit,
  ::-webkit-datetime-edit-year-field,
  ::-webkit-datetime-edit-month-field,
  ::-webkit-datetime-edit-day-field,
  ::-webkit-datetime-edit-hour-field,
  ::-webkit-datetime-edit-minute-field,
  ::-webkit-datetime-edit-second-field,
  ::-webkit-datetime-edit-millisecond-field,
  ::-webkit-datetime-edit-meridiem-field {
    padding-block: 0;
  }

  /*
  Center dropdown marker shown on inputs with paired \`<datalist>\`s in Chrome. (https://github.com/tailwindlabs/tailwindcss/issues/18499)
*/

  ::-webkit-calendar-picker-indicator {
    line-height: 1;
  }

  /*
  Remove the additional \`: invalid\` styles in Firefox. (https://github.com/mozilla/gecko-dev/blob/2f9eacd9d3d995c937b4251a5557d95d494c9be1/layout/style/res/forms.css#L728-L737)
*/

  :-moz-ui-invalid {
    box-shadow: none;
  }

  /*
  Correct the inability to style the border radius in iOS Safari.
*/

  button,
  input:where([type="button"], [type="reset"], [type="submit"]),
  ::file-selector-button {
    appearance: button;
  }

  /*
  Correct the cursor style of increment and decrement buttons in Safari.
*/

  ::-webkit-inner-spin-button,
  ::-webkit-outer-spin-button {
    height: auto;
  }

  /*
  Make elements with the HTML hidden attribute stay hidden by default.
*/

  [hidden]:where(:not([hidden="until-found"])) {
    display: none !important;
  }
}

@layer utilities {
  @tailwind utilities;
}
`;
const css$2 = `
/*
  1. Prevent padding and border from affecting element width. (https://github.com/mozdevs/cssremedy/issues/4)
  2. Remove default margins and padding
  3. Reset all borders.
*/

*,
::after,
::before,
::backdrop,
::file-selector-button {
  box-sizing: border-box; /* 1 */
  margin: 0; /* 2 */
  padding: 0; /* 2 */
  border: 0 solid; /* 3 */
}

/*
  1. Use a consistent sensible line-height in all browsers.
  2. Prevent adjustments of font size after orientation changes in iOS.
  3. Use a more readable tab size.
  4. Use the user's configured \`sans\` font-family by default.
  5. Use the user's configured \`sans\` font-feature-settings by default.
  6. Use the user's configured \`sans\` font-variation-settings by default.
  7. Disable tap highlights on iOS.
*/

html,
:host {
  line-height: 1.5; /* 1 */
  -webkit-text-size-adjust: 100%; /* 2 */
  tab-size: 4; /* 3 */
  font-family: --theme(
    --default-font-family,
    ui-sans-serif,
    system-ui,
    sans-serif,
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol',
    'Noto Color Emoji'
  ); /* 4 */
  font-feature-settings: --theme(--default-font-feature-settings, normal); /* 5 */
  font-variation-settings: --theme(--default-font-variation-settings, normal); /* 6 */
  -webkit-tap-highlight-color: transparent; /* 7 */
}

/*
  1. Add the correct height in Firefox.
  2. Correct the inheritance of border color in Firefox. (https://bugzilla.mozilla.org/show_bug.cgi?id=190655)
  3. Reset the default border style to a 1px solid border.
*/

hr {
  height: 0; /* 1 */
  color: inherit; /* 2 */
  border-top-width: 1px; /* 3 */
}

/*
  Add the correct text decoration in Chrome, Edge, and Safari.
*/

abbr:where([title]) {
  -webkit-text-decoration: underline dotted;
  text-decoration: underline dotted;
}

/*
  Remove the default font size and weight for headings.
*/

h1,
h2,
h3,
h4,
h5,
h6 {
  font-size: inherit;
  font-weight: inherit;
}

/*
  Reset links to optimize for opt-in styling instead of opt-out.
*/

a {
  color: inherit;
  -webkit-text-decoration: inherit;
  text-decoration: inherit;
}

/*
  Add the correct font weight in Edge and Safari.
*/

b,
strong {
  font-weight: bolder;
}

/*
  1. Use the user's configured \`mono\` font-family by default.
  2. Use the user's configured \`mono\` font-feature-settings by default.
  3. Use the user's configured \`mono\` font-variation-settings by default.
  4. Correct the odd \`em\` font sizing in all browsers.
*/

code,
kbd,
samp,
pre {
  font-family: --theme(
    --default-mono-font-family,
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    'Liberation Mono',
    'Courier New',
    monospace
  ); /* 1 */
  font-feature-settings: --theme(--default-mono-font-feature-settings, normal); /* 2 */
  font-variation-settings: --theme(--default-mono-font-variation-settings, normal); /* 3 */
  font-size: 1em; /* 4 */
}

/*
  Add the correct font size in all browsers.
*/

small {
  font-size: 80%;
}

/*
  Prevent \`sub\` and \`sup\` elements from affecting the line height in all browsers.
*/

sub,
sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}

sub {
  bottom: -0.25em;
}

sup {
  top: -0.5em;
}

/*
  1. Remove text indentation from table contents in Chrome and Safari. (https://bugs.chromium.org/p/chromium/issues/detail?id=999088, https://bugs.webkit.org/show_bug.cgi?id=201297)
  2. Correct table border color inheritance in all Chrome and Safari. (https://bugs.chromium.org/p/chromium/issues/detail?id=935729, https://bugs.webkit.org/show_bug.cgi?id=195016)
  3. Remove gaps between table borders by default.
*/

table {
  text-indent: 0; /* 1 */
  border-color: inherit; /* 2 */
  border-collapse: collapse; /* 3 */
}

/*
  Use the modern Firefox focus style for all focusable elements.
*/

:-moz-focusring {
  outline: auto;
}

/*
  Add the correct vertical alignment in Chrome and Firefox.
*/

progress {
  vertical-align: baseline;
}

/*
  Add the correct display in Chrome and Safari.
*/

summary {
  display: list-item;
}

/*
  Make lists unstyled by default.
*/

ol,
ul,
menu {
  list-style: none;
}

/*
  1. Make replaced elements \`display: block\` by default. (https://github.com/mozdevs/cssremedy/issues/14)
  2. Add \`vertical-align: middle\` to align replaced elements more sensibly by default. (https://github.com/jensimmons/cssremedy/issues/14#issuecomment-634934210)
      This can trigger a poorly considered lint error in some tools but is included by design.
*/

img,
svg,
video,
canvas,
audio,
iframe,
embed,
object {
  display: block; /* 1 */
  vertical-align: middle; /* 2 */
}

/*
  Constrain images and videos to the parent width and preserve their intrinsic aspect ratio. (https://github.com/mozdevs/cssremedy/issues/14)
*/

img,
video {
  max-width: 100%;
  height: auto;
}

/*
  1. Inherit font styles in all browsers.
  2. Remove border radius in all browsers.
  3. Remove background color in all browsers.
  4. Ensure consistent opacity for disabled states in all browsers.
*/

button,
input,
select,
optgroup,
textarea,
::file-selector-button {
  font: inherit; /* 1 */
  font-feature-settings: inherit; /* 1 */
  font-variation-settings: inherit; /* 1 */
  letter-spacing: inherit; /* 1 */
  color: inherit; /* 1 */
  border-radius: 0; /* 2 */
  background-color: transparent; /* 3 */
  opacity: 1; /* 4 */
}

/*
  Restore default font weight.
*/

:where(select:is([multiple], [size])) optgroup {
  font-weight: bolder;
}

/*
  Restore indentation.
*/

:where(select:is([multiple], [size])) optgroup option {
  padding-inline-start: 20px;
}

/*
  Restore space after button.
*/

::file-selector-button {
  margin-inline-end: 4px;
}

/*
  Reset the default placeholder opacity in Firefox. (https://github.com/tailwindlabs/tailwindcss/issues/3300)
*/

::placeholder {
  opacity: 1;
}

/*
  Set the default placeholder color to a semi-transparent version of the current text color in browsers that do not
  crash when using \`color-mix(…)\` with \`currentcolor\`. (https://github.com/tailwindlabs/tailwindcss/issues/17194)
*/

@supports (not (-webkit-appearance: -apple-pay-button)) /* Not Safari */ or
  (contain-intrinsic-size: 1px) /* Safari 17+ */ {
  ::placeholder {
    color: color-mix(in oklab, currentcolor 50%, transparent);
  }
}

/*
  Prevent resizing textareas horizontally by default.
*/

textarea {
  resize: vertical;
}

/*
  Remove the inner padding in Chrome and Safari on macOS.
*/

::-webkit-search-decoration {
  -webkit-appearance: none;
}

/*
  1. Ensure date/time inputs have the same height when empty in iOS Safari.
  2. Ensure text alignment can be changed on date/time inputs in iOS Safari.
*/

::-webkit-date-and-time-value {
  min-height: 1lh; /* 1 */
  text-align: inherit; /* 2 */
}

/*
  Prevent height from changing on date/time inputs in macOS Safari when the input is set to \`display: block\`.
*/

::-webkit-datetime-edit {
  display: inline-flex;
}

/*
  Remove excess padding from pseudo-elements in date/time inputs to ensure consistent height across browsers.
*/

::-webkit-datetime-edit-fields-wrapper {
  padding: 0;
}

::-webkit-datetime-edit,
::-webkit-datetime-edit-year-field,
::-webkit-datetime-edit-month-field,
::-webkit-datetime-edit-day-field,
::-webkit-datetime-edit-hour-field,
::-webkit-datetime-edit-minute-field,
::-webkit-datetime-edit-second-field,
::-webkit-datetime-edit-millisecond-field,
::-webkit-datetime-edit-meridiem-field {
  padding-block: 0;
}

/*
  Center dropdown marker shown on inputs with paired \`<datalist>\`s in Chrome. (https://github.com/tailwindlabs/tailwindcss/issues/18499)
*/

::-webkit-calendar-picker-indicator {
  line-height: 1;
}

/*
  Remove the additional \`:invalid\` styles in Firefox. (https://github.com/mozilla/gecko-dev/blob/2f9eacd9d3d995c937b4251a5557d95d494c9be1/layout/style/res/forms.css#L728-L737)
*/

:-moz-ui-invalid {
  box-shadow: none;
}

/*
  Correct the inability to style the border radius in iOS Safari.
*/

button,
input:where([type='button'], [type='reset'], [type='submit']),
::file-selector-button {
  appearance: button;
}

/*
  Correct the cursor style of increment and decrement buttons in Safari.
*/

::-webkit-inner-spin-button,
::-webkit-outer-spin-button {
  height: auto;
}

/*
  Make elements with the HTML hidden attribute stay hidden by default.
*/

[hidden]:where(:not([hidden='until-found'])) {
  display: none !important;
}
`;
const css$1 = `
@theme default {
  --font-sans:
    ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
  --font-serif: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
  --font-mono:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;

  --color-red-50: oklch(97.1% 0.013 17.38);
  --color-red-100: oklch(93.6% 0.032 17.717);
  --color-red-200: oklch(88.5% 0.062 18.334);
  --color-red-300: oklch(80.8% 0.114 19.571);
  --color-red-400: oklch(70.4% 0.191 22.216);
  --color-red-500: oklch(63.7% 0.237 25.331);
  --color-red-600: oklch(57.7% 0.245 27.325);
  --color-red-700: oklch(50.5% 0.213 27.518);
  --color-red-800: oklch(44.4% 0.177 26.899);
  --color-red-900: oklch(39.6% 0.141 25.723);
  --color-red-950: oklch(25.8% 0.092 26.042);

  --color-orange-50: oklch(98% 0.016 73.684);
  --color-orange-100: oklch(95.4% 0.038 75.164);
  --color-orange-200: oklch(90.1% 0.076 70.697);
  --color-orange-300: oklch(83.7% 0.128 66.29);
  --color-orange-400: oklch(75% 0.183 55.934);
  --color-orange-500: oklch(70.5% 0.213 47.604);
  --color-orange-600: oklch(64.6% 0.222 41.116);
  --color-orange-700: oklch(55.3% 0.195 38.402);
  --color-orange-800: oklch(47% 0.157 37.304);
  --color-orange-900: oklch(40.8% 0.123 38.172);
  --color-orange-950: oklch(26.6% 0.079 36.259);

  --color-amber-50: oklch(98.7% 0.022 95.277);
  --color-amber-100: oklch(96.2% 0.059 95.617);
  --color-amber-200: oklch(92.4% 0.12 95.746);
  --color-amber-300: oklch(87.9% 0.169 91.605);
  --color-amber-400: oklch(82.8% 0.189 84.429);
  --color-amber-500: oklch(76.9% 0.188 70.08);
  --color-amber-600: oklch(66.6% 0.179 58.318);
  --color-amber-700: oklch(55.5% 0.163 48.998);
  --color-amber-800: oklch(47.3% 0.137 46.201);
  --color-amber-900: oklch(41.4% 0.112 45.904);
  --color-amber-950: oklch(27.9% 0.077 45.635);

  --color-yellow-50: oklch(98.7% 0.026 102.212);
  --color-yellow-100: oklch(97.3% 0.071 103.193);
  --color-yellow-200: oklch(94.5% 0.129 101.54);
  --color-yellow-300: oklch(90.5% 0.182 98.111);
  --color-yellow-400: oklch(85.2% 0.199 91.936);
  --color-yellow-500: oklch(79.5% 0.184 86.047);
  --color-yellow-600: oklch(68.1% 0.162 75.834);
  --color-yellow-700: oklch(55.4% 0.135 66.442);
  --color-yellow-800: oklch(47.6% 0.114 61.907);
  --color-yellow-900: oklch(42.1% 0.095 57.708);
  --color-yellow-950: oklch(28.6% 0.066 53.813);

  --color-lime-50: oklch(98.6% 0.031 120.757);
  --color-lime-100: oklch(96.7% 0.067 122.328);
  --color-lime-200: oklch(93.8% 0.127 124.321);
  --color-lime-300: oklch(89.7% 0.196 126.665);
  --color-lime-400: oklch(84.1% 0.238 128.85);
  --color-lime-500: oklch(76.8% 0.233 130.85);
  --color-lime-600: oklch(64.8% 0.2 131.684);
  --color-lime-700: oklch(53.2% 0.157 131.589);
  --color-lime-800: oklch(45.3% 0.124 130.933);
  --color-lime-900: oklch(40.5% 0.101 131.063);
  --color-lime-950: oklch(27.4% 0.072 132.109);

  --color-green-50: oklch(98.2% 0.018 155.826);
  --color-green-100: oklch(96.2% 0.044 156.743);
  --color-green-200: oklch(92.5% 0.084 155.995);
  --color-green-300: oklch(87.1% 0.15 154.449);
  --color-green-400: oklch(79.2% 0.209 151.711);
  --color-green-500: oklch(72.3% 0.219 149.579);
  --color-green-600: oklch(62.7% 0.194 149.214);
  --color-green-700: oklch(52.7% 0.154 150.069);
  --color-green-800: oklch(44.8% 0.119 151.328);
  --color-green-900: oklch(39.3% 0.095 152.535);
  --color-green-950: oklch(26.6% 0.065 152.934);

  --color-emerald-50: oklch(97.9% 0.021 166.113);
  --color-emerald-100: oklch(95% 0.052 163.051);
  --color-emerald-200: oklch(90.5% 0.093 164.15);
  --color-emerald-300: oklch(84.5% 0.143 164.978);
  --color-emerald-400: oklch(76.5% 0.177 163.223);
  --color-emerald-500: oklch(69.6% 0.17 162.48);
  --color-emerald-600: oklch(59.6% 0.145 163.225);
  --color-emerald-700: oklch(50.8% 0.118 165.612);
  --color-emerald-800: oklch(43.2% 0.095 166.913);
  --color-emerald-900: oklch(37.8% 0.077 168.94);
  --color-emerald-950: oklch(26.2% 0.051 172.552);

  --color-teal-50: oklch(98.4% 0.014 180.72);
  --color-teal-100: oklch(95.3% 0.051 180.801);
  --color-teal-200: oklch(91% 0.096 180.426);
  --color-teal-300: oklch(85.5% 0.138 181.071);
  --color-teal-400: oklch(77.7% 0.152 181.912);
  --color-teal-500: oklch(70.4% 0.14 182.503);
  --color-teal-600: oklch(60% 0.118 184.704);
  --color-teal-700: oklch(51.1% 0.096 186.391);
  --color-teal-800: oklch(43.7% 0.078 188.216);
  --color-teal-900: oklch(38.6% 0.063 188.416);
  --color-teal-950: oklch(27.7% 0.046 192.524);

  --color-cyan-50: oklch(98.4% 0.019 200.873);
  --color-cyan-100: oklch(95.6% 0.045 203.388);
  --color-cyan-200: oklch(91.7% 0.08 205.041);
  --color-cyan-300: oklch(86.5% 0.127 207.078);
  --color-cyan-400: oklch(78.9% 0.154 211.53);
  --color-cyan-500: oklch(71.5% 0.143 215.221);
  --color-cyan-600: oklch(60.9% 0.126 221.723);
  --color-cyan-700: oklch(52% 0.105 223.128);
  --color-cyan-800: oklch(45% 0.085 224.283);
  --color-cyan-900: oklch(39.8% 0.07 227.392);
  --color-cyan-950: oklch(30.2% 0.056 229.695);

  --color-sky-50: oklch(97.7% 0.013 236.62);
  --color-sky-100: oklch(95.1% 0.026 236.824);
  --color-sky-200: oklch(90.1% 0.058 230.902);
  --color-sky-300: oklch(82.8% 0.111 230.318);
  --color-sky-400: oklch(74.6% 0.16 232.661);
  --color-sky-500: oklch(68.5% 0.169 237.323);
  --color-sky-600: oklch(58.8% 0.158 241.966);
  --color-sky-700: oklch(50% 0.134 242.749);
  --color-sky-800: oklch(44.3% 0.11 240.79);
  --color-sky-900: oklch(39.1% 0.09 240.876);
  --color-sky-950: oklch(29.3% 0.066 243.157);

  --color-blue-50: oklch(97% 0.014 254.604);
  --color-blue-100: oklch(93.2% 0.032 255.585);
  --color-blue-200: oklch(88.2% 0.059 254.128);
  --color-blue-300: oklch(80.9% 0.105 251.813);
  --color-blue-400: oklch(70.7% 0.165 254.624);
  --color-blue-500: oklch(62.3% 0.214 259.815);
  --color-blue-600: oklch(54.6% 0.245 262.881);
  --color-blue-700: oklch(48.8% 0.243 264.376);
  --color-blue-800: oklch(42.4% 0.199 265.638);
  --color-blue-900: oklch(37.9% 0.146 265.522);
  --color-blue-950: oklch(28.2% 0.091 267.935);

  --color-indigo-50: oklch(96.2% 0.018 272.314);
  --color-indigo-100: oklch(93% 0.034 272.788);
  --color-indigo-200: oklch(87% 0.065 274.039);
  --color-indigo-300: oklch(78.5% 0.115 274.713);
  --color-indigo-400: oklch(67.3% 0.182 276.935);
  --color-indigo-500: oklch(58.5% 0.233 277.117);
  --color-indigo-600: oklch(51.1% 0.262 276.966);
  --color-indigo-700: oklch(45.7% 0.24 277.023);
  --color-indigo-800: oklch(39.8% 0.195 277.366);
  --color-indigo-900: oklch(35.9% 0.144 278.697);
  --color-indigo-950: oklch(25.7% 0.09 281.288);

  --color-violet-50: oklch(96.9% 0.016 293.756);
  --color-violet-100: oklch(94.3% 0.029 294.588);
  --color-violet-200: oklch(89.4% 0.057 293.283);
  --color-violet-300: oklch(81.1% 0.111 293.571);
  --color-violet-400: oklch(70.2% 0.183 293.541);
  --color-violet-500: oklch(60.6% 0.25 292.717);
  --color-violet-600: oklch(54.1% 0.281 293.009);
  --color-violet-700: oklch(49.1% 0.27 292.581);
  --color-violet-800: oklch(43.2% 0.232 292.759);
  --color-violet-900: oklch(38% 0.189 293.745);
  --color-violet-950: oklch(28.3% 0.141 291.089);

  --color-purple-50: oklch(97.7% 0.014 308.299);
  --color-purple-100: oklch(94.6% 0.033 307.174);
  --color-purple-200: oklch(90.2% 0.063 306.703);
  --color-purple-300: oklch(82.7% 0.119 306.383);
  --color-purple-400: oklch(71.4% 0.203 305.504);
  --color-purple-500: oklch(62.7% 0.265 303.9);
  --color-purple-600: oklch(55.8% 0.288 302.321);
  --color-purple-700: oklch(49.6% 0.265 301.924);
  --color-purple-800: oklch(43.8% 0.218 303.724);
  --color-purple-900: oklch(38.1% 0.176 304.987);
  --color-purple-950: oklch(29.1% 0.149 302.717);

  --color-fuchsia-50: oklch(97.7% 0.017 320.058);
  --color-fuchsia-100: oklch(95.2% 0.037 318.852);
  --color-fuchsia-200: oklch(90.3% 0.076 319.62);
  --color-fuchsia-300: oklch(83.3% 0.145 321.434);
  --color-fuchsia-400: oklch(74% 0.238 322.16);
  --color-fuchsia-500: oklch(66.7% 0.295 322.15);
  --color-fuchsia-600: oklch(59.1% 0.293 322.896);
  --color-fuchsia-700: oklch(51.8% 0.253 323.949);
  --color-fuchsia-800: oklch(45.2% 0.211 324.591);
  --color-fuchsia-900: oklch(40.1% 0.17 325.612);
  --color-fuchsia-950: oklch(29.3% 0.136 325.661);

  --color-pink-50: oklch(97.1% 0.014 343.198);
  --color-pink-100: oklch(94.8% 0.028 342.258);
  --color-pink-200: oklch(89.9% 0.061 343.231);
  --color-pink-300: oklch(82.3% 0.12 346.018);
  --color-pink-400: oklch(71.8% 0.202 349.761);
  --color-pink-500: oklch(65.6% 0.241 354.308);
  --color-pink-600: oklch(59.2% 0.249 0.584);
  --color-pink-700: oklch(52.5% 0.223 3.958);
  --color-pink-800: oklch(45.9% 0.187 3.815);
  --color-pink-900: oklch(40.8% 0.153 2.432);
  --color-pink-950: oklch(28.4% 0.109 3.907);

  --color-rose-50: oklch(96.9% 0.015 12.422);
  --color-rose-100: oklch(94.1% 0.03 12.58);
  --color-rose-200: oklch(89.2% 0.058 10.001);
  --color-rose-300: oklch(81% 0.117 11.638);
  --color-rose-400: oklch(71.2% 0.194 13.428);
  --color-rose-500: oklch(64.5% 0.246 16.439);
  --color-rose-600: oklch(58.6% 0.253 17.585);
  --color-rose-700: oklch(51.4% 0.222 16.935);
  --color-rose-800: oklch(45.5% 0.188 13.697);
  --color-rose-900: oklch(41% 0.159 10.272);
  --color-rose-950: oklch(27.1% 0.105 12.094);

  --color-slate-50: oklch(98.4% 0.003 247.858);
  --color-slate-100: oklch(96.8% 0.007 247.896);
  --color-slate-200: oklch(92.9% 0.013 255.508);
  --color-slate-300: oklch(86.9% 0.022 252.894);
  --color-slate-400: oklch(70.4% 0.04 256.788);
  --color-slate-500: oklch(55.4% 0.046 257.417);
  --color-slate-600: oklch(44.6% 0.043 257.281);
  --color-slate-700: oklch(37.2% 0.044 257.287);
  --color-slate-800: oklch(27.9% 0.041 260.031);
  --color-slate-900: oklch(20.8% 0.042 265.755);
  --color-slate-950: oklch(12.9% 0.042 264.695);

  --color-gray-50: oklch(98.5% 0.002 247.839);
  --color-gray-100: oklch(96.7% 0.003 264.542);
  --color-gray-200: oklch(92.8% 0.006 264.531);
  --color-gray-300: oklch(87.2% 0.01 258.338);
  --color-gray-400: oklch(70.7% 0.022 261.325);
  --color-gray-500: oklch(55.1% 0.027 264.364);
  --color-gray-600: oklch(44.6% 0.03 256.802);
  --color-gray-700: oklch(37.3% 0.034 259.733);
  --color-gray-800: oklch(27.8% 0.033 256.848);
  --color-gray-900: oklch(21% 0.034 264.665);
  --color-gray-950: oklch(13% 0.028 261.692);

  --color-zinc-50: oklch(98.5% 0 0);
  --color-zinc-100: oklch(96.7% 0.001 286.375);
  --color-zinc-200: oklch(92% 0.004 286.32);
  --color-zinc-300: oklch(87.1% 0.006 286.286);
  --color-zinc-400: oklch(70.5% 0.015 286.067);
  --color-zinc-500: oklch(55.2% 0.016 285.938);
  --color-zinc-600: oklch(44.2% 0.017 285.786);
  --color-zinc-700: oklch(37% 0.013 285.805);
  --color-zinc-800: oklch(27.4% 0.006 286.033);
  --color-zinc-900: oklch(21% 0.006 285.885);
  --color-zinc-950: oklch(14.1% 0.005 285.823);

  --color-neutral-50: oklch(98.5% 0 0);
  --color-neutral-100: oklch(97% 0 0);
  --color-neutral-200: oklch(92.2% 0 0);
  --color-neutral-300: oklch(87% 0 0);
  --color-neutral-400: oklch(70.8% 0 0);
  --color-neutral-500: oklch(55.6% 0 0);
  --color-neutral-600: oklch(43.9% 0 0);
  --color-neutral-700: oklch(37.1% 0 0);
  --color-neutral-800: oklch(26.9% 0 0);
  --color-neutral-900: oklch(20.5% 0 0);
  --color-neutral-950: oklch(14.5% 0 0);

  --color-stone-50: oklch(98.5% 0.001 106.423);
  --color-stone-100: oklch(97% 0.001 106.424);
  --color-stone-200: oklch(92.3% 0.003 48.717);
  --color-stone-300: oklch(86.9% 0.005 56.366);
  --color-stone-400: oklch(70.9% 0.01 56.259);
  --color-stone-500: oklch(55.3% 0.013 58.071);
  --color-stone-600: oklch(44.4% 0.011 73.639);
  --color-stone-700: oklch(37.4% 0.01 67.558);
  --color-stone-800: oklch(26.8% 0.007 34.298);
  --color-stone-900: oklch(21.6% 0.006 56.043);
  --color-stone-950: oklch(14.7% 0.004 49.25);

  --color-black: #000;
  --color-white: #fff;

  --spacing: 0.25rem;

  --breakpoint-sm: 40rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 64rem;
  --breakpoint-xl: 80rem;
  --breakpoint-2xl: 96rem;

  --container-3xs: 16rem;
  --container-2xs: 18rem;
  --container-xs: 20rem;
  --container-sm: 24rem;
  --container-md: 28rem;
  --container-lg: 32rem;
  --container-xl: 36rem;
  --container-2xl: 42rem;
  --container-3xl: 48rem;
  --container-4xl: 56rem;
  --container-5xl: 64rem;
  --container-6xl: 72rem;
  --container-7xl: 80rem;

  --text-xs: 0.75rem;
  --text-xs--line-height: calc(1 / 0.75);
  --text-sm: 0.875rem;
  --text-sm--line-height: calc(1.25 / 0.875);
  --text-base: 1rem;
  --text-base--line-height: calc(1.5 / 1);
  --text-lg: 1.125rem;
  --text-lg--line-height: calc(1.75 / 1.125);
  --text-xl: 1.25rem;
  --text-xl--line-height: calc(1.75 / 1.25);
  --text-2xl: 1.5rem;
  --text-2xl--line-height: calc(2 / 1.5);
  --text-3xl: 1.875rem;
  --text-3xl--line-height: calc(2.25 / 1.875);
  --text-4xl: 2.25rem;
  --text-4xl--line-height: calc(2.5 / 2.25);
  --text-5xl: 3rem;
  --text-5xl--line-height: 1;
  --text-6xl: 3.75rem;
  --text-6xl--line-height: 1;
  --text-7xl: 4.5rem;
  --text-7xl--line-height: 1;
  --text-8xl: 6rem;
  --text-8xl--line-height: 1;
  --text-9xl: 8rem;
  --text-9xl--line-height: 1;

  --font-weight-thin: 100;
  --font-weight-extralight: 200;
  --font-weight-light: 300;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-extrabold: 800;
  --font-weight-black: 900;

  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0em;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;

  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  --radius-xs: 0.125rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
  --radius-3xl: 1.5rem;
  --radius-4xl: 2rem;

  --shadow-2xs: 0 1px rgb(0 0 0 / 0.05);
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);

  --inset-shadow-2xs: inset 0 1px rgb(0 0 0 / 0.05);
  --inset-shadow-xs: inset 0 1px 1px rgb(0 0 0 / 0.05);
  --inset-shadow-sm: inset 0 2px 4px rgb(0 0 0 / 0.05);

  --drop-shadow-xs: 0 1px 1px rgb(0 0 0 / 0.05);
  --drop-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.15);
  --drop-shadow-md: 0 3px 3px rgb(0 0 0 / 0.12);
  --drop-shadow-lg: 0 4px 4px rgb(0 0 0 / 0.15);
  --drop-shadow-xl: 0 9px 7px rgb(0 0 0 / 0.1);
  --drop-shadow-2xl: 0 25px 25px rgb(0 0 0 / 0.15);

  --text-shadow-2xs: 0px 1px 0px rgb(0 0 0 / 0.15);
  --text-shadow-xs: 0px 1px 1px rgb(0 0 0 / 0.2);
  --text-shadow-sm:
    0px 1px 0px rgb(0 0 0 / 0.075), 0px 1px 1px rgb(0 0 0 / 0.075), 0px 2px 2px rgb(0 0 0 / 0.075);
  --text-shadow-md:
    0px 1px 1px rgb(0 0 0 / 0.1), 0px 1px 2px rgb(0 0 0 / 0.1), 0px 2px 4px rgb(0 0 0 / 0.1);
  --text-shadow-lg:
    0px 1px 2px rgb(0 0 0 / 0.1), 0px 3px 2px rgb(0 0 0 / 0.1), 0px 4px 8px rgb(0 0 0 / 0.1);

  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  --animate-spin: spin 1s linear infinite;
  --animate-ping: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  --animate-bounce: bounce 1s infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }

  @keyframes bounce {
    0%,
    100% {
      transform: translateY(-25%);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }

    50% {
      transform: none;
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
  }

  --blur-xs: 4px;
  --blur-sm: 8px;
  --blur-md: 12px;
  --blur-lg: 16px;
  --blur-xl: 24px;
  --blur-2xl: 40px;
  --blur-3xl: 64px;

  --perspective-dramatic: 100px;
  --perspective-near: 300px;
  --perspective-normal: 500px;
  --perspective-midrange: 800px;
  --perspective-distant: 1200px;

  --aspect-video: 16 / 9;

  --default-transition-duration: 150ms;
  --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  --default-font-family: --theme(--font-sans, initial);
  --default-font-feature-settings: --theme(--font-sans--font-feature-settings, initial);
  --default-font-variation-settings: --theme(--font-sans--font-variation-settings, initial);
  --default-mono-font-family: --theme(--font-mono, initial);
  --default-mono-font-feature-settings: --theme(--font-mono--font-feature-settings, initial);
  --default-mono-font-variation-settings: --theme(--font-mono--font-variation-settings, initial);
}

/* Deprecated */
@theme default inline reference {
  --blur: 8px;
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  --drop-shadow: 0 1px 2px rgb(0 0 0 / 0.1), 0 1px 1px rgb(0 0 0 / 0.06);
  --radius: 0.25rem;
  --max-width-prose: 65ch;
}
`;
const css = `
@tailwind utilities;
`;
function sanitizeCustomCss(css2) {
	const root = postcss.parse(css2);
	root.walkAtRules((atRule) => {
		if (atRule.name === 'import' || atRule.name === 'plugin' || atRule.name === 'source') {
			atRule.remove();
		}
	});
	return root.toString();
}
async function setupTailwind(config, customCSS) {
	const baseCss = `
@layer theme, base, components, utilities;
/* @import "tailwindcss/preflight.css" layer(base); */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
${customCSS ? sanitizeCustomCss(customCSS) : ''}
@config;
`;
	const compiler = await compile(baseCss, {
		async loadModule(id, base, resourceHint) {
			if (resourceHint === 'config') {
				return {
					path: id,
					base,
					module: config
				};
			}
			throw new Error(`NO-OP: should we implement support for ${resourceHint}: ${id}?`);
		},
		polyfills: 0,
		// All
		async loadStylesheet(id, base) {
			if (id === 'tailwindcss') {
				return {
					base,
					path: 'tailwindcss/index.css',
					content: css$3
				};
			}
			if (id === 'tailwindcss/preflight.css') {
				return {
					base,
					path: id,
					content: css$2
				};
			}
			if (id === 'tailwindcss/theme.css') {
				return {
					base,
					path: id,
					content: css$1
				};
			}
			if (id === 'tailwindcss/utilities.css') {
				return {
					base,
					path: id,
					content: css
				};
			}
			throw new Error('stylesheet not supported, you can only import the ones from tailwindcss');
		}
	});
	let css$4 = baseCss;
	return {
		addUtilities: function addUtilities(candidates) {
			css$4 = compiler.build(candidates);
		},
		getStyleSheet: function getStyleSheet() {
			return postcss.parse(css$4);
		}
	};
}
const MAX_CSS_VARIABLE_RESOLUTION_ITERATIONS = 10;
function getSelector(decl) {
	const parent = decl.parent;
	if (parent?.type === 'rule') {
		return parent.selector;
	}
	return '*';
}
function getAtRuleSelector(decl) {
	let parent = decl.parent;
	while (parent) {
		if (parent.type === 'atrule') {
			const atRuleParent = parent.parent;
			if (atRuleParent?.type === 'rule') {
				return atRuleParent.selector;
			}
		}
		if (parent.type === 'rule') {
			return parent.selector;
		}
		parent = parent.parent;
	}
	return void 0;
}
function isInAtRule(decl) {
	let parent = decl.parent;
	while (parent) {
		if (parent.type === 'atrule') {
			return true;
		}
		parent = parent.parent;
	}
	return false;
}
function isInPropertiesLayer(decl) {
	let parent = decl.parent;
	while (parent) {
		if (parent.type === 'atrule') {
			const atRule = parent;
			if (atRule.name === 'layer' && atRule.params?.includes('properties')) {
				return true;
			}
		}
		parent = parent.parent;
	}
	return false;
}
function doSelectorsIntersect(first, second) {
	if (first === second) return true;
	if (first.includes(':root') || second.includes(':root')) return true;
	if (first === '*' || second === '*') return true;
	return false;
}
function resolveAllCssVariables(root) {
	let iteration = 0;
	while (iteration < MAX_CSS_VARIABLE_RESOLUTION_ITERATIONS) {
		const variableDefinitions = /* @__PURE__ */ new Set();
		const variableUses = [];
		root.walkDecls((decl) => {
			if (isInPropertiesLayer(decl)) {
				return;
			}
			if (decl.prop.startsWith('--')) {
				variableDefinitions.add({
					declaration: decl,
					selector: getSelector(decl),
					variableName: decl.prop
				});
			}
			if (decl.value.includes('var(')) {
				const parseVariableUses = (value) => {
					const parsed = valueParser(value);
					parsed.walk((node) => {
						if (node.type === 'function' && node.value === 'var') {
							const varNameNode = node.nodes[0];
							const varName = varNameNode ? valueParser.stringify(varNameNode).trim() : '';
							let fallback;
							const commaIndex = node.nodes.findIndex((n) => n.type === 'div' && n.value === ',');
							if (commaIndex !== -1) {
								fallback = valueParser.stringify(node.nodes.slice(commaIndex + 1)).trim();
							}
							const raw = valueParser.stringify(node);
							variableUses.push({
								declaration: decl,
								selector: getSelector(decl),
								inAtRule: isInAtRule(decl),
								atRuleSelector: getAtRuleSelector(decl),
								fallback,
								variableName: varName,
								raw
							});
							if (fallback?.includes('var(')) {
								parseVariableUses(fallback);
							}
						}
					});
				};
				parseVariableUses(decl.value);
			}
		});
		if (variableUses.length === 0) {
			break;
		}
		let replacedInThisIteration = false;
		for (const use of variableUses) {
			let hasReplaced = false;
			for (const definition of variableDefinitions) {
				if (use.variableName !== definition.variableName) {
					continue;
				}
				if (use.inAtRule && use.atRuleSelector && doSelectorsIntersect(use.atRuleSelector, definition.selector)) {
					use.declaration.value = use.declaration.value.replaceAll(use.raw, definition.declaration.value);
					hasReplaced = true;
					replacedInThisIteration = true;
					break;
				}
				if (use.inAtRule && !use.atRuleSelector && (definition.selector.includes(':root') || definition.selector === '*')) {
					use.declaration.value = use.declaration.value.replaceAll(use.raw, definition.declaration.value);
					hasReplaced = true;
					replacedInThisIteration = true;
					break;
				}
				if (!use.inAtRule && doSelectorsIntersect(use.selector, definition.selector)) {
					use.declaration.value = use.declaration.value.replaceAll(use.raw, definition.declaration.value);
					hasReplaced = true;
					replacedInThisIteration = true;
					break;
				}
			}
			if (!hasReplaced && use.fallback) {
				use.declaration.value = use.declaration.value.replaceAll(use.raw, use.fallback);
				replacedInThisIteration = true;
			}
		}
		if (!replacedInThisIteration) {
			break;
		}
		iteration++;
	}
	if (iteration === MAX_CSS_VARIABLE_RESOLUTION_ITERATIONS) {
		console.warn(
			`[better-svelte-email] CSS variable resolution hit maximum iterations (${MAX_CSS_VARIABLE_RESOLUTION_ITERATIONS}). This may indicate circular variable references.`
		);
	}
}
function parseValue(str) {
	const match = str.match(/^(-?[\d.]+)(%|[a-z]+)?$/i);
	if (match) {
		const value = parseFloat(match[1]);
		const unit = match[2] || '';
		return {
			value,
			unit,
			type: unit === '%' ? 'percentage' : unit ? 'dimension' : 'number'
		};
	}
	return null;
}
function formatValue(parsed) {
	return `${parsed.value}${parsed.unit}`;
}
function toPixels$1(value, unit, baseFontSize) {
	switch (unit.toLowerCase()) {
		case 'px':
		case '':
			return value;
		case 'rem':
		case 'em':
			return value * baseFontSize;
		case 'pt':
			return value * (96 / 72);
		case 'pc':
			return value * 16;
		case 'in':
			return value * 96;
		case 'cm':
			return value * (96 / 2.54);
		case 'mm':
			return value * (96 / 25.4);
		default:
			return null;
	}
}
function isConvertibleUnit(unit) {
	const convertible = ['px', 'rem', 'em', 'pt', 'pc', 'in', 'cm', 'mm', ''];
	return convertible.includes(unit.toLowerCase());
}
function tokenizeCalcExpression(expr) {
	const tokens = [];
	let current = '';
	for (let i = 0; i < expr.length; i++) {
		const char = expr[i];
		if (char === '*' || char === '/') {
			if (current.trim()) {
				tokens.push(current.trim());
			}
			tokens.push(char);
			current = '';
		} else if (char === '+' || char === '-') {
			if (current.trim() && !/[eE]$/.test(current.trim())) {
				tokens.push(current.trim());
				tokens.push(char);
				current = '';
			} else {
				current += char;
			}
		} else if (char === ' ') {
			if (current.trim()) {
				let nextNonSpace = i + 1;
				while (nextNonSpace < expr.length && expr[nextNonSpace] === ' ') {
					nextNonSpace++;
				}
				const nextChar = expr[nextNonSpace];
				if (nextChar !== '*' && nextChar !== '/' && nextChar !== '+' && nextChar !== '-') {
					tokens.push(current.trim());
					current = '';
				}
			}
		} else {
			current += char;
		}
	}
	if (current.trim()) {
		tokens.push(current.trim());
	}
	return tokens;
}
function evaluateCalcExpression(expr, baseFontSize) {
	const tokens = tokenizeCalcExpression(expr);
	if (tokens.length === 0) return null;
	if (tokens.length === 1) {
		const parsed = parseValue(tokens[0]);
		return parsed ? formatValue(parsed) : null;
	}
	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i];
		if (token === '*' || token === '/') {
			const left = parseValue(tokens[i - 1]);
			const right = parseValue(tokens[i + 1]);
			if (left && right) {
				let resultValue;
				if (token === '*') {
					resultValue = left.value * right.value;
				} else {
					if (right.value === 0) resultValue = 0;
					else resultValue = left.value / right.value;
				}
				let resultUnit = '';
				if (left.type === 'dimension' && right.type === 'number') {
					resultUnit = left.unit;
				} else if (left.type === 'number' && right.type === 'dimension') {
					resultUnit = right.unit;
				} else if (left.type === 'dimension' && right.type === 'dimension') {
					if (token === '/');
					else {
						resultUnit = left.unit;
					}
				} else if (left.type === 'percentage' || right.type === 'percentage') {
					if (token === '/' && left.type === 'percentage' && right.type === 'percentage');
					else {
						resultUnit = '%';
					}
				}
				const result = formatValue({ value: resultValue, unit: resultUnit });
				tokens.splice(i - 1, 3, result);
				i = Math.max(0, i - 1);
				continue;
			}
		}
		i++;
	}
	if (tokens.length === 1) {
		return tokens[0];
	}
	i = 0;
	while (i < tokens.length) {
		const token = tokens[i];
		if ((token === '+' || token === '-') && i > 0 && i < tokens.length - 1) {
			const left = parseValue(tokens[i - 1]);
			const right = parseValue(tokens[i + 1]);
			if (left && right) {
				if (left.unit.toLowerCase() === right.unit.toLowerCase()) {
					const resultValue = token === '+' ? left.value + right.value : left.value - right.value;
					const result = formatValue({
						value: resultValue,
						unit: left.unit,
						type: left.type
					});
					tokens.splice(i - 1, 3, result);
					i = Math.max(0, i - 1);
					continue;
				}
				if (isConvertibleUnit(left.unit) && isConvertibleUnit(right.unit)) {
					const leftPx = toPixels$1(left.value, left.unit, baseFontSize);
					const rightPx = toPixels$1(right.value, right.unit, baseFontSize);
					if (leftPx !== null && rightPx !== null) {
						const resultPx = token === '+' ? leftPx + rightPx : leftPx - rightPx;
						const result = formatValue({
							value: resultPx,
							unit: 'px'
						});
						tokens.splice(i - 1, 3, result);
						i = Math.max(0, i - 1);
						continue;
					}
				}
			}
		}
		i++;
	}
	if (tokens.length === 1) {
		return tokens[0];
	}
	return null;
}
function resolveCalcExpressions(root, config) {
	const baseFontSize = config?.baseFontSize ?? 16;
	root.walkDecls((decl) => {
		if (!decl.value.includes('calc(')) return;
		const parsed = valueParser(decl.value);
		parsed.walk((node) => {
			if (node.type === 'function' && node.value === 'calc') {
				const innerContent = valueParser.stringify(node.nodes);
				const result = evaluateCalcExpression(innerContent, baseFontSize);
				if (result) {
					node.type = 'word';
					node.value = result;
					node.nodes = [];
				}
			}
		});
		decl.value = valueParser.stringify(parsed.nodes);
	});
}
function toPixels(value, unit, baseFontSize) {
	switch (unit.toLowerCase()) {
		case 'px':
			return value;
		case 'rem':
		case 'em':
			return value * baseFontSize;
		case 'pt':
			return value * (96 / 72);
		case 'pc':
			return value * 16;
		case 'in':
			return value * 96;
		case 'cm':
			return value * (96 / 2.54);
		case 'mm':
			return value * (96 / 25.4);
		default:
			return null;
	}
}
const LAB_TO_LMS = {
	l: [0.3963377773761749, 0.2158037573099136],
	m: [-0.1055613458156586, -0.0638541728258133],
	s: [-0.0894841775298119, -1.2914855480194092]
};
const LSM_TO_RGB = {
	r: [4.076741636075958, -3.307711539258063, 0.2309699031821043],
	g: [-1.2684379732850315, 2.609757349287688, -0.341319376002657],
	b: [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117]
};
function lrgbToRgb(input) {
	const absoluteNumber = Math.abs(input);
	const sign = input < 0 ? -1 : 1;
	if (absoluteNumber > 31308e-7) {
		return sign * (absoluteNumber ** (1 / 2.4) * 1.055 - 0.055);
	}
	return input * 12.92;
}
function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
function oklchToOklab(oklch) {
	return {
		l: oklch.l,
		a: oklch.c * Math.cos((oklch.h / 180) * Math.PI),
		b: oklch.c * Math.sin((oklch.h / 180) * Math.PI)
	};
}
function oklchToRgb(oklch) {
	const oklab = oklchToOklab(oklch);
	const l = (oklab.l + LAB_TO_LMS.l[0] * oklab.a + LAB_TO_LMS.l[1] * oklab.b) ** 3;
	const m = (oklab.l + LAB_TO_LMS.m[0] * oklab.a + LAB_TO_LMS.m[1] * oklab.b) ** 3;
	const s = (oklab.l + LAB_TO_LMS.s[0] * oklab.a + LAB_TO_LMS.s[1] * oklab.b) ** 3;
	const r = 255 * lrgbToRgb(LSM_TO_RGB.r[0] * l + LSM_TO_RGB.r[1] * m + LSM_TO_RGB.r[2] * s);
	const g = 255 * lrgbToRgb(LSM_TO_RGB.g[0] * l + LSM_TO_RGB.g[1] * m + LSM_TO_RGB.g[2] * s);
	const b = 255 * lrgbToRgb(LSM_TO_RGB.b[0] * l + LSM_TO_RGB.b[1] * m + LSM_TO_RGB.b[2] * s);
	return {
		r: clamp(r, 0, 255),
		g: clamp(g, 0, 255),
		b: clamp(b, 0, 255)
	};
}
function formatRgb(r, g, b, a) {
	const rInt = Math.round(r);
	const gInt = Math.round(g);
	const bInt = Math.round(b);
	if (a !== void 0 && a !== 1) {
		return `rgb(${rInt}, ${gInt}, ${bInt}, ${a})`;
	}
	return `rgb(${rInt}, ${gInt}, ${bInt})`;
}
function hexToRgb(hex) {
	hex = hex.replace('#', '');
	if (hex.length === 3) {
		return {
			r: parseInt(hex[0] + hex[0], 16),
			g: parseInt(hex[1] + hex[1], 16),
			b: parseInt(hex[2] + hex[2], 16)
		};
	}
	if (hex.length === 4) {
		return {
			r: parseInt(hex[0] + hex[0], 16),
			g: parseInt(hex[1] + hex[1], 16),
			b: parseInt(hex[2] + hex[2], 16),
			a: parseInt(hex[3] + hex[3], 16) / 255
		};
	}
	if (hex.length === 5) {
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex[2] + hex[2], 16),
			b: parseInt(hex[3] + hex[3], 16),
			a: parseInt(hex[4] + hex[4], 16) / 255
		};
	}
	if (hex.length === 6) {
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16)
		};
	}
	if (hex.length === 7) {
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
			a: parseInt(hex[6] + hex[6], 16) / 255
		};
	}
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
		a: parseInt(hex.slice(6, 8), 16) / 255
	};
}
function parseOklchValues(nodes) {
	const result = {};
	for (const node of nodes) {
		if (node.type === 'word') {
			const numMatch = node.value.match(/^(-?[\d.]+)(%|deg)?$/i);
			if (numMatch) {
				const value = parseFloat(numMatch[1]);
				const unit = numMatch[2]?.toLowerCase();
				if (unit === '%') {
					if (result.l === void 0) {
						result.l = value / 100;
					} else if (result.a === void 0) {
						result.a = value / 100;
					}
				} else if (unit === 'deg') {
					if (result.h === void 0) {
						result.h = value;
					}
				} else {
					if (result.l === void 0) {
						result.l = value;
					} else if (result.c === void 0) {
						result.c = value;
					} else if (result.h === void 0) {
						result.h = value;
					} else if (result.a === void 0) {
						result.a = value;
					}
				}
			}
		}
	}
	return result;
}
function parseRgbValues(nodes) {
	const result = {};
	for (const node of nodes) {
		if (node.type === 'word') {
			const numMatch = node.value.match(/^(-?[\d.]+)(%)?$/);
			if (numMatch) {
				const value = parseFloat(numMatch[1]);
				const isPercent = numMatch[2] === '%';
				if (result.r === void 0) {
					result.r = isPercent ? (value * 255) / 100 : value;
				} else if (result.g === void 0) {
					result.g = isPercent ? (value * 255) / 100 : value;
				} else if (result.b === void 0) {
					result.b = isPercent ? (value * 255) / 100 : value;
				} else if (result.a === void 0) {
					result.a = isPercent ? value / 100 : value;
				}
			}
		}
	}
	return result;
}
function transformColorMix(node) {
	const lastNode = node.nodes[node.nodes.length - 1];
	if (lastNode?.type !== 'word' || lastNode.value !== 'transparent') {
		return null;
	}
	let rgbFunc = null;
	let percentage = null;
	for (const child of node.nodes) {
		if (child.type === 'function' && child.value === 'rgb') {
			rgbFunc = child;
		}
		if (child.type === 'word' && child.value.endsWith('%')) {
			percentage = parseFloat(child.value) / 100;
		}
	}
	if (rgbFunc && percentage !== null) {
		const rgbValues = parseRgbValues(rgbFunc.nodes);
		if (rgbValues.r !== void 0 && rgbValues.g !== void 0 && rgbValues.b !== void 0) {
			return formatRgb(rgbValues.r, rgbValues.g, rgbValues.b, percentage);
		}
	}
	return null;
}
function sanitizeDeclarations(root, config) {
	const baseFontSize = config?.baseFontSize ?? 16;
	root.walkDecls((decl) => {
		if (decl.prop === 'border-radius' && /calc\s*\(\s*infinity\s*\*\s*1px\s*\)/i.test(decl.value)) {
			decl.value = '9999px';
		}
		if (decl.prop === 'padding-inline') {
			const values = decl.value.split(/\s+/).filter(Boolean);
			decl.prop = 'padding-left';
			decl.value = values[0];
			decl.cloneAfter({ prop: 'padding-right', value: values[1] || values[0] });
		}
		if (decl.prop === 'padding-block') {
			const values = decl.value.split(/\s+/).filter(Boolean);
			decl.prop = 'padding-top';
			decl.value = values[0];
			decl.cloneAfter({ prop: 'padding-bottom', value: values[1] || values[0] });
		}
		if (decl.prop === 'margin-inline') {
			const values = decl.value.split(/\s+/).filter(Boolean);
			decl.prop = 'margin-left';
			decl.value = values[0];
			decl.cloneAfter({ prop: 'margin-right', value: values[1] || values[0] });
		}
		if (decl.prop === 'margin-block') {
			const values = decl.value.split(/\s+/).filter(Boolean);
			decl.prop = 'margin-top';
			decl.value = values[0];
			decl.cloneAfter({ prop: 'margin-bottom', value: values[1] || values[0] });
		}
		const hasConvertibleUnits = /\d+(rem|em|pt|pc|in|cm|mm)\b/i.test(decl.value);
		if (hasConvertibleUnits) {
			const parsed = valueParser(decl.value);
			parsed.walk((node) => {
				if (node.type === 'word') {
					const match = node.value.match(/^(-?[\d.]+)(rem|em|pt|pc|in|cm|mm)$/i);
					if (match) {
						const numValue = parseFloat(match[1]);
						const unit = match[2];
						const pxValue = toPixels(numValue, unit, baseFontSize);
						if (pxValue !== null) {
							const rounded = Math.round(pxValue * 1e3) / 1e3;
							node.value = `${rounded}px`;
						}
					}
				}
			});
			decl.value = valueParser.stringify(parsed.nodes);
		}
		if (decl.value.includes('oklch(') || decl.value.includes('rgb(') || decl.value.includes('#') || decl.value.includes('color-mix(')) {
			const parsed = valueParser(decl.value);
			parsed.walk((node) => {
				if (node.type === 'function' && node.value === 'oklch') {
					const oklchValues = parseOklchValues(node.nodes);
					if (oklchValues.l === void 0 || oklchValues.c === void 0 || oklchValues.h === void 0) {
						throw new Error('Could not determine the parameters of an oklch() function.', {
							cause: decl
						});
					}
					const rgb = oklchToRgb({
						l: oklchValues.l,
						c: oklchValues.c,
						h: oklchValues.h
					});
					node.type = 'word';
					node.value = formatRgb(rgb.r, rgb.g, rgb.b, oklchValues.a);
					node.nodes = [];
				}
				if (node.type === 'function' && node.value === 'rgb') {
					const rgbValues = parseRgbValues(node.nodes);
					if (rgbValues.r === void 0 || rgbValues.g === void 0 || rgbValues.b === void 0) {
						throw new Error('Could not determine the parameters of an rgb() function.', {
							cause: decl
						});
					}
					node.type = 'word';
					node.value = formatRgb(rgbValues.r, rgbValues.g, rgbValues.b, rgbValues.a);
					node.nodes = [];
				}
				if (node.type === 'function' && node.value === 'color-mix') {
					const result = transformColorMix(node);
					if (result) {
						node.type = 'word';
						node.value = result;
						node.nodes = [];
					}
				}
				if (node.type === 'word' && node.value.startsWith('#')) {
					const rgb = hexToRgb(node.value);
					node.value = formatRgb(rgb.r, rgb.g, rgb.b, rgb.a);
				}
			});
			decl.value = valueParser.stringify(parsed.nodes);
		}
	});
}
function sanitizeStyleSheet(root, config) {
	resolveAllCssVariables(root);
	resolveCalcExpressions(root, config);
	sanitizeDeclarations(root, config);
}
const NON_INLINABLE_AT_RULES = /* @__PURE__ */ new Set(['media', 'supports', 'container', 'document']);
function isRuleInlinable(rule) {
	let hasAtRuleInside = false;
	rule.walk((node) => {
		if (node.type === 'atrule') {
			hasAtRuleInside = true;
			return false;
		}
	});
	if (hasAtRuleInside) {
		return false;
	}
	let parent = rule.parent;
	while (parent && parent.type !== 'root') {
		if (parent.type === 'atrule') {
			const atRule = parent;
			if (NON_INLINABLE_AT_RULES.has(atRule.name)) {
				return false;
			}
		}
		parent = parent.parent;
	}
	const hasPseudoSelector2 = /::?[\w-]+(\([^)]*\))?/.test(rule.selector);
	return !hasPseudoSelector2;
}
function unescapeClassName(name) {
	return name.replace(/\\(.)/g, '$1');
}
function extractRulesPerClass(root, classes) {
	const classSet = new Set(classes);
	const inlinableRules = /* @__PURE__ */ new Map();
	const nonInlinableRules = /* @__PURE__ */ new Map();
	root.walkRules((rule) => {
		const classMatches = rule.selector.matchAll(/\.((?:\\.|[^\s.:>+~[#,])+)/g);
		const selectorClasses = [...classMatches].map((m) => unescapeClassName(m[1]));
		const targetMap = isRuleInlinable(rule) ? inlinableRules : nonInlinableRules;
		for (const className of selectorClasses) {
			if (classSet.has(className)) {
				targetMap.set(className, rule);
			}
		}
	});
	return {
		inlinable: inlinableRules,
		nonInlinable: nonInlinableRules
	};
}
function splitSelectorList(selector) {
	const result = [];
	let current = '';
	let parenDepth = 0;
	let bracketDepth = 0;
	let inString = null;
	for (let i = 0; i < selector.length; i++) {
		const char = selector[i];
		if ((char === '"' || char === "'") && !inString) {
			inString = char;
		} else if (char === inString) {
			inString = null;
		}
		if (!inString) {
			if (char === '(') parenDepth++;
			if (char === ')') parenDepth--;
			if (char === '[') bracketDepth++;
			if (char === ']') bracketDepth--;
			if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
				result.push(current.trim());
				current = '';
				continue;
			}
		}
		current += char;
	}
	result.push(current.trim());
	return result;
}
function hasPseudoSelector(selector) {
	return /::?[\w-]+(\([^)]*\))?/.test(selector);
}
function extractGlobalRules(root) {
	const result = {
		universal: [],
		element: /* @__PURE__ */ new Map(),
		root: []
	};
	root.walkRules((rule) => {
		const inMediaQuery = isRuleInMediaQuery(rule);
		const selectors = splitSelectorList(rule.selector);
		for (const rawSelector of selectors) {
			const selector = rawSelector.trim();
			if (!selector) continue;
			if (selector === ':root') {
				if (!inMediaQuery) {
					const cloned2 = rule.clone();
					cloned2.selector = selector;
					result.root.push(cloned2);
				}
				continue;
			}
			if (hasPseudoSelector(selector)) {
				continue;
			}
			if (inMediaQuery) {
				continue;
			}
			if (selector.includes('.')) {
				continue;
			}
			if (selector.includes('[')) {
				continue;
			}
			if (selector.includes('#')) {
				continue;
			}
			if (/[>\s+~]/.test(selector) && selector !== '*') {
				continue;
			}
			const cloned = rule.clone();
			cloned.selector = selector;
			if (selector === '*') {
				result.universal.push(cloned);
				continue;
			}
			if (/^[a-z][a-z0-9-]*$/i.test(selector)) {
				const elementName = selector.toLowerCase();
				if (!result.element.has(elementName)) {
					result.element.set(elementName, []);
				}
				result.element.get(elementName).push(cloned);
			}
		}
	});
	return result;
}
function isRuleInMediaQuery(rule) {
	const NON_INLINABLE_AT_RULES2 = /* @__PURE__ */ new Set(['media', 'supports', 'container', 'document']);
	let parent = rule.parent;
	while (parent && parent.type !== 'root') {
		if (parent.type === 'atrule') {
			const atRule = parent;
			if (NON_INLINABLE_AT_RULES2.has(atRule.name)) {
				return true;
			}
		}
		parent = parent.parent;
	}
	return false;
}
function getCustomProperties(root) {
	const customProperties = /* @__PURE__ */ new Map();
	root.walkAtRules('property', (atRule) => {
		const propertyName = atRule.params.trim();
		if (propertyName.startsWith('--')) {
			const prop = {};
			atRule.walkDecls((decl) => {
				if (decl.prop === 'syntax') {
					prop.syntax = decl;
				}
				if (decl.prop === 'inherits') {
					prop.inherits = decl;
				}
				if (decl.prop === 'initial-value') {
					prop.initialValue = decl;
				}
			});
			customProperties.set(propertyName, prop);
		}
	});
	return customProperties;
}
const digitToNameMap = {
	0: 'zero',
	1: 'one',
	2: 'two',
	3: 'three',
	4: 'four',
	5: 'five',
	6: 'six',
	7: 'seven',
	8: 'eight',
	9: 'nine'
};
function sanitizeClassName(className) {
	return className
		.replaceAll('+', 'plus')
		.replaceAll('[', '')
		.replaceAll('%', 'pc')
		.replaceAll(']', '')
		.replaceAll('(', '')
		.replaceAll(')', '')
		.replaceAll('!', 'imprtnt')
		.replaceAll('>', 'gt')
		.replaceAll('<', 'lt')
		.replaceAll('=', 'eq')
		.replace(/^[0-9]/, (digit) => {
			return digitToNameMap[digit];
		})
		.replace(/[^a-zA-Z0-9\-_]/g, '_');
}
function sanitizeNonInlinableRules(root) {
	root.walkRules((rule) => {
		if (!isRuleInlinable(rule)) {
			rule.selector = rule.selector.replace(/\.((?:\\.|[^\s.:>+~[#,])+)/g, (match, className) => {
				const unescaped = className.replace(/\\(.)/g, '$1');
				return '.' + sanitizeClassName(unescaped);
			});
			rule.walkDecls((decl) => {
				decl.important = true;
			});
		}
	});
}
function makeInlineStylesFor(inlinableRules, customProperties) {
	let styles = '';
	const localVariableDeclarations = /* @__PURE__ */ new Map();
	for (const rule of inlinableRules) {
		rule.walkDecls((decl) => {
			if (decl.prop.startsWith('--')) {
				localVariableDeclarations.set(decl.prop, decl);
			}
		});
	}
	for (const rule of inlinableRules) {
		rule.walkDecls((decl) => {
			if (decl.prop.startsWith('--')) return;
			let value = decl.value;
			if (value.includes('var(')) {
				const parsed = valueParser(value);
				parsed.walk((node) => {
					if (node.type === 'function' && node.value === 'var') {
						const varNameNode = node.nodes[0];
						const variableName = varNameNode ? valueParser.stringify(varNameNode).trim() : '';
						if (variableName) {
							const localDef = localVariableDeclarations.get(variableName);
							if (localDef) {
								node.type = 'word';
								node.value = localDef.value;
								node.nodes = [];
							} else {
								const customProp = customProperties.get(variableName);
								if (customProp?.initialValue) {
									node.type = 'word';
									node.value = customProp.initialValue.value;
									node.nodes = [];
								}
							}
						}
					}
				});
				value = valueParser.stringify(parsed.nodes);
			}
			const important = decl.important ? ' !important' : '';
			styles += `${decl.prop}:${value}${important};`;
		});
	}
	return styles;
}
function combineStyles(...styles) {
	return styles
		.filter(Boolean)
		.map((s) =>
			s
				?.split(';')
				.map((s2) => s2.trim())
				.filter(Boolean)
		)
		.flat()
		.join(';');
}
const ALWAYS_APPLY_PROPS = ['box-sizing', 'margin'];
const CONDITIONAL_PROPS_PATTERN = /(border|outline)-color/g;
function getMatchingGlobalRulesForElement(rules, element) {
	const matchingRules = [];
	for (const rule of rules) {
		const matchingDecls = [];
		for (const node of rule.nodes) {
			if (node.type !== 'decl') continue;
			const decl = node;
			if (ALWAYS_APPLY_PROPS.includes(decl.prop)) {
				matchingDecls.push(decl);
				continue;
			}
			if (decl.prop.match(CONDITIONAL_PROPS_PATTERN)) {
				const key = decl.prop.match(/(border|outline)-color/)?.[1];
				if (!key) continue;
				const hasMatchingClass = element.attrs?.find((attr) => attr.name === 'class' && attr.value?.match(key));
				if (hasMatchingClass) {
					matchingDecls.push(decl);
				}
			}
		}
		if (matchingDecls.length > 0) {
			const clonedRule = rule.clone();
			clonedRule.nodes = matchingDecls;
			matchingRules.push(clonedRule);
		}
	}
	return matchingRules;
}
function getGlobalStylesForElement(element, globalRules, customProperties) {
	const rules = [];
	const tagName = element.tagName.toLowerCase();
	const matchingGlobalRules = getMatchingGlobalRulesForElement(globalRules.universal, element);
	if (matchingGlobalRules.length > 0) {
		rules.push(...matchingGlobalRules);
	}
	const elementRules = globalRules.element.get(tagName);
	if (elementRules) {
		rules.push(...elementRules);
	}
	if (tagName === 'html') {
		rules.push(...globalRules.root);
	}
	if (rules.length === 0) {
		return '';
	}
	return makeInlineStylesFor(rules, customProperties);
}
function addInlinedStylesToElement(element, inlinableRules, nonInlinableRules, customProperties, unknownClasses, globalRules) {
	const globalStyles = globalRules ? getGlobalStylesForElement(element, globalRules, customProperties) : '';
	const classAttr = element.attrs?.find((attr) => attr.name === 'class');
	const styleAttr = element.attrs?.find((attr) => attr.name === 'style');
	const existingStyles = styleAttr?.value ?? '';
	if (classAttr && classAttr.value) {
		const classes = classAttr.value.split(/\s+/).filter(Boolean);
		const residualClasses = [];
		const rules = [];
		for (const className of classes) {
			const rule = inlinableRules.get(className);
			if (rule) {
				rules.push(rule);
			} else {
				residualClasses.push(className);
			}
		}
		const classStyles = makeInlineStylesFor(rules, customProperties);
		const newStyles = combineStyles(globalStyles, existingStyles, classStyles);
		if (newStyles) {
			if (styleAttr) {
				element.attrs = element.attrs?.map((attr) => {
					if (attr.name === 'style') {
						return { ...attr, value: newStyles };
					}
					return attr;
				});
			} else {
				element.attrs = [...element.attrs, { name: 'style', value: newStyles }];
			}
		}
		if (residualClasses.length > 0) {
			element.attrs = element.attrs?.map((attr) => {
				if (attr.name === 'class') {
					return {
						...attr,
						value: residualClasses
							.map((className) => {
								if (nonInlinableRules.has(className)) {
									return sanitizeClassName(className);
								} else {
									if (!unknownClasses.includes(className)) {
										unknownClasses.push(className);
									}
									return className;
								}
							})
							.join(' ')
					};
				}
				return attr;
			});
		} else {
			element.attrs = element.attrs?.filter((attr) => attr.name !== 'class');
		}
	} else if (globalStyles) {
		const newStyles = combineStyles(globalStyles, existingStyles);
		if (newStyles) {
			if (styleAttr) {
				element.attrs = element.attrs?.map((attr) => {
					if (attr.name === 'style') {
						return { ...attr, value: newStyles };
					}
					return attr;
				});
			} else {
				element.attrs = [...(element.attrs || []), { name: 'style', value: newStyles }];
			}
		}
	}
	return element;
}
function isValidNode(node) {
	return !node.nodeName.startsWith('#');
}
function removeAttributesFunctions(ast) {
	return walk(ast, (node) => {
		if (isValidNode(node)) {
			node.attrs = node.attrs?.filter((attr) => !['onload', 'onerror'].includes(attr.name)) ?? [];
		}
		return node;
	});
}
function isRendererOptions(obj) {
	return typeof obj === 'object' && obj !== null && ('tailwindConfig' in obj || 'customCSS' in obj || 'baseFontSize' in obj);
}
class Renderer {
	tailwindConfig;
	customCSS;
	baseFontSize;
	constructor(optionsOrConfig = {}) {
		if (isRendererOptions(optionsOrConfig)) {
			this.tailwindConfig = optionsOrConfig.tailwindConfig || {};
			this.customCSS = optionsOrConfig.customCSS;
			this.baseFontSize = optionsOrConfig.baseFontSize ?? 16;
		} else {
			this.tailwindConfig = optionsOrConfig || {};
			this.customCSS = void 0;
			this.baseFontSize = 16;
		}
	}
	/**
	 * Renders a Svelte component to email-safe HTML with inlined Tailwind CSS.
	 *
	 * Automatically:
	 * - Converts Tailwind classes to inline styles
	 * - Injects media queries into `<head>` for responsive classes
	 * - Replaces DOCTYPE with XHTML 1.0 Transitional
	 * - Removes comments and Svelte artifacts
	 *
	 * @param component - The Svelte component to render
	 * @param options - Render options including props, context, and idPrefix
	 * @returns Email-safe HTML string
	 *
	 * @example
	 * ```ts
	 * const html = await renderer.render(EmailComponent, {
	 *   props: { username: 'john_doe', resetUrl: 'https://...' }
	 * });
	 * ```
	 */
	render = async (component, options) => {
		const { body } = render(component, options);
		let ast = parse(body);
		ast = removeAttributesFunctions(ast);
		let classesUsed = [];
		const tailwindSetup = await setupTailwind(this.tailwindConfig, this.customCSS);
		walk(ast, (node) => {
			if (isValidNode(node)) {
				const classAttr = node.attrs?.find((attr) => attr.name === 'class');
				if (classAttr && classAttr.value) {
					const classes = classAttr.value.split(/\s+/).filter(Boolean);
					classesUsed = [...classesUsed, ...classes];
					tailwindSetup.addUtilities(classes);
				}
			}
			return node;
		});
		const styleSheet = tailwindSetup.getStyleSheet();
		sanitizeStyleSheet(styleSheet, { baseFontSize: this.baseFontSize });
		const globalRules = extractGlobalRules(styleSheet);
		const { inlinable: inlinableRules, nonInlinable: nonInlinableRules } = extractRulesPerClass(styleSheet, classesUsed);
		const customProperties = getCustomProperties(styleSheet);
		const nonInlineStyles = postcss.root();
		for (const rule of nonInlinableRules.values()) {
			nonInlineStyles.append(rule.clone());
		}
		sanitizeNonInlinableRules(nonInlineStyles);
		const hasNonInlineStylesToApply = nonInlinableRules.size > 0;
		let appliedNonInlineStyles = false;
		let hasHead = false;
		const unknownClasses = [];
		ast = walk(ast, (node) => {
			if (isValidNode(node)) {
				const elementWithInlinedStyles = addInlinedStylesToElement(
					node,
					inlinableRules,
					nonInlinableRules,
					customProperties,
					unknownClasses,
					globalRules
				);
				if (node.nodeName === 'head') {
					hasHead = true;
				}
				return elementWithInlinedStyles;
			}
			return node;
		});
		let serialized = serialize(ast);
		if (unknownClasses.length > 0) {
			console.warn(`[better-svelte-email] You are using the following classes that were not recognized: ${unknownClasses.join(' ')}.`);
		}
		if (hasHead && hasNonInlineStylesToApply) {
			appliedNonInlineStyles = true;
			serialized = serialized.replace(/<head([^>]*)>/, '<head$1><style>' + nonInlineStyles.toString() + '</style>');
		}
		if (hasNonInlineStylesToApply && !appliedNonInlineStyles) {
			throw new Error(`You are trying to use the following Tailwind classes that cannot be inlined: ${Array.from(nonInlinableRules.keys()).join(' ')}.
For the media queries to work properly on rendering, they need to be added into a <style> tag inside of a <head> tag,
the render function tried finding a <head> element but just wasn't able to find it.

Make sure that you have a <head> element at any depth. 
This can also be our <Head> component.

If you do already have a <head> element at some depth, 
please file a bug https://github.com/Konixy/better-svelte-email/issues/new?assignees=&labels=bug&projects=.`);
		}
		serialized = serialized.replace(
			/<!DOCTYPE\s+html[^>]*>/i,
			'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
		);
		return serialized;
	};
}
const emailList = ({ path: emailPath = '/src/lib/emails', root } = {}) => {
	if (!root) {
		try {
			root = process.cwd();
		} catch (err) {
			throw new Error(
				'Could not determine the root path of your project. Please pass in the root param manually using process.cwd() or an absolute path.\nOriginal error: ' +
					err
			);
		}
	}
	const fullPath = path.join(root, emailPath);
	if (!fs.existsSync(fullPath)) {
		console.warn(`Email directory not found: ${fullPath}`);
		return { files: null, path: emailPath };
	}
	const files = createEmailComponentList(fullPath, getFiles(fullPath));
	if (!files.length) {
		return { files: null, path: emailPath };
	}
	return { files, path: emailPath };
};
const getEmailComponent = async (emailPath, file) => {
	const fileName = `${file}.svelte`;
	try {
		const normalizedEmailPath = emailPath.replace(/\\/g, '/').replace(/\/+$/, '');
		const normalizedFile = file.replace(/\\/g, '/').replace(/^\/+/, '');
		const importPath = `${normalizedEmailPath}/${normalizedFile}.svelte`;
		return (
			await import(
				/* @vite-ignore */
				importPath
			)
		).default;
	} catch (err) {
		throw new Error(`Failed to import email component '${fileName}'. Make sure the file exists and includes the <Head /> component.
Original error: ${err}`);
	}
};
const getEmailSource = async (emailPath, file) => {
	const normalizedEmailPath = emailPath.replace(/\\/g, '/').replace(/\/+$/, '');
	const normalizedFile = file.replace(/\\/g, '/').replace(/^\/+/, '');
	const candidates = /* @__PURE__ */ new Set();
	const relativeEmailPath = normalizedEmailPath.replace(/^\/+/, '');
	if (normalizedEmailPath) {
		candidates.add(path.resolve(process.cwd(), relativeEmailPath, `${normalizedFile}.svelte`));
		candidates.add(path.resolve(process.cwd(), normalizedEmailPath, `${normalizedFile}.svelte`));
		candidates.add(path.resolve(normalizedEmailPath, `${normalizedFile}.svelte`));
	}
	candidates.add(path.resolve(process.cwd(), `${normalizedFile}.svelte`));
	for (const candidate of candidates) {
		try {
			return await fs.promises.readFile(candidate, 'utf8');
		} catch {}
	}
	console.warn(`Source file not found for ${normalizedFile} in ${normalizedEmailPath}`);
	return null;
};
const createEmail = (options = {}) => {
	const { renderer = new Renderer() } = options;
	return {
		'create-email': async (event) => {
			try {
				const data = await event.request.formData();
				const file = data.get('file');
				const emailPath = data.get('path');
				if (!file || !emailPath) {
					return {
						status: 400,
						body: { error: 'Missing file or path parameter' }
					};
				}
				const emailComponent = await getEmailComponent(emailPath, file);
				const source = await getEmailSource(emailPath, file);
				const html = await renderer.render(emailComponent);
				const formattedHtml = await prettier.format(html, {
					parser: 'html',
					plugins: [parserHtml]
				});
				return {
					body: formattedHtml,
					source
				};
			} catch (error2) {
				console.error('Error rendering email:', error2);
				return {
					status: 500,
					error: {
						message: error2 instanceof Error ? error2.message : 'Failed to render email'
					}
				};
			}
		}
	};
};
const defaultSendEmailFunction = async ({ from, to, subject, html }, resendApiKey) => {
	const resend = new Resend(resendApiKey);
	const email = { from, to, subject, html };
	const resendReq = await resend.emails.send(email);
	if (resendReq.error) {
		return { success: false, error: resendReq.error };
	} else {
		return { success: true, error: null };
	}
};
const sendEmail = ({
	customSendEmailFunction,
	resendApiKey,
	renderer = new Renderer(),
	from = 'better-svelte-email <onboarding@resend.dev>'
} = {}) => {
	return {
		'send-email': async (event) => {
			const data = await event.request.formData();
			const emailPath = data.get('path');
			const file = data.get('file');
			if (!file || !emailPath) {
				return {
					success: false,
					error: { message: 'Missing file or path parameter' }
				};
			}
			const emailComponent = await getEmailComponent(emailPath, file);
			const email = {
				from,
				to: `${data.get('to')}`,
				subject: `${data.get('component')} ${data.get('note') ? '| ' + data.get('note') : ''}`,
				html: await renderer.render(emailComponent)
			};
			let sent = { error: null };
			if (!customSendEmailFunction && resendApiKey) {
				sent = await defaultSendEmailFunction(email, resendApiKey);
			} else if (customSendEmailFunction) {
				sent = await customSendEmailFunction(email);
			} else if (!customSendEmailFunction && !resendApiKey) {
				const error2 = {
					message: 'Resend API key not configured. Please pass your API key to the sendEmail() function in your +page.server.ts file.'
				};
				return { success: false, error: error2 };
			}
			if (sent && sent.error) {
				console.log('Error:', sent.error);
				return { success: false, error: sent.error };
			} else {
				console.log('Email was sent successfully.');
				return { success: true, error: null };
			}
		}
	};
};
function getFiles(dir, files = []) {
	const fileList = fs.readdirSync(dir);
	for (const file of fileList) {
		const name = path.join(dir, file);
		if (fs.statSync(name).isDirectory()) {
			getFiles(name, files);
		} else {
			files.push(name);
		}
	}
	return files;
}
function createEmailComponentList(root, paths) {
	const emailComponentList = [];
	paths.forEach((filePath) => {
		if (filePath.endsWith('.svelte')) {
			const fileDir = path.dirname(filePath);
			const baseName = path.basename(filePath, '.svelte');
			const rootNormalized = path.normalize(root);
			const fileDirNormalized = path.normalize(fileDir);
			const rootIndex = fileDirNormalized.indexOf(rootNormalized);
			if (rootIndex !== -1) {
				const afterRoot = fileDirNormalized.substring(rootIndex + rootNormalized.length);
				const relativePath = afterRoot ? path.join(afterRoot, baseName) : baseName;
				const cleanPath = relativePath.replace(/^[/\\]+/, '');
				emailComponentList.push(cleanPath);
			}
		}
	});
	return emailComponentList;
}
let eventFetch;
async function load({ locals, fetch }) {
	const { user: userData, isAdmin } = locals;
	eventFetch = fetch;
	if (!userData) {
		logger.warn('Unauthenticated attempt to access email previews');
		throw error(401, 'Authentication required');
	}
	if (!isAdmin) {
		logger.warn(`Unauthorized attempt to access email previews by user: ${userData._id}`);
		throw error(403, 'Insufficient permissions - admin access required');
	}
	const emailListData = await emailList({ path: '/src/components/emails' });
	return {
		user: userData,
		...emailListData
	};
}
const actions = {
	...createEmail,
	...sendEmail({
		customSendEmailFunction: async ({
			/* from, */
			to,
			subject
			/* html */
		}) => {
			const templateName = subject?.includes('Preview:') ? subject.replace('Preview:', '').trim() : 'welcomeUser';
			logger.info('Email preview attempting to send via API:', {
				recipientEmail: to,
				subject,
				templateName
			});
			const previewProps = {
				username: 'Preview User',
				email: to,
				sitename: 'SveltyCMS (Preview)',
				hostLink: 'http://localhost:5173'
				// Add any other commonly required props with sensible defaults
			};
			try {
				const res = await eventFetch('/api/sendMail', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						recipientEmail: to,
						subject: subject || `Preview: ${templateName}`,
						templateName,
						props: previewProps,
						languageTag: 'en'
					})
				});
				if (!res.ok) {
					const errorText = await res.text();
					logger.error(`Error from /api/sendMail endpoint during preview: ${res.status} ${errorText}`);
					return { success: false, error: `API Error (${res.status}): ${errorText}` };
				}
				const result = await res.json();
				if (result.success) {
					logger.info('Email preview sent successfully via API.');
				} else {
					logger.warn('Email preview API call reported not successful:', { message: result.message });
				}
				return result;
			} catch (error2) {
				logger.error('Failed to send email via API endpoint during preview', { error: error2 });
				return { success: false, error: error2 instanceof Error ? error2.message : String(error2) };
			}
		}
	})
};
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map
