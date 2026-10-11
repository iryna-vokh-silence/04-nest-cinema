# 04-nest-cinema — автентифікація та ролі в REST API кінотеатру (ДЗ 4)

**Студентка:** Вох Ірина (Iryna Vokh)

REST API кінотеатру (фільми, зали, сеанси, бронювання місць) на NestJS + PostgreSQL + TypeORM.
Стартова точка — код ДЗ 2 (реляційна гілка). У цій роботі з'явилися **користувачі**:
відвідувач реєструється, входить і бронює місця під своїм іменем; свої бронювання бачить і
скасовує, чужі — ні. Розкладом і довідниками керує лише адміністратор.

Що нового порівняно з ДЗ 2:

- таблиці `users` і `refresh_tokens`, колонка `bookings.user_id` — усе створюється **оборотними міграціями**;
- реєстрація з хешуванням пароля через **bcrypt**; `passwordHash` не потрапляє в жодну відповідь;
- вхід видає пару токенів: короткий **access JWT** (хвилини) і довгий **refresh-токен** (дні, випадковий рядок, не JWT);
- **ротація** refresh-токена одним запитом `DELETE ... RETURNING`; у базі лежить лише SHA-256-хеш токена;
- власний глобальний **guard автентифікації** (`CanActivate`, без Passport), окремий **guard ролей**,
  декоратори `@Public()`, `@Roles()` / `@Auth()` і параметр-декоратор `@CurrentUser()`;
- бронювання прив'язується до користувача з токена; `GET /bookings/my`; скасувати чуже бронювання → 403;
- Swagger: схема Bearer, відповіді 401/403; seed створює першого адміністратора.

## Стек

- Node.js 20+ (перевірено на Node 22), TypeScript, NestJS 11
- PostgreSQL 16 (Docker Compose), TypeORM 0.3 + `@nestjs/typeorm`, драйвер `pg`
- `@nestjs/jwt` (підпис і перевірка JWT), `bcrypt` (паролі), `node:crypto` (refresh-токени)
- `@nestjs/config` + `class-validator` — конфігурація з валідацією; `@nestjs/swagger` — документація
- Jest + Supertest — e2e-тести на справжній базі; ESLint + Prettier

## Запуск

```bash
# 1. Встановити залежності
npm install

# 2. Створити .env (приклад нижче) і за потреби змінити секрети
cp .env.example .env

# 3. Підняти PostgreSQL через Docker Compose
docker compose up -d

# 4. Застосувати міграції (створюють усі таблиці в порожній базі)
npm run migration:run

# 5. Засіяти базу: перший адміністратор + фільми, зали, сеанси, бронювання
npm run seed

# 6. Запустити в режимі розробки
npm run start:dev
```

API: <http://localhost:3000>, Swagger UI: <http://localhost:3000/docs>
(кнопка **Authorize** → вставити `accessToken` з `POST /auth/login`).

### Файл `.env`

Зразок — `.env.example` (значення секретів у ньому — **лише заглушки**, справжній `.env` у
репозиторій не потрапляє):

```env
# HTTP port of the API
PORT=3000

# PostgreSQL connection (docker-compose.yml uses the same values)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=cinema
DB_PASSWORD=cinema
DB_NAME=cinema

# Log SQL queries (true/false)
DB_LOGGING=false

# Database for e2e tests (created by docker/initdb/01-create-test-db.sh); it is wiped by the tests
DB_TEST_NAME=cinema_test

# ---------- Authentication (HW4) ----------
# Secret that signs access tokens (HS256), at least 32 characters.
# Generate your own: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_ACCESS_SECRET=change-me-to-a-long-random-secret-of-at-least-32-chars
# Access token lifetime in MINUTES (1..1440)
JWT_ACCESS_TTL_MINUTES=15
# Refresh token lifetime in DAYS (1..365)
REFRESH_TOKEN_TTL_DAYS=7
# bcrypt cost factor (4..15), optional, default 10
BCRYPT_SALT_ROUNDS=10

# First administrator, created by `npm run seed` (development only!)
ADMIN_EMAIL=admin@cinema.local
ADMIN_PASSWORD=change-me-admin-password
```

