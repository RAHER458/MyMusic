# RH Social

RH Social — базовый аккаунтный слой социальной платформы.

## Что реализовано
- Регистрация по уникальному логину и паролю.
- Вход и выход из аккаунта.
- Личный профиль: отображаемое имя и описание «О себе».
- Пользователи и сессии хранятся в Cloudflare D1.
- Пароли хешируются PBKDF2-SHA-256 с индивидуальной солью; открытые пароли не сохраняются.
- Сессионный токен хранится в D1 только в виде SHA-256 хеша.

## Файлы
- `index.html` — сайт GitHub Pages.
- `worker.js` — Cloudflare Worker API.
- `schema.sql` — схема базы D1.

## Подключение Cloudflare
1. Cloudflare → Workers & Pages → D1 SQL Database → Create database. Назови базу `rh-social-db`.
2. Открой базу → Console. Вставь весь текст `schema.sql` и нажми Execute.
3. Workers & Pages → Create → Worker. Назови его `rh-social-auth`.
4. В Worker открой Settings → Bindings → Add → D1 database. Variable name: строго `DB`. Выбери базу `rh-social-db` и сохрани.
5. Открой Edit Code, замени код содержимым `worker.js`, нажми Deploy.
6. Открой адрес Worker вида `https://rh-social-auth.<твой-субдомен>.workers.dev`. Должен появиться JSON со статусом online.
7. В `index.html` найди `const API_BASE = "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE";` и замени значение на полный URL Worker без завершающего слеша. Сохрани файл в GitHub — Pages обновится автоматически.

## Важно
- Worker принимает запросы только с origin `https://raher458.github.io`.
- D1 binding должен называться строго `DB`.
- Вход ограничен 20 попытками с одного IP за 15 минут; регистрация — 5 попытками с одного IP за час. Счётчики хранятся в D1 в таблице `rate_limits`.
- Пока нет CAPTCHA, подтверждения почты, восстановления пароля, 2FA или админ-панели.
- Базовое хеширование паролей и случайные сессии всё равно используются. Не используй этот ранний вариант для важных или повторно используемых паролей.
