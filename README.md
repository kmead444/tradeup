# TradeUp

TradeUp is a simple full-stack Node.js application. The backend is built with Express and stores data in a SQLite database using the [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) library. The frontend is a static site served from the `frontend` directory.

## Installing dependencies

```bash
npm install
```

This installs both runtime and development dependencies defined in `package.json`.

## Running the server

Start the API and static file server with:

```bash
npm start
```

By default the server listens on port **3000**. You can override the port by setting the `PORT` environment variable:

```bash
PORT=4000 npm start
```

The SQLite database file is stored at `data/tradeup.db`. To use a custom location, set the `DB_PATH` environment variable when starting the server:

```bash
DB_PATH=/path/to/tradeup.db npm start
```

## Building and watching CSS

The project uses Tailwind CSS and PostCSS. To generate the final stylesheet run:

```bash
npm run build:css
```

During development you can watch for changes and rebuild automatically:

```bash
npm run watch:css
```

Both commands read from `frontend/style.css` and output to `frontend/dist/style.css`.

## Project structure

- **backend** – Express server and API routes. The entry point is `backend/server.js`.
- **frontend** – Static HTML, CSS and client-side JavaScript served by the backend.

The database file is created inside the `data` directory the first time the server runs.

## Environment variables

- `PORT` – Port for the Express server (defaults to `3000`).
- `DB_PATH` – Path to the SQLite database file (defaults to `data/tradeup.db`).

