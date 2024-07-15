# Hugging Face Spaces Proxy

This is a reverse proxy server that allows you to access Gradio APIs on Hugging Face Spaces with pre-filled `HF_TOKEN`.

It can be useful if you want to let someone access your Gradio API without sharing the the private spaces repository.

> It currently does not work for spaces with multiple replicas. If you know how to stick one user to one replica, please let me know.

## Client Usage

```py
from gradio_client import Client

space = "gradio/hello_world"
client = Client(f"http://localhost:8787/{space}")
result = client.predict(name="Proxy", api_name="/predict")
print(result)
```

> Where `http://localhost:8787` is the URL of the Spaces Proxy and `gradio/hello_world` is the path of the space you want to access.

## Deployment

### Cloudflare Workers

It can be deployed as a Cloudflare Workers service.

```sh
pnpm run deploy
```

To set the `HF_TOKEN` environment variable, you can use the `wrangler secret` command or use the Cloudflare dashboard.

```sh
wrangler secret put HF_TOKEN
```

### Self-hosted

You can also deploy it as a docker container with [Selflare](https://github.com/JacobLinCool/selflare).

To build and run the container, you can use the following commands:

```sh
selflare compile
docker compose up
```

A pre-built image is also available on Docker Hub: [jacoblincool/hf-spaces-proxy](https://hub.docker.com/r/jacoblincool/hf-spaces-proxy).

The `HF_TOKEN` can be set through the `docker-compose.yml` file or any other method you prefer.
