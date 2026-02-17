/**
 * @file tests/unit/utils/livePreview.test.ts
 * @description Unit tests for the Live Preview listener utility
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createLivePreviewListener } from '@src/utils/useLivePreview';

describe('LivePreview Utility', () => {
	let mockOnUpdate: any;
	let addEventListenerSpy: any;
	let removeEventListenerSpy: any;
	let postMessageSpy: any;

	beforeEach(() => {
		mockOnUpdate = mock(() => {});

		// Mock global window objects
		addEventListenerSpy = mock((_event, _cb) => {});
		removeEventListenerSpy = mock((_event, _cb) => {});
		postMessageSpy = mock((_msg, _origin) => {});

		(globalThis as any).window = {
			addEventListener: addEventListenerSpy,
			removeEventListener: removeEventListenerSpy,
			parent: {
				postMessage: postMessageSpy
			}
		};
		// Set parent !== window to trigger init message
		(globalThis as any).window.parent.window = {};
	});

	it('should register a message listener and signal readiness', () => {
		const { destroy } = createLivePreviewListener({ onUpdate: mockOnUpdate });

		expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
		expect(postMessageSpy).toHaveBeenCalledWith({ type: 'svelty:init' }, '*');

		destroy();
		expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
	});

	it('should call onUpdate when a valid message is received', () => {
		let messageHandler: any;
		addEventListenerSpy = mock((event, cb) => {
			if (event === 'message') {
				messageHandler = cb;
			}
		});
		(globalThis as any).window.addEventListener = addEventListenerSpy;

		createLivePreviewListener({ onUpdate: mockOnUpdate });

		// Simulate valid message
		const mockEvent = {
			data: {
				type: 'svelty:update',
				data: { title: 'New Title' }
			},
			origin: 'http://localhost:5173'
		};

		messageHandler(mockEvent);
		expect(mockOnUpdate).toHaveBeenCalledWith({ title: 'New Title' });
	});

	it('should validate origin if specified', () => {
		let messageHandler: any;
		addEventListenerSpy = mock((event, cb) => {
			if (event === 'message') {
				messageHandler = cb;
			}
		});
		(globalThis as any).window.addEventListener = addEventListenerSpy;

		createLivePreviewListener({
			onUpdate: mockOnUpdate,
			origin: 'https://trusted.com'
		});

		// Simulate message from untrusted origin
		messageHandler({
			data: { type: 'svelty:update', data: {} },
			origin: 'https://evil.com'
		});
		expect(mockOnUpdate).not.toHaveBeenCalled();

		// Simulate message from trusted origin
		messageHandler({
			data: { type: 'svelty:update', data: { ok: true } },
			origin: 'https://trusted.com'
		});
		expect(mockOnUpdate).toHaveBeenCalledWith({ ok: true });
	});
});
