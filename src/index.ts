export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			const token = selectToken(request, env);
			const req = createRequest(request, token);
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

function createRequest(request: Request, token?: string): Request {
	const url = new URL(request.url);
	const pathnames = url.pathname.split('/').filter(Boolean);

	if (pathnames.length < 2) {
		throw new Response('Invalid URL path. Expected a space name.', { status: 400 });
	}

	const [user, repo, ...restPath] = pathnames;
	const normalizedRepo = repo.replace(/[^a-zA-Z0-9-]/g, '-');
	const host = `${user}-${normalizedRepo}.hf.space`;
	const preservedPath = restPath.join('/');
	const targetUrl = new URL(`/${preservedPath}`, `https://${host}`);
	targetUrl.search = url.search;
	console.log(`Accessing host: ${host}`);
	console.log(`Fetching URL: ${targetUrl.toString()}`);

	const req = new Request(targetUrl.toString(), request);
	if (token) {
		req.headers.set('Authorization', `Bearer ${token}`);
	}

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
	headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
