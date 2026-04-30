# Wytyczne refaktoryzacji: Legacy JS → ES Modules

Po migracji na ES modules poniższe wzorce **nie powinny występować** w kodzie.

---

## ❌ Zabronione wzorce

### 1. Globalne zmienne i funkcje przez `window`
```js
// ❌
window.myFunction = function() { ... }
window.myData = { ... }

// ✅
export function myFunction() { ... }
export const myData = { ... }
```
> ES modules mają własny scope — `window` nie służy do współdzielenia kodu między plikami.

---

### 2. Inline event handlery w HTML (`onclick`, `onchange` itp.)
```html
<!-- ❌ -->
<button onclick="handleClick()">Kliknij</button>
<input onchange="handleChange()" />

<!-- ✅ -->
<button id="btn">Kliknij</button>
```
```js
document.getElementById('btn').addEventListener('click', handleClick)
```
> Inline handlery wymagają funkcji w globalnym scope — co jest sprzeczne z modułowym podejściem.

---

### 3. Sprawdzanie `=== 'function'` jako guard
```js
// ❌ Zbędne w kontrolowanym API
if (typeof myCallback === 'function') { myCallback() }

// ✅
myCallback?.()
```
> Jeśli masz kontrolę nad API, używaj optional chaining. `typeof === 'function'` zostawić tylko tam, gdzie callback pochodzi z zewnątrz (np. publiczne API biblioteki).

---

### 4. `var` zamiast `let` / `const`
```js
// ❌
var count = 0

// ✅
let count = 0
const NAME = 'app'
```

---

### 5. `require()` zamiast `import`
```js
// ❌
const utils = require('./utils')

// ✅
import { utils } from './utils.js'
```

---

### 6. IIFE jako substytut scope'u
```js
// ❌ Niepotrzebne — moduły mają własny scope
(function() {
  const x = 1
})()

// ✅ Po prostu kod na poziomie modułu
const x = 1
```

---

### 7. Tagi `<script>` bez `type="module"`
```html
<!-- ❌ -->
<script src="app.js"></script>

<!-- ✅ -->
<script type="module" src="app.js"></script>
```

---

## Szybka checklista przed commitem

- [ ] Brak `window.xxx =` poza uzasadnionymi wyjątkami
- [ ] Brak `onclick=`, `onchange=` i innych inline handlerów w HTML
- [ ] Brak `typeof x === 'function'` jako guardu wewnętrznego API
- [ ] Brak `var`
- [ ] Brak `require()`
- [ ] Brak IIFE bez wyraźnego powodu
- [ ] Wszystkie `<script>` mają `type="module"`
