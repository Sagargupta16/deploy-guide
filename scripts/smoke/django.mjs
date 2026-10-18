// frameworks/django.md, Steps 1-4: scaffold, production settings, the items
// API, build.sh and render.yaml's start command, run with DEBUG off the way
// Render runs it.
export default async function (t) {
   t.write("requirements.txt");
   t.venv("3.14"); // render.yaml pins PYTHON_VERSION 3.14.x
   t.sh("pip install -r requirements.txt");
   t.runBlock("scaffold");
   t.write("config/settings.py");
   t.write("core/models.py");
   t.write("core/views.py");
   t.write("config/urls.py");
   t.runBlock("dirs");
   t.runBlock("makemigrations");
   t.write("build.sh");
   t.sh("bash build.sh");

   t.env({ DEBUG: "False", SECRET_KEY: "smoke-test-secret", ALLOWED_HOSTS: "127.0.0.1,localhost" });
   const cmd = t.WIN
      ? "python manage.py runserver 127.0.0.1:$PORT --noreload --insecure"
      : "gunicorn config.wsgi:application --bind 127.0.0.1:$PORT";
   // Render terminates TLS and forwards plain HTTP with X-Forwarded-Proto set.
   const https = { "x-forwarded-proto": "https" };
   const api = await t.serve(cmd, "/health/", https);

   await t.expect(api, { path: "/", headers: https, json: { message: "Django API is running" } });
   await t.expect(api, { path: "/health/", headers: https, json: { status: "ok" } });
   await t.expect(api, { method: "POST", path: "/api/items/create/", headers: https, body: {}, status: 400 });
   await t.expect(api, { method: "POST", path: "/api/items/create/", headers: https, body: { name: "Smoke" }, status: 201, json: { name: "Smoke" } });
   await t.expect(api, { path: "/api/items/", headers: https, check: (d) => d.some((i) => i.name === "Smoke") });
   // A request that really arrived over HTTP is still sent to HTTPS.
   await t.expect(api, { path: "/health/", status: 301 });
}
