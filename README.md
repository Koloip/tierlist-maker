# Tier List Maker

I wanted to rank every game in my Steam library, and TierMaker choked on a few hundred covers.
So this is my own tier list maker. It runs in the browser, keeps the pictures on your computer
and doesn't care how many you add.

Site: https://koloip.github.io/tierlist-maker/

[Русский ниже](#русский)

## What it does

- Tier list like on TierMaker: row colors and names, add, delete and move rows (arrows or drag the label).
- Hundreds of images are fine. Hover an image and press 1–9 to send it to a row, 0 to send it back.
- Compare: pick the better of two, again and again. An Elo rating builds your top list. You can stop any time.
- Results: everything sorted by rating. One button puts the ranking back into the rows.
- Tournament: single elimination for 4 to 128 images, with a bracket and an undo for the last match.
- Compare and Tournament can use the tier list or a separate set of pictures from files, with its own rating.
- Wheel and CS:GO-style case for "what do I play tonight". Own odds, rarity colors, own background and sound.
- Several lists (games, films…), saving a list to a file and opening it again.
- Image card on right-click: big preview, rename, note, rating.
- Export to PNG or copy the picture straight into Discord.
- Themes: dark, pro, light, pixel, neon. 11 languages.
- Works on phones and can be installed as an app.

## How to use

Open the site, or download `tierlist-maker.html` from Releases and open it with a double click.
Then press **+ Folder** or drop a folder of pictures onto the page. File names become captions.

By default the pictures are stored inside the browser. Clearing site data removes them,
so either save the list to a file now and then (☰ → Save to file), or in Chrome/Edge use
☰ → Storage → Keep in a folder. Then the list is written to an ordinary folder after every change,
and with "pictures only in the folder" the browser keeps no copy of them at all.

### Keys

| Where | Key | What |
|---|---|---|
| Tier list | 1–9 / 0 | Send hovered or selected images to a row / back |
| Tier list | Click, Shift+Click | Select, select a range |
| Tier list | Double-click | Send back to Unranked |
| Tier list | Right-click | Image card |
| Tier list | Del | Delete |
| Tier list | Ctrl+Z / Ctrl+Y | Undo / redo |
| Tier list | Ctrl+A | Select everything in Unranked |
| Anywhere | Ctrl+V | Paste images |
| Anywhere | ? | All keys |
| Compare, Tournament | ← / → | Left / right |
| Compare | ↑ / ↓ | Same / skip |
| Compare, Tournament | Z | Undo |
| Wheel, Case | Space | Spin / open |
| Reveal | Space, →, click / ← | Next image / back |

The keys go by position, so they work on any keyboard layout.

## For a big collection

Throw everything into rough rows first with the number keys. Then in Compare tick only S and A,
so you don't compare everything with everything. When you're done, Results → Put into tiers.

## Files

```
index.html    layout
style.css     styles and themes
app.js        tier list, lists, files, compare, export
spin.js       wheel and case
tour.js       tournament
folder.js     keeping a list in a folder, the Storage dialog
own.js        separate picture set for Compare and Tournament
i18n.js       translations
sw.js, manifest.webmanifest, icons/   installable app
tools/build-standalone.ps1            builds the one-file version for releases
```

No build step, no dependencies. To add a language, copy the `en` block in `i18n.js`
and translate it, keeping `{placeholders}` and `<b>` as they are.

MIT license.

If it saved you some time and you feel like it, you can support me on [Boosty](https://boosty.to/prfast/donate).

---

## Русский

Хотел расставить по тирам все игры из своей библиотеки Steam, а TierMaker не тянул несколько сотен обложек.
Поэтому сделал свой. Работает в браузере, картинки остаются у тебя на компьютере, ограничения на количество нет.

Сайт: https://koloip.github.io/tierlist-maker/

Что умеет:

- Тир-лист как на TierMaker: цвета и названия рядов, ряды можно добавлять, удалять и двигать.
- Сотни картинок без проблем. Наводишь на картинку и жмёшь 1–9, чтобы отправить в ряд, 0, чтобы вернуть.
- Сравнение: выбираешь лучшее из двух, по рейтингу Эло собирается твой топ. Остановиться можно когда угодно.
- Результаты: всё по рейтингу. Одной кнопкой можно разложить обратно по рядам.
- Турнир на выбывание от 4 до 128 картинок, с сеткой и отменой последнего матча.
- Сравнение и турнир можно делать по тир-листу или по отдельному набору картинок из файлов, со своим рейтингом.
- Колесо и кейс как в CS:GO, чтобы решить, во что играть вечером. Свои шансы, цвета редкости, свой фон и звук.
- Несколько списков, сохранение в файл и открытие из файла.
- Карточка картинки по правому клику: крупно, переименовать, заметка, рейтинг.
- Выгрузка в PNG или копирование картинки сразу в Discord.
- Темы: тёмная, строгая, светлая, пиксельная, неон. 11 языков.
- Работает на телефоне, можно установить как приложение.

Как пользоваться: открой сайт или скачай `tierlist-maker.html` из Releases и открой двойным кликом.
Нажми «+ Папка» или перетащи папку с картинками на страницу.

По умолчанию картинки хранятся внутри браузера. Если почистить данные сайта, они пропадут.
Поэтому либо иногда сохраняй список в файл (☰ → Сохранить в файл), либо в Chrome/Edge включи
☰ → Хранилище → Хранить в папке. Тогда список сам пишется в обычную папку после каждого изменения,
а с галочкой «только в папке» браузер вообще не держит копию картинок.

Если пригодилось и хочется сказать спасибо, можно поддержать на [Boosty](https://boosty.to/prfast/donate).