| Змінна | Обов'язкова | Опис |
|---|---|---|
| `PORT` | ні (3000) | порт HTTP-сервера |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | **так** | підключення до PostgreSQL |
| `DB_LOGGING` | ні (`false`) | логувати SQL-запити |
| `DB_TEST_NAME` | ні (`cinema_test`) | окрема база для e2e-тестів |
| `JWT_ACCESS_SECRET` | **так** | секрет підпису access-токена, ≥ 32 символів |
| `JWT_ACCESS_TTL_MINUTES` | **так** | час життя access-токена **в хвилинах** (1–1440) |
| `REFRESH_TOKEN_TTL_DAYS` | **так** | час життя refresh-токена **в днях** (1–365) |
| `BCRYPT_SALT_ROUNDS` | ні (10) | вартість bcrypt (4–15) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | для `npm run seed` | пошта й пароль першого адміністратора (пароль ≥ 8 символів) |

Усі змінні описані класом `EnvironmentVariables` (`src/config/env.validation.ts`) з декораторами
`class-validator` і перевіряються `ConfigModule.forRoot({ validate })` під час старту разом із рештою
конфігурації: без секрету, з коротким секретом чи з `JWT_ACCESS_TTL_MINUTES=15m` **застосунок не стартує**.
Сервіси беруть значення через `ConfigService`, а не з `process.env`.

### Усі команди

```bash
docker compose up -d          # підняти PostgreSQL
docker compose down           # зупинити (дані лишаються в томі pgdata)

npm run migration:run         # застосувати міграції
npm run migration:revert      # відкотити останню міграцію (метод down)
npm run migration:show        # список міграцій і їхній стан
npm run seed                  # адміністратор + тестові дані (повторний запуск не створює дублікатів)

npm run start:dev             # режим розробки
npm run build && npm run start:prod

npm test                      # unit-тести
npm run test:e2e              # e2e-тести (потрібна запущена база)
npm run lint                  # ESLint
npx prettier --check src test
```

## Перший адміністратор

Через API адміністратора створити неможливо: `POST /auth/register` завжди дає роль `user`
(поле `role` у тілі ігнорується). Перший адміністратор створюється **скриптом засівання**:

1. У `.env` задати `ADMIN_EMAIL` і `ADMIN_PASSWORD` (≥ 8 символів).
2. Виконати `npm run migration:run`, потім `npm run seed`.
3. Увійти: `POST /auth/login` з цими поштою й паролем — у токені буде `role: "admin"`.

Якщо користувач із такою поштою вже є (наприклад, зареєструвався через API), seed робить його
адміністратором, **пароль не змінює**. Повторний запуск нічого не дублює.

> **Увага:** значення `admin@cinema.local` / `change-me-admin-password` з `.env.example` — **лише для локальної
> розробки**. Для будь-якого спільного середовища задайте власний пароль і власний `JWT_ACCESS_SECRET`.

Альтернатива без seed (теж лише для розробки): зареєструватися через `POST /auth/register` і
підвищити роль у базі:

```bash
docker compose exec postgres psql -U cinema -d cinema \
  -c "UPDATE users SET role = 'admin' WHERE email = 'me@example.com';"
```

Нова роль потрапить у токен після наступного входу або `POST /auth/refresh`
(роль при оновленні береться з бази).

## Схема бази даних

Схема створюється **тільки міграціями** (`src/database/migrations`), `synchronize` вимкнено.
Кожна міграція оборотна (`down`), що перевіряє e2e-тест (усі `down` → порожня база → усі `up`).

| Міграція | Що робить |
|---|---|
| `1791700000000-InitialSchema` | таблиці ДЗ 2: `films`, `halls`, `showings`, `bookings`, `booking_seats` |
| `1791800000000-CreateUsersAndRefreshTokens` | таблиці `users` і `refresh_tokens` |
| `1791800000001-AddUserIdToBookings` | видаляє наявні бронювання (база розробки, у них немає власника) і додає `bookings.user_id NOT NULL` |

Нові таблиці (ДЗ 4):

