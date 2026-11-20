# NexusLedger ERP

NexusLedger is an ERP for purchasing, inventory, sales orders, point of sale, returns, expenses, and accounting. The public marketing site is a Next.js app. Signed-in work happens under `/app`. The API is Django and Django REST Framework, with PostgreSQL and Redis.

## Top features

1. **Landed-cost procurement.** Purchase orders move from draft through approval and receipt. Freight, duty, handling, and insurance are allocated onto each received line, including foreign-currency supplier costs.
2. **FIFO inventory and available-to-promise.** Stock is kept by warehouse, batch, and cost layer. Sales orders and POS reserve units in one transaction so two channels cannot sell the same stock.
3. **Orders, POS, and returns.** Wholesale orders, counter sales, and returns share the same stock. Shipping consumes the oldest cost layers and can produce the invoice from that shipment.
4. **Automatic accounting.** Receipts, shipments, and payments post balanced journals for inventory, COGS, receivables, revenue, and tax. Posted journals stay linked to the source document.
5. **Role-based workspace.** Super Admin, Accountant, Warehouse Manager, and Sales Officer each see the modules their role allows. The sign-in page can open a temporary demo company and switch those roles.

## Download

```bash
git clone git@github.com:Tanjeem1/ERP-project.git nexusledger-erp
cd nexusledger-erp
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`. Open `.env` and replace `POSTGRES_PASSWORD` and `DJANGO_SECRET_KEY` before you start the stack.

You need Docker with Compose for the full stack, or, without Docker: Python 3.12, Node.js 22, PostgreSQL 16, and Redis 6.2 or newer.

## Run with Docker

This starts Postgres, PgBouncer, Redis, the API, the Celery worker and beat scheduler, the Next.js app, and Nginx.

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The API health check is [http://localhost:8080/api/health/](http://localhost:8080/api/health/).

Stop it with `docker compose down`. Database data stays in the `postgres-data` volume.

## Run on this machine without Docker

1. Create the database `nexusledger` and a user that can connect to it.
2. Start Redis on `127.0.0.1:6379`. Redis 5 is too old for the Celery worker; use 6.2 or newer.
3. Install and start the API:

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt
.venv\Scripts\python -m pip install "redis>=6.1,<8"
cd backend
set DJANGO_SETTINGS_MODULE=config.settings.local
set DATABASE_URL=postgresql://nexusledger:nexusledger@127.0.0.1:5432/nexusledger
set REDIS_URL=redis://127.0.0.1:6379/0
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

On macOS or Linux, activate the venv and `export` those three variables instead of `set`.

4. In a second terminal, from `backend`, with the same three variables set:

```bash
..\.venv\Scripts\celery -A config worker --loglevel=INFO --pool=solo --queues=default,documents,maintenance
```

Invoice PDFs and sandbox cleanup stay queued until this worker is running. `--pool=solo` is the Windows pool. On Linux or macOS you can omit it.

5. In a third terminal, from the project root:

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The browser talks to Next.js, and Next.js forwards `/api` to Django on port 8000. Check [http://127.0.0.1:8000/api/health/](http://127.0.0.1:8000/api/health/) if the app cannot reach the API. Both `postgres` and `redis` should be `true`.

`backend/requirements.txt` pins `redis==5.2.1`. Celery 5.4 needs `redis` 6.1 or newer, which is why the extra install is there.

## Use it

- The home page, pricing, platform, solutions, and tools pages are public. They do not require a login.
- [Register](http://127.0.0.1:3000/register) creates an organization and a Super Admin. [Sign in](http://127.0.0.1:3000/login) uses that email and password.
- **Explore the interactive demo** on the sign-in page opens a temporary sandbox company. You can switch roles inside that sandbox. It expires on its own.
- After sign-in, the workspace is under `/app`: Dashboard, Procurement, Inventory, Orders, Customers, Vendors, Returns, POS, Expenses, Finance, and Settings.
- Search in the app waits briefly before it calls the API. Money is stored as decimals. Posted journals are not edited in place.

API reference, when the API is running: [http://127.0.0.1:8000/api/schema/swagger-ui/](http://127.0.0.1:8000/api/schema/swagger-ui/) (Docker: [http://localhost:8080/api/schema/swagger-ui/](http://localhost:8080/api/schema/swagger-ui/)).
