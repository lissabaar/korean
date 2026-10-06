# Vercel: как устроен деплой

Сайт: https://korean-drab.vercel.app — собирается из репозитория
github.com/lissabaar/korean, ветка `main`. Каждый `git push` в `main`
запускает новую сборку и выкладывает её сам.

## Переменные окружения

Vercel → проект → Settings → Environment Variables. Ключи живут только там и
в локальном `.env`, в репозиторий они не попадают. Список — в `.env.example`.

| Переменная | Заметка |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | строки Neon |
| `ANTHROPIC_API_KEY`, `KRDICT_API_KEY` | без них сборка не пройдёт |
| `BETTER_AUTH_SECRET` | тот же, что локально |
| `BETTER_AUTH_URL` | `https://korean-drab.vercel.app`, без слэша в конце |
| `UNLIMITED_AI_EMAILS` | почта владельца: ИИ без лимита |
| `FREE_AI_CREDITS`, `AI_DAILY_BUDGET_CREDITS` | необязательно (по умолчанию 50 и 300) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | необязательно: кнопка «Continue with Google» |

**После любого изменения переменных нужен Redeploy** (Deployments → три
точки у последней сборки → Redeploy): старая сборка продолжает работать со
старыми значениями.

## Регион

`vercel.json` ставит функции в `gru1` (Сан-Паулу), рядом с базой Neon.

## Тариф

Hobby: бесплатно, только личное некоммерческое использование. При
исчерпании лимитов сайт ставится на паузу, деньги не списываются.

## Известные грабли

- **Google после входа ведёт на localhost** — в Vercel `BETTER_AUTH_URL`
  был `http://localhost:3000`. Код теперь на продакшене берёт адрес у самого
  Vercel, но переменную всё равно держи `https://korean-drab.vercel.app`.
- **«Invalid origin» при входе и регистрации** — адрес сайта не совпал с
  `BETTER_AUTH_URL`. В `src/lib/auth.ts` теперь автоматически доверяются
  адреса Vercel, но переменную всё равно держи правильной.
- **Сайт не открывается на работе** — корпоративные сети иногда блокируют
  `*.vercel.app`; проверь с телефона через мобильную сеть.
- **Ошибка сборки про отсутствующий ключ** — `ANTHROPIC_API_KEY` или
  `KRDICT_API_KEY` не заданы в Vercel (код проверяет их при загрузке).

## Идея на потом

`npx plugins add vercel/vercel-plugin` — плагин для Claude Code с подсказками
по Vercel. Для работы сайта не нужен, не установлен.