| Таблиця | Колонки | Обмеження |
|---|---|---|
| `users` | `id uuid DEFAULT gen_random_uuid()`, `email varchar`, `password_hash varchar`, `role varchar DEFAULT 'user'`, `created_at timestamptz DEFAULT now()` | PK; `UNIQUE(email)`; `CHECK (role IN ('user','admin'))`; усі `NOT NULL` |
| `refresh_tokens` | `id uuid DEFAULT gen_random_uuid()`, `user_id uuid`, `token_hash varchar`, `expires_at timestamptz`, `created_at timestamptz DEFAULT now()` | PK; FK `user_id → users.id ON DELETE CASCADE`; `UNIQUE(token_hash)`; індекс на `user_id` |
| `bookings` (+ колонка) | `user_id uuid NOT NULL` | FK `→ users.id ON DELETE RESTRICT`; індекс на `user_id` |

Пошта зберігається обрізаною й у нижньому регістрі, тож `User@Mail.com` і `user@mail.com` — один
користувач. Один користувач може мати багато refresh-токенів (вхід із різних пристроїв).
Таблиці ДЗ 2 (`films`, `halls`, `showings`, `booking_seats`) не змінилися.

## Автентифікація

### Паролі

Пароль хешується **bcrypt** (`src/auth/password.ts`, вартість `BCRYPT_SALT_ROUNDS`) і зберігається
лише як `password_hash`. Сам пароль не логується, не повертається й не пишеться в базу.
Поле `passwordHash` сутності `User` позначене `@Exclude()`, а глобальний `ClassSerializerInterceptor`
серіалізує відповіді через `class-transformer`; тому сервіси повертають **екземпляри** `User`
(із `repository.save()` / `findOneBy()`), а не звичайні об'єкти.

При вході з незнайденою поштою пароль усе одно порівнюється з фіктивним bcrypt-хешем —
час відповіді не видає, які пошти зареєстровані. Повідомлення однакове: `Invalid email or password`.

### Токени

| | access-токен | refresh-токен |
|---|---|---|
| Формат | JWT (HS256), підписаний `JWT_ACCESS_SECRET` | випадковий рядок 256 біт (`randomBytes(32)`, base64url), **не JWT** |
| Вміст | `{ sub: <id користувача>, role, iat, exp }` | — |
| Час життя | `JWT_ACCESS_TTL_MINUTES` (хвилини) | `REFRESH_TOKEN_TTL_DAYS` (дні) |
| Де зберігається | ніде, сервер перевіряє підпис | у `refresh_tokens` як **SHA-256-хеш** (`node:crypto`) |

SHA-256 — детермінований, тож токен знаходиться звичайним `WHERE token_hash = $1`
(bcrypt давав би щоразу інший хеш). Витік бази не дає змоги увійти чужим токеном.

### Ротація refresh-токена

`POST /auth/refresh` споживає старий токен **одним запитом** (`AuthService.refresh`):

```sql
DELETE FROM "refresh_tokens"
WHERE "token_hash" = $1 AND "expires_at" > now()
RETURNING "user_id"
```

Порожній результат означає, що токен не існує, прострочений або вже використаний → 401.
Окремих «знайти» і «видалити» немає, тож два одночасні запити з тим самим токеном не можуть
обидва отримати нову пару (e2e-тест: 8 паралельних запитів → рівно один 200). Новий токен
вставляється в тій самій транзакції; роль для нового access-токена береться з бази.

`POST /auth/logout` так само одним `DELETE ... RETURNING` видаляє токен **лише поточного
користувача** (`WHERE token_hash = $1 AND user_id = $2`); чужий або неіснуючий токен → 404,
інші пристрої лишаються в системі.

### Guards і декоратори (`src/auth`)

- `JwtAuthGuard` — власний guard (`implements CanActivate`), зареєстрований **глобально** (`APP_GUARD`).
  Пропускає маршрути з `@Public()`. Інакше вимагає заголовок `Authorization: Bearer <accessToken>`,
  перевіряє підпис і строк дії (`JwtService.verifyAsync`, лише HS256) та вміст (`sub` — UUID,
  `role` — `user`/`admin`) і кладе `{ id, role }` у `request.user`. Відсутній заголовок, зіпсований
  формат, недійсний підпис, прострочений токен → **401**. Passport не використовується.
