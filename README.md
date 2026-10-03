# Tier List Maker

A free, open-source tier list maker that runs entirely in your browser.
No image limit, no account, no uploads, and it works offline.

**[Русская версия ниже ↓](#русский)**

## Features

- **Tier list** in the familiar TierMaker style: row colors, labels, add, remove and reorder rows.
- **Handles hundreds of images.** Adjustable thumbnail size, a resizable unranked panel with search, and keyboard shortcuts for fast sorting.
- **Pairwise comparison mode.** Pick the better of two images again and again, and an Elo rating builds your personal ranking. You can stop at any time; progress is saved.
- **Results grid** sorted by rating, from your favourite down.
- **Wheel of fortune** with any number of your own images (each one fills its segment) and optional captions or text-only options. Adjustable spin time, tick sound, and an option to remove the winner after each spin.
- **Case opening** in the CS:GO style: a card strip with your images that slows down under the marker. Adjustable spin time, rarity colors per item and optional real CS:GO odds by rarity.
- **Put into tiers by rating:** one button turns the comparison results into a tier list, with an editable share for every row.
- **Several lists** (games, films, anime…), each with its own images, rows and ratings.
- **Save to file / open from file:** back up a list, move it to another computer or send it to a friend.
- **Undo / redo** (`Ctrl+Z` / `Ctrl+Y`) for everything you do with rows and images.
- **Works on phones:** tap to select and pick a row in the bottom bar, or hold an image and drag it.
- **Installable app (PWA):** install it from the browser menu and it opens in its own window, even offline.
- **Tournament:** a single-elimination bracket for 4–128 images (seeded by rating or at random), with a live bracket view, undo, a champion screen and the option to count every match in the rating.
- **Reveal:** a presentation for streams where the images appear one by one from the bottom row up.
- **Row templates** for a new list (S–D, S–F, 10–1, stars) and **drag rows by their label** to reorder them.
- **Magnifier:** rest the cursor on an image to see it big with its name and note.
- **Notes** on any image (when you played it, how many hours…) — shown in the magnifier and tooltip, searchable, saved in the file.
- **Live top 10** next to the comparison, updated after every pick.
- **Image card:** right-click an image (✎ on phones) to see it big, rename it, see its rating, move it or delete it.
- **Search across all rows**, sorting of Unranked (by name, rating, date added, random), **Ctrl+V** to paste screenshots, **Ctrl+A** to select all.
- **“Undo” right in the message** after resetting, clearing a row or putting images into tiers.
- **Drop history** for the wheel and the case, plus your own **background** and **win sound** for the case and particle bursts by rarity.
- **Export to PNG** for both the tier list and the ranking grid — optionally with a title, captions and Unranked, or **copy it to the clipboard** to paste into Discord.
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
| Tier list | `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| Tier list | `Ctrl+A` | Select everything in Unranked |
| Tier list | Right-click | Open the image card (rename, move, delete) |
| Anywhere | `Ctrl+V` | Paste images from the clipboard |
| Anywhere | `?` | Show all shortcuts |
| Compare | `←` / `→` | Pick the left / right image |
| Compare | `↑` | Same |
| Compare | `↓` / `Space` | Skip |
| Compare | `Z` | Undo |
| Wheel / Case | `Space` / `Enter` | Spin / open the case |
| Tournament | `←` / `→` | Pick the left / right image |
| Tournament | `Z` | Undo the last match |
| Reveal | `Space` / `→` / click, `←` | Show the next image / hide it again |

Shortcuts use physical key positions, so they work on any keyboard layout.

### Tips for large collections

1. Sort everything into rough tiers first. Hover and press a number; it's much faster than dragging.
2. In **Compare**, tick only the top tiers (for example S and A) so you don't have to compare everything with everything.
3. Use **Top only N** to refine the very top of your ranking.
4. In **Results**, click **Put into tiers** to turn the ranking into a tier list.

Your data lives only in this browser. Use **☰ → Save to file** now and then as a backup.

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
index.html             page layout
style.css              styles
app.js                 tier list, drag & drop, undo, lists, save/open file, Elo comparison, PNG export, storage
spin.js                wheel of fortune and case opening
tour.js                single-elimination tournament
i18n.js                translations
sw.js                  service worker: offline mode of the installed app
manifest.webmanifest   app name and icons for installing
icons/                 app icons
tools/build-standalone.ps1   builds the single-file tierlist-maker.html for releases
```

No build step and no dependencies. The single-file version for releases is made with
`powershell -File tools/build-standalone.ps1` and appears in `dist/`.

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
- **Колесо фортуны:** сколько угодно своих картинок (каждая растягивается на свой сектор), подписи по желанию или просто текстовые варианты. Настраиваемая длительность, звук, можно убирать выпавшее.
- **Открытие кейсов как в CS:GO:** лента со своими картинками, которая тормозит под маркером. Настраиваемая длительность прокрута, цвет редкости у каждого предмета и, по желанию, настоящие шансы CS:GO.
- **Разложить по тирам по рейтингу:** одна кнопка превращает результаты сравнения в тир-лист, долю каждого ряда можно настроить.
- **Несколько списков** (игры, фильмы, аниме…), у каждого свои картинки, ряды и рейтинг.
- **Сохранение в файл и открытие из файла:** резервная копия, перенос на другой компьютер, можно отправить другу.
- **Отмена и повтор** (`Ctrl+Z` / `Ctrl+Y`).
- **Работает на телефоне:** нажимаешь на картинки и выбираешь ряд на панели снизу или зажимаешь картинку и тащишь.
- **Можно установить как приложение:** откроется в отдельном окне и будет работать без интернета.
- **Турнир на выбывание** на 4–128 картинок: посев по рейтингу или случайный, наглядная сетка, отмена матча, экран чемпиона, матчи можно учитывать в рейтинге.
- **Раскрытие** — презентация для стримов: картинки появляются по одной, начиная с нижнего ряда.
- **Шаблоны рядов** для нового списка (S–D, S–F, 10–1, звёзды) и **перетаскивание рядов** за подпись.
- **Лупа:** задержи курсор на картинке — она покажется крупно с названием и заметкой.
- **Заметки** к картинкам (когда проходил, сколько часов…) — видны в лупе и подсказке, по ним работает поиск.
- **Живой топ-10** рядом со сравнением, обновляется после каждого выбора.
- **Карточка картинки:** правый клик (на телефоне ✎) — крупный просмотр, переименование, рейтинг, перенос, удаление.
- Поиск по всем рядам, сортировка нераспределённых, **Ctrl+V** вставляет скриншоты, **Ctrl+A** выделяет всё, **?** показывает все клавиши.
- Кнопка **«Отменить»** прямо в сообщении после сброса и раскладки.
- История выпадений в колесе и кейсе, свой фон и звук для кейса, частицы по редкости.
- Выгрузка тир-листа и рейтинга в PNG — с заголовком, подписями и нераспределёнными по желанию, или **копирование в буфер**, чтобы сразу вставить в Discord.
- Картинки хранятся только в твоём браузере и никуда не отправляются. Иногда делай **☰ → Сохранить в файл** как резервную копию.
- 11 языков интерфейса.

**Как пользоваться:** открой https://koloip.github.io/tierlist-maker/ или скачай репозиторий и открой `index.html`. Нажми **«+ Папка»** или перетащи папку с картинками на страницу. Имена файлов станут подписями.

**Совет для больших коллекций:** сначала грубо раскидай всё по тирам, а потом в «Сравнении» отметь только верхние ряды (S и A). Так не придётся сравнивать всё со всем.

Лицензия [MIT](LICENSE).
