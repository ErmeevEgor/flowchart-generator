# Переносимость и запуск

Скилл самодостаточен относительно исходного проекта и BPMN-генераторов. В `runtime/` находится собранный JavaScript без сторонних runtime-пакетов.

## Требования

- Node.js 20 или новее — генерация и валидация схем.
- Python 3.9 или новее — только вспомогательное извлечение текста из документов.
- LibreOffice — опционально для старых файлов `.doc`.
- `pdftotext` — опционально для `.pdf`, если среда агента не умеет читать PDF самостоятельно.

## Установка

Распаковывай весь каталог `process-flowchart-generator`, сохраняя структуру файлов.

- Codex: пользовательский каталог скиллов Codex или каталог скиллов проекта.
- Claude Code: `~/.claude/skills/process-flowchart-generator/` либо `.claude/skills/process-flowchart-generator/`.
- OpenCode: `~/.config/opencode/skills/process-flowchart-generator/`, `.opencode/skills/process-flowchart-generator/`, `.claude/skills/process-flowchart-generator/` или `.agents/skills/process-flowchart-generator/`.

Автоматическое обнаружение зависит от хоста. Если хост не поддерживает Agent Skills, передай ему `SKILL.md` как инструкцию и предоставь доступ к каталогу скилла и терминалу.

## Проверка после распаковки

```text
python scripts/verify_package.py
```

Проверка запускает оба режима в изолированном временном каталоге. Для ручной проверки CLI:

```text
node runtime/app/cli.js --help
```

Обычная LLM без доступа к локальным файлам и выполнению команд не сможет использовать runtime, даже если понимает текст `SKILL.md`.

