# Deploying CommerceX for free

Three services, no credit card, no expiry:

| Piece | Host | Free tier |
|---|---|---|
| Postgres | **Neon** | 0.5 GB, always-free, no pausing or trial expiry |
| Django API | **Render** | 750 hrs/month web service, 512 MB RAM |
| React app | **Vercel** (or Netlify / Cloudflare Pages) | static hosting, generous bandwidth |

Read section 5 before you send the link to anyone — there are two real
limitations and one of them is visible within seconds.

---

## 0. Why this combination

**Neon rather than Render's own Postgres.** Render's free database is
time-limited; Neon's free tier is permanent and scales to zero instead of being
deleted. A portfolio project that stops working after a month is worse than one
that was never deployed, because the dead link is on your CV.

**Render rather than Railway or Fly.** Railway's free allowance is a $5 trial
credit, not an ongoing tier, and Fly.io no longer offers a free tier to new
users. Render is the one with a genuinely permanent free web service.

**Vercel for the frontend, separate from the API.** A static bundle is served
from a CDN and never sleeps. Keeping it off Render means the page paints
instantly even while the API is waking up — which materially changes how the
first visit feels (see §5).

---

## 1. Database — Neon

1. Sign up at neon.tech, create a project called `commercex`.
2. Copy the connection string. It looks like:

   ```
   postgresql://commercex_owner:npg_xxx@ep-name-a1b2.us-east-2.aws.neon.tech/commercex?sslmode=require
   ```



Keep `?sslmode=require` on the end. Neon refuses connections without it, and
`settings.py` now passes query parameters through to the driver's `OPTIONS` for
exactly this reason.

You do **not** need to create tables — `build.sh` runs `migrate`.

---

## 2. API — Render

1. Push the repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Settings:

   | Field | Value |
   |---|---|
   | Root Directory | `Backend` |
   | Runtime | Python 3 |
   | Build Command | `./build.sh` |
   | Start Command | `gunicorn backend.wsgi:application --workers 2 --timeout 60` |
   | Instance Type | Free |
   | Health Check Path | `/health/` |

4. Add the environment variables in §4.
5. Deploy. First build takes ~3 minutes.

`render.yaml` in the repo root of `Backend/` describes the same thing as a
Blueprint, so the service can be recreated without repeating the clicks.

---

## 3. Frontend — Vercel

1. Vercel → **Add New → Project** → same repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Root Directory | `Frontend/vite-project` |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Environment variable:

   ```
   VITE_API_BASE_URL = https://commercex-api.onrender.com/api/v1
   ```

4. Deploy, then copy the resulting URL back into the API's `FRONTEND_URL` and
   `CORS_ALLOWED_ORIGINS` and redeploy the API. The two hosts have to know about
   each other; there is no way around doing this in two passes.

**`vercel.json` is not optional.** A React Router app serves every route from a
single `index.html`. Without the catch-all rewrite, only `/` works — opening
`/shops/voltedge` directly, or refreshing while on `/admin/sellers/1`, asks the
CDN for a file that does not exist and gets a 404. Equivalent configs are
included for Netlify (`netlify.toml`) and Cloudflare Pages (`public/_redirects`).

---

## 4. Environment variables

On **Render**:

| Variable | Value | Notes |
|---|---|---|
| `DEBUG` | `False` | turns on HSTS, SSL redirect and secure cookies |
| `SECRET_KEY` | generate one | `python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"` |
| `DATABASE_URL` | the Neon string | replaces the five `DB_*` variables |
| `ALLOWED_HOSTS` | `commercex-api.onrender.com` | no scheme, no trailing slash |
| `FRONTEND_URL` | `https://your-app.vercel.app` | |
| `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` | scheme required; also becomes `CSRF_TRUSTED_ORIGINS` |
| `SEED_DEMO` | `true` | populates the demo catalogue on every build |
| `GROQ_API_KEY` | your key | optional — the AI features degrade to plain search without it |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | Gmail app password | optional — blank prints emails to the log |

