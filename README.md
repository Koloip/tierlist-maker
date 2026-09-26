# Tier List Maker

A free, open-source tier list maker that runs entirely in your browser.
No image limit, no account, no uploads, and it works offline.

**[Русская версия ниже ↓](#русский)**

## Features

- **Tier list** in the familiar TierMaker style: row colors, labels, add, remove and reorder rows.
- **Handles hundreds of images.** Adjustable thumbnail size, a resizable unranked panel with search, and keyboard shortcuts for fast sorting.
- **Pairwise comparison mode.** Pick the better of two images again and again, and an Elo rating builds your personal ranking. You can stop at any time; progress is saved.
- **Results grid** sorted by rating, from your favourite down.
- **Export to PNG** for both the tier list and the ranking grid.
- **Private by design.** Images are stored in your browser (IndexedDB) and never leave your computer.
- **11 languages:** English, Русский, Українська, Deutsch, Français, Español, Português, Polski, Türkçe, 简体中文, 日本語.

## Usage

**Online:** https://koloip.github.io/tierlist-maker/

**Offline:** download the repository (`Code → Download ZIP`), unzip it and open `index.html` in Chrome, Edge or Firefox.

Then click **+ Folder** (or drag a folder of images onto the page). File names become image captions.

### Keyboard shortcuts

| Where | Key | Action |
|---|---|---|
| Tier list | `1`–`9` | Send the hovered or selected image(s) to that row |
| Tier list | `0` | Send back to Unranked |
| Tier list | Click / Shift+Click | Select / select a range |
| Tier list | Double-click | Send back to Unranked |
| Tier list | `Del` | Remove from the project |
| Tier list | `Esc` | Clear selection / exit presentation |
| Compare | `←` / `→` | Pick the left / right image |
| Compare | `↑` | Same |
| Compare | `↓` / `Space` | Skip |
| Compare | `Z` | Undo |

Shortcuts use physical key positions, so they work on any keyboard layout.

### Tips for large collections

1. Sort everything into rough tiers first. Hover and press a number; it's much faster than dragging.
2. In **Compare**, tick only the top tiers (for example S and A) so you don't have to compare everything with everything.
3. Use **Top only N** to refine the very top of your ranking.

## Hosting on GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

Optionally, set `REPO_URL` at the top of `app.js` to show a GitHub icon in the header.

## Adding a language

1. Open `i18n.js` and copy the `en` block.
2. Rename the key to the language code (for example `it`) and translate the values. Keep `{placeholders}` and `<b>` tags unchanged.
3. Open a pull request. The language is detected automatically from the browser and can also be picked in the header.

## Project structure

```
index.html   page layout
style.css    styles
app.js       all logic (tier list, drag & drop, Elo comparison, PNG export, storage)
i18n.js      translations
```

No build step and no dependencies.

## License

[MIT](LICENSE). Use it, fork it, change it.

---

## Русский

Бесплатный тир-лист мейкер с открытым кодом. Работает прямо в браузере: без ограничения на количество картинок, без регистрации и загрузки на сервер, даже без интернета.

**Возможности**

- Тир-лист как на TierMaker: цвета и названия рядов, добавление, удаление и перестановка рядов.
- Сотни картинок без проблем: размер миниатюр настраивается, есть поиск и горячие клавиши (навести и нажать `1`–`9`).
- **Режим попарного сравнения:** выбираешь, что нравится больше, из двух вариантов, и по рейтингу Эло строится твой личный топ. Остановиться можно в любой момент, прогресс сохраняется.
- Сетка результатов от самого любимого и ниже.
- Выгрузка тир-листа и рейтинга в PNG.
- Картинки хранятся только в твоём браузере и никуда не отправляются.
- 11 языков интерфейса.

**Как пользоваться:** открой https://koloip.github.io/tierlist-maker/ или скачай репозиторий и открой `index.html`. Нажми **«+ Папка»** или перетащи папку с картинками на страницу. Имена файлов станут подписями.

**Совет для больших коллекций:** сначала грубо раскидай всё по тирам, а потом в «Сравнении» отметь только верхние ряды (S и A). Так не придётся сравнивать всё со всем.

Лицензия [MIT](LICENSE).
