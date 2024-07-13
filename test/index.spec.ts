// test/index.spec.ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('proxy worker', () => {
	it('400 if no space name', async () => {
		const res = await SELF.fetch('https://my.proxy');
		expect(res.status).toBe(400);
	});

	it('404 if space not found', async () => {
		const res = await SELF.fetch('https://my.proxy/JacobLinCool/404');
		expect(res.status).toBe(404);
	});

	it('404 if space not found', async () => {
		const res = await SELF.fetch('https://my.proxy/JacobLinCool/404');
		expect(res.status).toBe(404);
	});
});
