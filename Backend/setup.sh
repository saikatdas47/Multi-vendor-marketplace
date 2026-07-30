#!/usr/bin/env bash
#
# CommerceX one-command setup. Safe to run repeatedly.
#
#   cd Backend && ./setup.sh
#
# It never overwrites an existing .env, never drops a database without asking,
# and stops at the first real error instead of cascading into confusing ones.

set -euo pipefail

# Resolve to the script's own directory, following the real on-disk path.
# macOS is case-insensitive, so `cd Backend` from inside Backend/ silently lands
# in Backend/backend/ (the settings package) while the prompt still reads
# "Backend". Anchoring here makes the script immune to that.
cd "$(cd "$(dirname "$0")" && pwd -P)"

[ -f manage.py ] || {
  printf '\033[31mERROR:\033[0m setup.sh must sit next to manage.py.\n' >&2
  printf 'Currently in: %s\n' "$PWD" >&2
  exit 1
}

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$OFF"; }
ok()   { printf '    %s✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$OFF" "$1"; }
die()  { printf '\n%sERROR:%s %s\n\n' "$RED" "$OFF" "$1" >&2; exit 1; }

DB_NAME_DEFAULT="commercex"
DB_USER_DEFAULT="postgres"
DB_PASS_DEFAULT="admin123"

# ---------------------------------------------------------------- 1. venv

step "Virtual environment"
if [ ! -d venv ]; then
  python3 -m venv venv
  ok "created venv/"
else
  ok "venv/ already exists"
fi

# shellcheck disable=SC1091
source venv/bin/activate
PY="$PWD/venv/bin/python"
[ -x "$PY" ] || die "venv/bin/python is missing. Delete venv/ and re-run."
ok "using $("$PY" --version)"

# ---------------------------------------------------------- 2. dependencies

step "Dependencies"
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install --quiet -r requirements.txt
ok "requirements.txt satisfied"

# ------------------------------------------------------------------ 3. .env

step "Environment file"
if [ -f .env ]; then
  ok ".env exists (left untouched)"
else
  warn ".env missing - creating one from .env.example"
  cp .env.example .env
fi

# Fill in any blank critical values without disturbing the rest of the file.
"$PY" - "$DB_NAME_DEFAULT" "$DB_USER_DEFAULT" "$DB_PASS_DEFAULT" <<'PYEOF'
import pathlib, re, secrets, string, sys

db_name, db_user, db_pass = sys.argv[1:4]
path = pathlib.Path('.env')
text = path.read_text()
changed = []

def current(key):
    m = re.search(rf'^{key}=(.*)$', text, flags=re.M)
    return m.group(1).strip() if m else None

def force(key, value, label):
    global text
    if re.search(rf'^{key}=', text, flags=re.M):
        text = re.sub(rf'^{key}=.*$', f'{key}={value}', text, flags=re.M)
    else:
        text += f'\n{key}={value}\n'
    changed.append(label)

if not current('SECRET_KEY'):
    alphabet = string.ascii_lowercase + string.digits + '!@#$%^&*(-_=+)'
    key = 'django-insecure-' + ''.join(secrets.choice(alphabet) for _ in range(50))
    force('SECRET_KEY', key, 'generated a new SECRET_KEY')

if not current('DB_NAME'):
    force('DB_NAME', db_name, f'set DB_NAME={db_name}')
if not current('DB_USER'):
    force('DB_USER', db_user, f'set DB_USER={db_user}')
if not current('DB_PASSWORD'):
    force('DB_PASSWORD', db_pass, 'set DB_PASSWORD')

# Strip anything that isn't a comment or KEY=value - pasted shell commands
# have ended up in here before and are silently ignored by dotenv.
lines, dropped = [], []
for line in text.split('\n'):
    s = line.strip()
    if s == '' or s.startswith('#') or re.match(r'^[A-Z_][A-Z0-9_]*=', s):
        lines.append(line)
    else:
        dropped.append(s)
if dropped:
    changed.append(f'removed {len(dropped)} stray non-config line(s)')
    text = '\n'.join(lines)

path.write_text(text.rstrip() + '\n')
for c in changed:
    print(f'    \033[33m!\033[0m {c}')
if not changed:
    print('    \033[32m✓\033[0m all required keys already present')
PYEOF

DB_NAME=$(grep -E '^DB_NAME=' .env | cut -d= -f2-)
DB_USER=$(grep -E '^DB_USER=' .env | cut -d= -f2-)
DB_PASS=$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2-)
ok "database target: ${DB_NAME} (user ${DB_USER})"

