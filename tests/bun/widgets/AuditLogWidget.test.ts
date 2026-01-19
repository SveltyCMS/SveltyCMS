/**
 * @file tests/bun/widgets/AuditLogWidget.test.ts
 * @description Tests for the AuditLogWidget component
 */

import '../setup';
import { describe, it, expect } from 'bun:test';
import AuditLogWidget from '../../../shared/features/src/dashboard/widgets/AuditLogWidget.svelte';
import { render } from '@testing-library/svelte';

describe('AuditLogWidget', () => {
	it('renders correctly', () => {
		const { container } = render(AuditLogWidget, { props: { config: {} } });
		expect(container.innerHTML).toContain('Audit Log');
		expect(container.innerHTML).toContain('SECURE');
	});

	it('shows fetched logs', async () => {
		// Mock fetch
		global.fetch = jest.fn(() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve([{ id: 1, action: 'user.login', actor: 'test@example.com', time: 'Just now', hash: 'abc' }])
			})
		) as any;

		const { findByText } = render(AuditLogWidget, { props: { config: {} } });
		expect(await findByText('user.login')).toBeTruthy();
	});
});