- `RolesGuard` — окремий глобальний guard, працює після першого: якщо маршрут має `@Roles(...)`,
  роль із токена має бути серед дозволених, інакше **403**.
- `@Auth()` / `@Auth(Role.Admin)` — композиція `@Roles` + Swagger (`@ApiBearerAuth`, 401, 403).
- `@CurrentUser()` / `@CurrentUser('id')` — параметр-декоратор, обробники не використовують `@Req()`.
- Перевірка **власника бронювання** — у `BookingsService.remove` (потрібен запит до бази), не в guard;
  адміністратор проходить її без обмежень.

## Маршрути та доступ

**Без токена:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
`GET /films`, `GET /films/:id`, `GET /halls`, `GET /halls/:id`,
`GET /showings`, `GET /showings/:id`, `GET /showings/:id/seats`.

**Тільки адміністратор** (без токена → 401, роль `user` → 403):
`POST /films`, `PATCH /films/:id`, `DELETE /films/:id`, `POST /halls`, `DELETE /halls/:id`,
`GET /bookings`, `POST /showings`, `GET /showings/:id/bookings`.

**Будь-який авторизований користувач** (без токена → 401):
`POST /showings/:id/bookings`, `DELETE /bookings/:id`, `GET /bookings/my`, `POST /auth/logout`, `GET /auth/me`.

| Метод | Шлях | Відповіді |
|---|---|---|
| POST | `/auth/register` `{ email, password }` | 201 `{ id, email, role: "user", createdAt }` · 400 (пошта, пароль < 8) · 409 (пошта зайнята) |
| POST | `/auth/login` `{ email, password }` | 200 `{ accessToken, refreshToken }` · 400 · 401 (однакове повідомлення) |
| POST | `/auth/refresh` `{ refreshToken }` | 200 нова пара · 400 · 401 (не знайдено / прострочений / використаний) |
| POST | `/auth/logout` `{ refreshToken }` | 204 · 400 · 401 · 404 (токен чужий або не існує) |
| GET | `/auth/me` | 200 `{ id, email, role, createdAt }` · 401 |
| POST | `/showings/:id/bookings` | 201 `{ id, showingId, userId, seats, totalPrice }` · 400 · 401 · 404 · 409 |
| DELETE | `/bookings/:id` | 204 · 400 · 401 · **403 (чуже бронювання)** · 404 |
| GET | `/bookings/my` | 200 масив власних бронювань із полем `showing` (`{ id, filmTitle, hallName, startsAt, price }`) · 401 |
| GET | `/bookings` | 200 усі бронювання (з `userId`) · 401 · 403 |

Бронювання створюється на користувача з токена; поле `userId` у тілі не приймається
(відкидається `ValidationPipe({ whitelist: true })`). Решта поведінки маршрутів — як у ДЗ 2
(пагінація `GET /showings`, транзакційне бронювання з 409, 409 при видаленні фільму/зали з сеансами,
єдиний формат помилок `{ statusCode, message, error, path, timestamp }`).

### Формат заголовка

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Swagger

`/docs` (JSON — `/docs-json`). У документі описана схема `bearer` (HTTP Bearer, JWT);
кожен захищений маршрут позначений замком і має відповідь **401**, а маршрути, де доступ
може бути заборонений роллю чи власником ресурсу (адміністраторські й `DELETE /bookings/:id`),
— відповідь **403**. Схема `User` не містить `passwordHash`. Повноту розмітки перевіряє e2e-тест,
що проходить по всіх операціях документа.

## Засівання бази

`src/seed.ts` (`npm run seed`) — на порожній базі після міграцій створює:
адміністратора з `ADMIN_EMAIL`/`ADMIN_PASSWORD` (пароль хешується bcrypt), 2 фільми, 2 зали,
4 сеанси в різні дати (15–18.01.2030) і одне бронювання (2 місця, власник — адміністратор).
Кожен запис спершу шукається за природним ключем, тому повторний запуск не створює дублікатів.

## Тести

```bash
docker compose up -d
npm run test:e2e
npm test
```

