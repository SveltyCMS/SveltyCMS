/**
 * @file tests/unit/services/GDPRService.test.ts
 * @description Unit tests for the GDPR Compliance Service
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { gdprService } from '@src/services/GDPRService';

// Access global mocks from setup.ts
const mockAuditLog = (globalThis as any).mockAuditLog;
const mockDbAdapter = (globalThis as any).mockDbAdapter;

describe('GDPRService', () => {
	beforeEach(() => {
		mockAuditLog.log.mockClear();
		mockAuditLog.getLogs.mockClear();
		(mockDbAdapter.auth.getUserById as any).mockImplementation((id: string) =>
			Promise.resolve({ success: true, data: { _id: id, email: 'test@example.com', username: 'tester' } })
		);
		mockDbAdapter.auth.updateUserAttributes.mockImplementation(() => Promise.resolve({ success: true }));
	});

	describe('exportUserData', () => {
		it('should fetch user profile and related logs', async () => {
			const userId = '123';
			const mockLogs = [
				{ actor: { id: '123' }, action: 'entry.create' },
				{ actor: { id: '456' }, action: 'entry.update' } // different user
			];
			mockAuditLog.getLogs.mockReturnValue(Promise.resolve(mockLogs as any));

			const result = (await gdprService.exportUserData(userId)) as any;

			expect(mockDbAdapter.auth.getUserById).toHaveBeenCalledWith(userId);
			expect(mockAuditLog.getLogs).toHaveBeenCalled();
			expect(result.profile._id).toBe(userId);
			expect(result.history).toHaveLength(1);
			expect(result.history[0].action).toBe('entry.create');
			expect(mockAuditLog.log).toHaveBeenCalledWith('gdpr.export', expect.anything(), expect.anything(), expect.anything());
		});

		it('should throw error if user not found', async () => {
			mockDbAdapter.auth.getUserById.mockReturnValue(Promise.resolve({ success: false, data: null as any }));
			expect(gdprService.exportUserData('missing')).rejects.toThrow('User not found');
		});
	});

	describe('anonymizeUser', () => {
		it('should update user attributes with ghost identity', async () => {
			const userId = '123';
			const result = await gdprService.anonymizeUser(userId);

			expect(result).toBe(true);
			expect(mockDbAdapter.auth.updateUserAttributes).toHaveBeenCalledWith(
				userId,
				expect.objectContaining({
					email: expect.stringContaining('anonymized.sveltycms.com'),
					username: expect.stringContaining('ghost-')
				})
			);
			expect(mockAuditLog.log).toHaveBeenCalledWith('gdpr.erasure', expect.anything(), expect.anything(), expect.anything());
		});

		it('should return false if database adapter is missing', async () => {
			mockDbAdapter.auth.getUserById.mockReturnValue(Promise.resolve({ success: false, data: null as any }));
			const result = await gdprService.anonymizeUser('missing');
			expect(result).toBe(false);
		});
	});
});
