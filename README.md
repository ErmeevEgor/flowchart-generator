# Schemes Generator

Самостоятельный генератор простых блок-схем бизнес-процессов без BPMN. Он превращает текст или готовую Process Model в детерминированный layout слева направо, прокладывает ортогональные стрелки, валидирует геометрию и экспортирует редактируемый `.drawio` и просматриваемый `.svg`.

## Быстрый старт

Требуется Node.js 20 или новее.

```powershell
npm install
npm test
npm run generate -- examples/linear.txt --out output --title "Обработка заявки"
```

Для сложного процесса с ветками и возвратами используйте явно проверенную Process Model:

```powershell
npm run generate -- examples/branching.json --out output --layout
npm run generate -- examples/return.json --out output --layout
```

Результат содержит:

- `<name>.json` — единственный источник бизнес-структуры;
- `<name>.drawio` — редактируемая схема для diagrams.net;
- `<name>.svg` — визуальный результат;
- `<name>.layout.json` — координаты и маршруты, только с флагом `--layout`.

## Формат простого текста

Каждая непустая строка — последовательный шаг. Поддерживаются маркеры `Начало:`, `Конец:`, `Условие:`, `Из процесса:` и `В процесс:`. Атрибуты действия задаются в конце строки:

```text
Создать заказ клиента [роль: Менеджер; система: 1С:ERP; документ: Заказ клиента]
```

Одно компактное ветвление можно записать так:

```text
Если товар есть на складе, то Передать заказ на склад, иначе Сформировать заказ поставщику
```

Многострочное ветвление и явно параллельные действия:

```text
Условие: Нужна дополнительная проверка
Да: Проверить оплату
Нет: Пропустить проверку
Продолжить обработку
Параллельно: Подготовить товар | Подготовить документы
```

Локальный парсер намеренно консервативен. Для неоднозначного естественного языка рекомендуется один внешний LLM-вызов через интерфейс `ProcessExtractor`, после которого весь layout, routing, validation и rendering выполняются без LLM. Координаты и стили в ответе extractor не принимаются.

```ts
import { parseProcessText } from "./src/parser/processParser.js";

const model = await parseProcessText(sourceText, {
  extractor: {
    async extract(text, instruction) {
      // Здесь ровно один вызов выбранного LLM со structured JSON output.
      return callYourLlmOnce({ text, instruction });
    },
  },
});
```

## Process Model

Поддерживаемые типы узлов: `start`, `end`, `action`, `decision`, `boundary`. Роль, система и документ являются атрибутами узла. Выходы `decision` обязаны иметь подписи.

```json
{
  "nodes": [
    { "id": "n1", "type": "start", "text": "Получена заявка" },
    { "id": "n2", "type": "decision", "text": "Товар есть на складе?" },
    { "id": "n3", "type": "end", "text": "Заказ передан" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "kind": "main" },
    { "from": "n2", "to": "n3", "label": "Да", "kind": "main" }
  ]
}
```

Для реального `decision` нужно минимум два подписанных исходящих маршрута. `kind: "main"` отмечает happy path, `alternative` — дополнительную ветку, `return` — возврат, `parallel` — явно указанную параллельную связь.

## Архитектура

```text
Text / JSON → Parser → Process Model → Layout → Router → Validator → draw.io / SVG
```

- `src/parser` ничего не знает о координатах;
- `src/model` содержит типы и runtime-проверку входного JSON;
- `src/layout` рассчитывает размеры, happy path, ранги и ветки;
- `src/routing` строит ортогональные маршруты и ищет пересечения;
- `src/validation` проверяет граф, блоки и соединители;
- `src/render` только сериализует уже готовый layout.

Все проходы используют исходный порядок узлов и рёбер, стабильные интервалы и не используют случайность.

## Режимы генерации

По умолчанию CLI создаёт одну схему:

```powershell
npm run generate -- process.json --mode process_only --out output
```

Для обзорной схемы и отдельных схем явно определённых подпроцессов передайте Process Bundle:

```powershell
npm run generate -- bundle.json --mode process_with_subprocesses --out output --name process-name
```

Bundle содержит `overview` и массив `subprocesses`. Каждый подпроцесс связывается с раскрываемым обзорным узлом через `overviewNodeId`. Если источник не содержит обоснованных границ подпроцессов, используйте `process_only`: генератор не создаёт такие границы самостоятельно.

## Самостоятельный Agent Skill

Исходник переносимого скилла находится в `portable-skills/process-flowchart-generator`. Он содержит собранный runtime без npm-зависимостей и не обращается к BPMN-проектам.

Сборка и проверка ZIP-релиза:

```powershell
python scripts/build_portable_skill.py
```

Готовый архив создаётся в `release/process-flowchart-generator-<version>.zip`.

### Установка скилла из GitHub

Клонируйте репозиторий и скопируйте целиком каталог:

```text
portable-skills/process-flowchart-generator
```

в каталог скиллов используемого агента:

- Codex: пользовательский каталог скиллов Codex;
- Claude Code: `~/.claude/skills/process-flowchart-generator`;
- OpenCode: `~/.config/opencode/skills/process-flowchart-generator`, `.opencode/skills/process-flowchart-generator` или `.agents/skills/process-flowchart-generator`.

Можно также скачать готовый ZIP из GitHub Releases. После распаковки проверьте пакет:

```powershell
python scripts/verify_package.py
```

Для работы генератора требуется Node.js 20 или новее. Python используется только для извлечения текста из документов и проверки пакета.
