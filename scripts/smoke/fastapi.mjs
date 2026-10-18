// frameworks/fastapi.md, Steps 1 and 3: the starter app, the pinned
// requirements.txt and Render's start command.
export default async function (t) {
   t.write("main.py");
   t.write("requirements.txt");
   t.venv();
   t.sh("pip install -r requirements.txt"); // Render's Build Command

   const api = await t.serve("uvicorn main:app --host 127.0.0.1 --port $PORT", "/health");
   await t.expect(api, { path: "/", json: { message: "API is running" } });
   await t.expect(api, { path: "/health", json: { status: "ok" } });
   await t.expect(api, { path: "/api/items", check: (d) => Array.isArray(d) && d.length === 2 });
   await t.expect(api, { method: "POST", path: "/api/items", body: { name: "Smoke" }, json: { id: 3, name: "Smoke" } });
   await t.expect(api, { path: "/openapi.json", json: { info: { title: "My API" } } });
}
