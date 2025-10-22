import { describe, it, expect } from 'bun:test';

console.log('Test file is being executed');

describe('Basic Test', () => {
	console.log('Entering describe block');

	it('should pass a simple assertion', () => {
		console.log('Running first test');
		expect(true).toBe(true);
	});

	it('should perform basic math', () => {
		console.log('Running second test');
		expect(1 + 1).toBe(2);
	});

	console.log('Exiting describe block');
});

console.log('Test file execution complete');