`DB_NAME` and `DB_USER` are `env_required` locally, but `DATABASE_URL` takes
priority and skips them, so you don't need to set them on Render.

On **Vercel**: `VITE_API_BASE_URL` only. Never put a secret in a `VITE_*`
variable — everything with that prefix is compiled into the JS bundle and is
readable by any visitor. The Groq key stays on the Django side, which is why AI
calls go through your own API rather than straight to Groq.

---

## 5. What is actually worse on the free tier

Two things, stated plainly because both will be noticed.

### Cold starts

A free Render service sleeps after ~15 minutes of inactivity. The next request
wakes it, which takes **roughly 50 seconds**. Someone opening your link cold sees
the page render immediately (Vercel never sleeps) and then skeletons that hang
for the better part of a minute.

Options, honestly ranked:

1. **Warm it before you share the link.** Open the site yourself a minute
   beforehand. Free, and enough for a scheduled demo.
2. **Ping it every 10 minutes** with a free cron service. This works, but it
   burns your 750 monthly hours in about 31 days — i.e. it is exactly enough for
   one service and nothing else.
3. **Accept it and say so.** A line in your README — "hosted on a free tier, the
   first request wakes the server" — reads as awareness, not as an excuse.
4. Pay ~$7/month for Render's Starter plan, which does not sleep.

### Uploaded images do not survive a redeploy

Free hosts have an ephemeral filesystem: everything written at runtime is
discarded on the next deploy. Render's persistent disks are a paid feature.

This project is unusually lucky here — the seeded product images are **generated
by Pillow at seed time** rather than committed, so `SEED_DEMO=true` regenerates
all 177 of them on every build. The demo catalogue always looks complete.

What does *not* survive: images a seller uploads through the dashboard. They work
until the next deploy, then 404.

If you want that fixed for free, **Cloudflare R2** has a permanent 10 GB tier
with zero egress fees. It needs `django-storages[s3]` and `boto3`, plus pointing
`STORAGES["default"]` at S3 — the setting is already structured for it:

```python
STORAGES = {
    "default": {"BACKEND": "storages.backends.s3.S3Storage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
```

I would not bother for a portfolio deploy. Generated seed images cover the demo,
and "media goes to object storage in production" is a sentence you can say in an
interview without having spent an evening on it.

---

## 6. First deploy checklist

```bash
# locally, before pushing
cd Backend && source venv/bin/activate
python manage.py check --deploy      # flags anything DEBUG=False would catch
python manage.py test                # all suites

cd ../Frontend/vite-project
npm run lint:all                     # oxlint + contrast + children + overrides
npm run build                        # the one thing CI cannot skip
```

After the API is live:

```bash
curl https://commercex-api.onrender.com/health/
curl https://commercex-api.onrender.com/api/v1/products/ | head -c 300
```

Then create your admin account — `seed_demo` makes one, but change the password:

```
Render → your service → Shell
python manage.py changepassword admin@commercex.test
```

---

## 7. Things that will bite you

**`ALLOWED_HOSTS` with a scheme.** `https://commercex-api.onrender.com` is wrong
and produces a confusing `DisallowedHost`. Host only.

**`CORS_ALLOWED_ORIGINS` without one.** The opposite rule — origins *must*
include `https://`. This one also feeds `CSRF_TRUSTED_ORIGINS`, so getting it
wrong breaks the Django admin login as well as the API.

**Trailing slash on `VITE_API_BASE_URL`.** `config.js` strips it, but only one.
`…/api/v1//` will produce doubled slashes in request paths.

**Forgetting the second API deploy.** You cannot set `CORS_ALLOWED_ORIGINS`
until Vercel has given you a URL, so the API must be redeployed after the
frontend exists. Symptom: the site loads but every request fails CORS.

**Migrations on a sleeping database.** Neon scales to zero after 5 minutes. The
first connection after that takes a few seconds and can look like a hang during
`migrate`. Wait it out.
