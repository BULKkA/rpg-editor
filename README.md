# RPG DB Editor

Веб-инструмент для редактирования квестов и диалогов в игровой SQLite базе данных.

## Возможности

- 📁 Загрузка/выгрузка `.db` файла прямо в браузере
- ⚔️ Редактор квестов — создание, шаги, переводы
- 💬 Редактор диалогов — ветки, варианты ответов, actions, условия
- 🗺 Визуальная схема веток диалога (SVG граф)
- 🌐 Табличный редактор всех переводов (inline editing)
- Поддержка нескольких языков (ru, en и другие)

## Запуск локально

```bash
npm install
npm start
# Открыть http://localhost:3000
```

## Деплой на CapRover

### Через tar-архив:
```bash
tar -czf rpg-editor.tar.gz --exclude=node_modules --exclude=.git .
```
Загрузить архив в CapRover → Method: Tarball.

### Через GitHub:
1. Запушить репозиторий
2. В CapRover: Deploy → GitHub/GitLab → указать репо

### Настройки CapRover:
- Container HTTP Port: `3000`
- Файл `captain-definition` уже настроен

## Структура БД

Инструмент работает с таблицами:
- `quests`, `quest_steps`, `quest_requirements`, `quest_rewards_flags`
- `dialogues`, `dialogue_choices`
- `translations`, `languages`
- `ui_texts`, `ui_translations`
- `story_flags`
