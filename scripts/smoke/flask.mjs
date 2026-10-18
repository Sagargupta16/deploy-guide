// frameworks/flask.md, Option A (SQLAlchemy + Flask-Migrate) end to end on
// SQLite, plus the postgres:// rewrite that #50 fixed.
export default async function (t) {
   t.write("app.py");
   t.write("requirements.txt");
   t.venv();
   t.sh("pip install -r requirements.txt");
   t.env({ DATABASE_URL: "sqlite:///app.db" });
   t.runBlock("migrations");

   // A provider URL must reach SQLAlchemy as postgresql+psycopg, or SQLAlchemy
   // 2.0 imports psycopg2, which requirements.txt does not install.
   for (const url of ["postgresql://u:p@db.example.com/app", "postgres://u:p@db.example.com/app"]) {
      const out = t.python(`from app import app, db\nwith app.app_context(): print(db.engine.url.drivername)`, { DATABASE_URL: url });
      t.assert(out.trim() === "postgresql+psycopg", `${url.split(":")[0]}:// maps to ${out.trim()}`);
   }

   // Render's Start Command is gunicorn, which does not run on Windows.
   const api = await t.serve(t.WIN ? "flask --app app run --port $PORT" : "gunicorn app:app --bind 127.0.0.1:$PORT", "/health");
   await t.expect(api, { path: "/", json: { message: "Flask API is running" } });
   await t.expect(api, { path: "/health", json: { status: "ok" } });
   await t.expect(api, { method: "POST", path: "/api/items", body: {}, status: 400 });
   const item = await t.expect(api, { method: "POST", path: "/api/items", body: { name: "Smoke" }, status: 201, json: { name: "Smoke" } });
   await t.expect(api, { path: "/api/items", check: (d) => d.some((i) => i.id === item.id) });
   await t.expect(api, { method: "PUT", path: `/api/items/${item.id}`, body: { description: "edited" }, json: { description: "edited" } });
   await t.expect(api, { method: "DELETE", path: `/api/items/${item.id}`, json: { message: "Item deleted" } });
   await t.expect(api, { path: `/api/items/${item.id}`, method: "DELETE", status: 404 });
}
