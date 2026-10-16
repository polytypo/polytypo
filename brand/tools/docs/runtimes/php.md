---
title: PHP
description: Install polytypo with Composer, call Polytypo::transform and Polytypo::analyze with named arguments, catch PolytypoException codes, and see which modes PHP covers.
section: runtimes
order: 50
---

The PHP package is [`polytypo/polytypo`](https://packagist.org/packages/polytypo/polytypo) on Packagist; the source is in [polytypo/polytypo-php](https://github.com/polytypo/polytypo-php). It claims spec 1.8.0. The `text`, `html` and `yaml` modes are fully conformant. The `markdown` mode is not implemented for either dialect: `mode: 'markdown'` always raises `POLYTYPO_INVALID_DIALECT`, whatever `dialect` is given. `league/commonmark`, the standard PHP CommonMark library, reports no position data on inline text nodes, and the mode needs the exact source extent of every text span.

## Install

```bash
composer require polytypo/polytypo
```

## Calling it

`Polytypo::transform($input, $locale, ...)` is a static method. `$input` and `$locale` are positional and required; every later parameter is best passed as a named argument.

```php
use Polytypo\Polytypo;

$output = Polytypo::transform($input, 'de');

// html mode
Polytypo::transform($input, 'fr', mode: 'html');

// mode 'yaml' requires the keys whose values hold prose
Polytypo::transform($input, 'en-US', mode: 'yaml', keys: ['description']);

// switch one rule off, or switch ranges on
Polytypo::transform($input, 'en-US', rules: ['dashes' => false]);
Polytypo::transform($input, 'fr', mode: 'html', rules: ['ranges' => true]);
```

| Parameter | Notes |
| --- | --- |
| `$input` | The string to typeset. |
| `$locale` | Required. No fallback to English. |
| `mode:` | `'text'` (default), `'html'`, `'yaml'`. `'markdown'` raises `POLYTYPO_INVALID_DIALECT`. |
| `keys:` | Array of strings, required for `yaml`. |
| `rules:` | Array of rule id to bool. `ranges` is off unless `true`. |

The contract is on [Options](/docs/api/options/).

### Reporting without changing

`Polytypo::analyze($input, $locale, ...)` takes the same parameters and returns a list of `Polytypo\Change` objects (`ruleId`, `start`, `end`, `before`, `after`) with code-point offsets, not byte offsets. See [analyze](/docs/api/analyze/).

## Errors

Every failure is a `Polytypo\PolytypoException`. The stable code comes from `getErrorCode()`; branch on it, never on the message.

```php
use Polytypo\Polytypo;
use Polytypo\PolytypoException;

try {
    Polytypo::transform($input, 'xx');
} catch (PolytypoException $error) {
    $error->getErrorCode(); // 'POLYTYPO_UNKNOWN_LOCALE'
}
```

The eight codes are listed on [Error codes](/docs/api/errors/).

## Complete example

```php
<?php
require __DIR__ . '/vendor/autoload.php';

use Polytypo\Polytypo;
use Polytypo\PolytypoException;

$input = 'She said, "it\'s fine" -- but I wasn\'t sure...';

echo Polytypo::transform($input, 'en-US'), "\n";
// She said, “it’s fine”—but I wasn’t sure…

echo Polytypo::transform($input, 'de-DE'), "\n";
// She said, „it’s fine“ – but I wasn’t sure…

echo Polytypo::transform($input, 'en-US', rules: ['dashes' => false]), "\n";
// She said, “it’s fine” -- but I wasn’t sure…

try {
    Polytypo::transform($input, 'xx');
} catch (PolytypoException $error) {
    echo $error->getErrorCode(), "\n"; // POLYTYPO_UNKNOWN_LOCALE
}
```

The same call, measured:

```example
locale: de-DE
---
She said, "it's fine" -- but I wasn't sure...
```

`Polytypo::transform` is a pure static method; it keeps no mutable static state beyond memoised spec data, so it needs no synchronisation.

## Conformance

Spec 1.8.0. Modes: `text`, `html`, `yaml`. `markdown` is not implemented in either dialect. All nine rules. See [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).

## Related

- [JavaScript](/docs/runtimes/javascript/), [Python](/docs/runtimes/python/), [Go](/docs/runtimes/go/), [Ruby](/docs/runtimes/ruby/)
- [HTML mode](/docs/modes/html/)
- [YAML mode](/docs/modes/yaml/)
- [Error codes](/docs/api/errors/)

Conformance matrix: [spec/CONFORMANCE.md](https://github.com/polytypo/polytypo/blob/main/spec/CONFORMANCE.md).
