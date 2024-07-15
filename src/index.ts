const workerId = Math.floor(Math.random() * 10000);

const replicaCache: Record<string, [string, number]> = {};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.log(`WorkerId: ${workerId}`);

		try {
			const token = selectToken(request, env);
			const req = await createRequest(request, env, token);
			trackToken(env.WAE, token, req);

			const res = await makeRequest(req);
			return res;
		} catch (error) {
			if (error instanceof Response) {
				return error;
			}

			console.error('An unexpected error occurred:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;

function selectToken(request: Request, env: Env): string | undefined {
	const userHasToken = request.headers.has('Authorization');
	if (userHasToken) {
		console.log('Using user-provided token');
		return undefined;
	}

	const tokens = [env.HF_TOKEN, ...(env.HF_TOKENS || [])].filter(Boolean).sort(() => Math.random() - 0.5);
	const token = tokens[0];
	console.log(`Using token: ${token ? token.slice(0, 5) : 'none'}`);

	return token;
}

async function createRequest(request: Request, env: Env, token?: string): Promise<Request> {
	const url = new URL(request.url);
	const pathnames = url.pathname.split('/').filter(Boolean);

	if (pathnames.length < 2) {
		throw new Response('Invalid URL path. Expected a space name.', { status: 400 });
	}

	const [user, repo, ...restPath] = pathnames;
	const normalizedRepo = repo.replace(/[^a-zA-Z0-9-]/g, '-');
	const host = `${user}-${normalizedRepo}.hf.space`.toLowerCase();

	let replica: string | undefined;
	if (restPath[0] === '--replicas') {
		replica = restPath[1];
		restPath.splice(0, 2);
	} else {
		replica = env.DISABLE_REPLICA_RESOLVE ? undefined : await resolveReplica(user, repo);
	}

	const preservedPath = restPath.join('/');
	const targetUrl = new URL(replica ? `/--replicas/${replica}/${preservedPath}` : `/${preservedPath}`, `https://${host}`);
	targetUrl.search = url.search;
	console.log(`Accessing host: ${host}`);
	console.log(`Fetching URL: ${targetUrl.toString()}`);

	const req = new Request(targetUrl.toString(), request);
	if (token) {
		req.headers.set('Authorization', `Bearer ${token}`);
	}

	req.headers.set('Host', host);
	req.headers.set('X-Forwarded-Host', host);
	req.headers.set('X-Forwarded-Proto', url.protocol);

	return req;
}

async function makeRequest(req: Request): Promise<Response> {
	const res = await fetch(req);

	if (!res.ok) {
		console.error(`Fetch error: ${res.statusText}`);
		throw new Response(res.statusText, { status: res.status });
	}

	const headers = new Headers(res.headers);
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', '*');
	headers.set('Access-Control-Allow-Headers', '*');

	return new Response(res.body as never, {
		status: res.status,
		statusText: res.statusText,
		headers: headers,
	});
}

function trackToken(wae?: AnalyticsEngineDataset, token?: string, req?: Request): void {
	if (!wae || !token || !req) {
		return;
	}

	const host = new URL(req.url).host;
	const country = (req.cf?.country as string) || '';
	const city = (req.cf?.city as string) || '';
	const colo = (req.cf?.colo as string) || '';
	const type = req.headers.get('Accept') || '';

	wae.writeDataPoint({
		indexes: [token],
		blobs: [host, req.url, country, city, colo, type],
		doubles: [],
	});
}

async function readSSE(res: Response, event: string, count: number): Promise<string[]> {
	const reader = res.body?.getReader();
	if (!reader) {
		throw new Error('Response body is not readable');
	}

	const decoder = new TextDecoder();
	let eventCount = 0;
	const events: string[] = [];

	let line = '';
	let flag = false;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		const text = decoder.decode(value);
		line += text;
		if (!line.includes('\n')) {
			continue;
		}
		let [current, ...next] = line.split('\n');
		line = next.join('\n').trim();

		if (flag) {
			events.push(current.slice(6));
			flag = false;

			eventCount++;
			if (eventCount >= count) {
				break;
			}
		}
		if (current.startsWith(`event: ${event}`)) {
			flag = true;
		}
	}

	return events;
}

async function resolveReplica(user: string, repo: string): Promise<string | undefined> {
	try {
		const cacheKey = `${user}-${repo}`;
		const cached = replicaCache[cacheKey];
		if (cached && cached[1] > Date.now()) {
			cached[1] = Date.now() + 300_000;
			return cached[0];
		}

		const url = `https://api.hf.space/v1/${user}/${repo}/live-metrics/sse`;
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Failed to fetch replica: ${res.statusText}`);
		}

		const events = await readSSE(res as never, 'metric', 3);
		const metrics = events
			.map((event) => {
				try {
					return JSON.parse(event);
				} catch {
					return undefined;
				}
			})
			.filter(Boolean);
		const replica: string | undefined = metrics[Math.floor(Math.random() * metrics.length)].replica;
		if (!replica) {
			throw new Error('Replica not found in metrics');
		}
		console.log(`Selected replica: ${replica}`);

		replicaCache[cacheKey] = [replica, Date.now() + 300_000];
		return replica;
	} catch (e) {
		console.error(e);
		return undefined;
	}
}
