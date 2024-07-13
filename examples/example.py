from gradio_client import Client

space = "gradio/hello_world"
client = Client(f"http://localhost:8787/{space}")
result = client.predict(name="Proxy", api_name="/predict")
print(result)