e2e-тести працюють зі **справжнім PostgreSQL** в окремій базі `DB_TEST_NAME` (за замовчуванням
`cinema_test`): `test/global-setup.ts` очищає її й будує схему міграціями, перед кожним тестом
таблиці очищаються. bcrypt у тестах працює з вартістю 4 (швидко).

- `test/app.e2e-spec.ts` — усі сценарії ДЗ 2 (маршрути, валідація, пагінація, транзакції, конкурентність,
  каскади, перезапуск застосунку) від імені адміністратора;
- `test/auth.e2e-spec.ts` — реєстрація (хеш bcrypt у базі, роль ігнорується, 400/409, без `passwordHash`),
  вхід (вміст і час життя JWT, однакові 401), refresh (ротація, SHA-256 у базі, повторне/прострочене/чуже
  використання, 8 паралельних refresh → один 200, роль із бази), logout (204, 404 для чужого токена,
  інші пристрої), `/auth/me` і 15 варіантів поганого заголовка (401), публічні маршрути без токена,
  кожен адміністраторський маршрут (401 / 403 / успіх), бронювання на користувача з токена,
  `GET /bookings/my`, 403 на чуже бронювання, адміністратор скасовує будь-яке, розмітка Swagger;
- `test/migrations.e2e-spec.ts` — типи колонок, обмеження, індекси, правила FK (у т.ч. нові),
  `CHECK` ролі, оборотність усіх міграцій, видалення старих бронювань міграцією, seed (адміністратор,
  ідемпотентність, підвищення наявного користувача без зміни пароля);
- unit: `src/config/env.validation.spec.ts` (валідація змінних, зокрема JWT і TTL).

## requests.http

`requests.http` у корені виконується **згори донизу** (VS Code, розширення REST Client):

1. вхід адміністратора (з seed), реєстрація двох користувачів, вхід, `/auth/me` та помилки 400/401/409;
2. фільм → зала → сеанс (адміністратор) → бронювання (користувач, `userId` у тілі ігнорується);
3. публічні маршрути без токена; маршрути користувача без токена (401);
4. кожен адміністраторський маршрут без токена (401) і з токеном користувача (403), потім від адміністратора;
5. чуже бронювання (403), адміністратор скасовує будь-яке, `GET /bookings/my`;
6. усі помилки валідації та 404/409 з ДЗ 2;
7. скасування власного бронювання; ротація refresh-токена (старий → 401); logout (401, 404 для
   чужого/неіснуючого токена, 204) і перевірка, що відкликаний токен більше не працює.

Токени й ідентифікатори підставляються зі змінних (`@userToken = {{loginUser.response.body.accessToken}}`),
біля кожного запиту є `# Expected: <код>`. Змінні `@adminEmail`/`@adminPassword` на початку файлу
мають збігатися з `ADMIN_EMAIL`/`ADMIN_PASSWORD` у `.env`.

## Структура

```
docker-compose.yml, docker/initdb/        # PostgreSQL + створення тестової бази
src/
  main.ts, app.module.ts, app.setup.ts    # bootstrap, ConfigModule, TypeORM, ClassSerializerInterceptor, Swagger (Bearer)
  config/env.validation.ts                # клас змінних оточення + validateEnv
  database/                               # опції підключення, data-source для CLI, міграції
  seed.ts                                 # npm run seed (адміністратор + дані)
  auth/
    auth.controller.ts, auth.service.ts   # register / login / refresh / logout / me
    guards/jwt-auth.guard.ts              # глобальний guard автентифікації (CanActivate)
    guards/roles.guard.ts                 # глобальний guard ролей
    decorators/                           # @Public, @Roles, @Auth, @CurrentUser
    entities/refresh-token.entity.ts      # refresh_tokens
    password.ts, refresh-token.util.ts    # bcrypt; генерація й SHA-256 refresh-токенів
  users/                                  # User, Role, UsersService
  common/                                 # фільтр винятків, ErrorResponseDto, Seat, валідатори
  films/ halls/ showings/ bookings/       # модулі ДЗ 2 (+ власник бронювання, GET /bookings/my)
test/
  app.e2e-spec.ts, auth.e2e-spec.ts, migrations.e2e-spec.ts
  app-factory.ts, db-utils.ts, global-setup.ts, test-env.ts
requests.http
```