# -------------------------------------------------------------- 4. postgres

step "PostgreSQL"
command -v psql >/dev/null 2>&1 || die "psql not found. Install with: brew install postgresql@15"

if ! psql postgres -c '\q' >/dev/null 2>&1; then
  warn "postgres isn't accepting connections - trying to start it"
  brew services start postgresql@15 >/dev/null 2>&1 || true
  sleep 3
  psql postgres -c '\q' >/dev/null 2>&1 \
    || die "Cannot connect to PostgreSQL. Start it with: brew services start postgresql@15"
fi
ok "server is running"

# Make sure the role exists and its password matches .env, so Django can log in.
if psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  psql postgres -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
  ok "role '${DB_USER}' password synced with .env"
else
  psql postgres -c "CREATE ROLE ${DB_USER} WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '${DB_PASS}';" >/dev/null
  ok "role '${DB_USER}' created"
fi

if psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "database '${DB_NAME}' exists"
else
  psql postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
  ok "database '${DB_NAME}' created"
fi

# -------------------------------------------------------------- 5. migrate

step "Migrations"
CONNECTED=$("$PY" manage.py shell -c \
  "from django.db import connection; print(connection.settings_dict['NAME'])" 2>/dev/null | tail -1)
[ "$CONNECTED" = "$DB_NAME" ] \
  || die "Django is pointed at '${CONNECTED}', not '${DB_NAME}'. Check DB_NAME in .env."
ok "Django is connected to '${CONNECTED}'"

"$PY" manage.py makemigrations accounts products cart orders

if ! "$PY" manage.py migrate 2>&1 | tee /tmp/commercex-migrate.log; then
  if grep -q "InconsistentMigrationHistory" /tmp/commercex-migrate.log; then
    printf '\n%sThe database has migrations applied in an impossible order.%s\n' "$YELLOW" "$OFF"
    printf 'This happens when tables were created before AUTH_USER_MODEL was switched.\n'
    printf 'There is no data worth keeping in development, so the fix is to recreate it:\n\n'
    printf '  psql postgres -c "DROP DATABASE %s WITH (FORCE);"\n' "$DB_NAME"
    printf '  ./setup.sh\n\n'
    exit 1
  fi
  die "migrate failed - see the output above"
fi
ok "all migrations applied"

# ----------------------------------------------------------------- 6. seed

step "Demo data"
PRODUCTS=$("$PY" manage.py shell -c \
  "from products.models import Product; print(Product.objects.count())" 2>/dev/null | tail -1)
if [ "${PRODUCTS:-0}" -gt 0 ]; then
  ok "${PRODUCTS} products already present - skipping seed"
else
  "$PY" manage.py seed_demo
fi

# ---------------------------------------------------------------- 7. done

step "Ready"
cat <<EOF

    Backend      cd Backend && source venv/bin/activate && python manage.py runserver
    Frontend     cd Frontend/vite-project && npm install && npm run dev

    App          http://localhost:5173
    API docs     http://127.0.0.1:8000/api/docs/
    Django admin http://127.0.0.1:8000/admin/

    Logins (email, not username)
      admin      admin@commercex.test      Admin!2345
      seller     seller1@commercex.test    Seller!2345
      customer   customer1@commercex.test  Customer!2345

    Emails print to this terminal - no SMTP configured, which is fine.

EOF
