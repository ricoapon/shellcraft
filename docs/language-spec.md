# Shellcraft language specification

Draft v0.1.

## Execution

- The terminal and `.sc` scripts use the same language and commands.
- Statements execute sequentially. Newlines or `;` separate statements; `{ ... }` forms a block. Newlines inside parentheses, lists, and records are whitespace.
- A script executes its top-level statements. No entry function or export declaration is required. `$args` contains its arguments as `list<string>`.
- An uncaptured command result is displayed by the terminal, including inside blocks and scripts. Assignment, arguments, conditions, and `return` consume results without displaying them. `void` produces no display.
- Syntax and type checking complete before execution. Runtime errors stop execution; completed filesystem changes and submissions remain applied.
- Execution is synchronous and subject to game execution, memory, and output limits.

## Syntax and values

```text
# A comment
ls /notes
cat "/notes/access log.txt"
let files = (ls /notes)
let first = $files[0]
echo $first.path
```

- Names are case-sensitive. Variable, parameter, field, and type names match `[A-Za-z_][A-Za-z0-9_]*`; command names additionally permit `-` after the first character.
- `#` starts a comment outside strings. Keywords cannot be used as variable, parameter, type, or command names; they may be used as record field names.
- Command calls use `name argument ...`; built-in subcommands use fixed names such as `mission submit`.
- Value operations are ordinary commands available identically in the terminal and scripts: `contains "hello world" "world"`, `split "=" "password=secret"`. Dot notation accesses record fields only; method calls such as `$text.split("=")` are unsupported.
- In command arguments, bare words and paths are string literals. Numeric literals, `true`, `false`, `$variables`, lists, and records retain their types. Quote a word to force a string, such as `"true"`.
- Arguments are separated by whitespace. Parentheses group expressions and capture command results: `cat $file.path`, `echo ($count + 1)`, `let text = (cat /notes/access.txt)`.
- In expressions, strings must be quoted. Variables always use `$`; declarations omit it. There is no interpolation, glob expansion, or word splitting.
- Single-quoted strings are literal. Double-quoted strings support `\n`, `\r`, `\t`, `\"`, and `\\`; other escapes are errors. Literal newlines inside strings are disallowed.
- Lists use commas: `["a", "b"]`. Records use named fields: `{name: "note", active: true}`. Empty values are `[]` and `{}`. Trailing commas are permitted.

## Types

| Type              | Values                                               |
| ----------------- | ---------------------------------------------------- |
| `string`          | Unicode text                                         |
| `number`          | Finite IEEE 754 double-precision numbers             |
| `bool`            | `true` or `false`                                    |
| `list<T>`         | Ordered, homogeneous values                          |
| `{field: T, ...}` | Records with statically known fields                 |
| `void`            | No result; cannot be stored or passed as an argument |

Typing is static. Local declarations and loop variables infer their types; optional annotations must agree. Types never change through assignment. There are no implicit conversions, `any`, null values, classes, methods, inheritance, or user-defined generic types/functions.

```text
let path = "/notes"                 # string
let files: list<File> = (ls $path)
mut visited: list<string> = []
type Credential = {release: string, password: string}
```

- `let` declares an immutable binding; `mut` declares a reassignable binding. Both require initializers. Reassignment uses `$name = expression`.
- Lists and records are immutable values. Updating a collection means assigning a replacement value to a mutable binding.
- Empty lists require an expected element type from an annotation, argument, or return signature.
- Record compatibility is structural: every required field must exist with a compatible type; additional fields are allowed. `type Name = ...` declares a top-level alias.
- Blocks have lexical scope. Bindings/parameters, types, and commands have separate namespaces. Redeclaring or shadowing a visible name within a program is an error. A later terminal submission may replace a top-level binding, type alias, or function; existing functions are rechecked against replacement signatures.

## Expressions

| Precedence, highest first | Operators                 |
| ------------------------- | ------------------------- |
| Access                    | `$file.path`, `$files[0]` |
| Unary                     | `not`, `-`                |
| Multiplicative            | `*`, `/`, `%`             |
| Additive                  | `+`, `-`                  |
| Comparison                | `<`, `<=`, `>`, `>=`      |
| Equality                  | `==`, `!=`                |
| Boolean                   | `and`, then `or`          |

- Binary operators associate left to right. Comparison and equality operators cannot be chained without parentheses.
- Arithmetic accepts numbers; `+` also concatenates two strings. Comparisons accept numbers or strings of the same type; string ordering is lexicographic by Unicode code point.
- Equality compares same-type values structurally, including lists and records. Boolean operators require booleans; `and` and `or` short-circuit. There is no truthiness.
- List indexing is zero-based and requires an integer in range. Missing fields are type errors; invalid indices, division/remainder by zero, and nonfinite arithmetic results are runtime errors. Remainder has the dividend's sign.
- Arguments and operands evaluate left to right, except short-circuit operands that are skipped.

## Control flow

```text
if $file.type == "file" {
    echo $file.path
} else {
    echo "directory"
}

for file in (ls /notes) {
    echo $file.name
}

mut index = 0
while $index < 3 {
    echo $index
    $index = $index + 1
}
```

- `if` requires a boolean; `else if` and `else` are optional. Branches are statements, not value expressions.
- `for name in expression` iterates a list in order. The list expression is evaluated once; each iteration has a fresh immutable loop binding.
- `while expression` tests a boolean before each iteration.
- `break` exits the nearest loop; `continue` starts its next iteration.

## Functions and reuse

```text
def read-note [path: string] -> string {
    return (cat $path)
}

let text = (read-note /notes/access.txt)
```

- `def name [parameter: Type, ...] -> Type { ... }` defines a command. Parameters and return types are required; use `-> void` for procedures.
- Functions are top-level, may call each other recursively, and are visible throughout their source file. They access parameters, local variables, and other commands; they do not capture top-level variables or `$args`.
- Arguments are positional and required; defaults, variadic parameters, overloading, closures, and function values are unsupported for user functions.
- `return expression` exits with a value. Non-void functions must return their declared type on every path; loops are not assumed to execute or terminate. A void function may use bare `return` or reach its end. Bare `return` also stops a top-level script.
- `use /home/lib/tools.sc` imports another file's functions and type aliases. Library files contain only `use`, `type`, and `def` declarations. Imports are top-level literal paths, resolved relative to the importing file; terminal-relative imports resolve under `/home`.
- Imports are loaded once per execution. Circular imports, duplicate imported names, and replacement of built-in commands are errors.
- Terminal declarations remain available for the current session. Scripts receive fresh variable/function scopes; their declarations do not leak into the terminal. Neither scope is restored from saves.

## Nested calls

```text
contains (cat /notes/access.txt) "PASSWORD="
let fields = (split "=" (cat /notes/access.txt))
```

Parenthesized calls pass their typed result directly as an argument to the enclosing call. Inner results are not displayed, converted to terminal text, flattened, or implicitly iterated. A `void` result cannot be used as an argument. `echo` output is a display side effect and cannot be captured.

There is no pipe operator. Intermediate variables may replace nested calls without changing their meaning.

## Built-in commands

The signatures below use `?` for optional parameters and `T` for a built-in type parameter. These are signature notation, not user function syntax.

Only the listed built-in overloads exist. The compiler selects an overload from the static argument types; incompatible arguments are type errors. For `contains list<T> T`, the element type comes from the list. Players cannot add overloads or methods.

```text
type File = {name: string, path: string, type: string}
```

`File.type` is either `"file"` or `"directory"`; `File.path` is absolute on the current host.

| Signature                                                | Behavior                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwd -> string`                                          | Current directory.                                                                                                                                                               |
| `cd path: string -> void`                                | Change directory on the current host.                                                                                                                                            |
| `ls path?: string -> list<File>`                         | Immediate children, sorted by name; defaults to `"."`. Includes dotfiles. A file path returns a one-element list.                                                                |
| `cat path: string -> string`                             | Read a file's complete text.                                                                                                                                                     |
| `write path: string text: string -> void`                | Create or replace a writable file; parent must exist.                                                                                                                            |
| `mkdir path: string -> void`                             | Create one directory; parent must exist.                                                                                                                                         |
| `rm path: string -> void`                                | Remove one writable file; directories are rejected.                                                                                                                              |
| `split separator: string text: string -> list<string>`   | Split text by a nonempty literal separator; retain empty parts.                                                                                                                  |
| `join separator: string values: list<string> -> string`  | Join strings.                                                                                                                                                                    |
| `trim text: string -> string`                            | Remove leading/trailing Unicode whitespace.                                                                                                                                      |
| `replace old: string new: string text: string -> string` | Replace all non-overlapping literal occurrences; `old` must be nonempty.                                                                                                         |
| `slice start: number end: number text: string -> string` | Substring from inclusive `start` to exclusive `end`, measured in Unicode code points. Bounds must be integers with `0 <= start <= end <= count text`; otherwise a runtime error. |
| `match pattern: string text: string -> list<string>`     | Return full, non-overlapping regex matches in source order; no matches returns `[]`.                                                                                             |
| `contains value: string part: string -> bool`            | Test literal substring membership.                                                                                                                                               |
| `contains values: list<T> value: T -> bool`              | Test structural list membership.                                                                                                                                                 |
| `append values: list<T> value: T -> list<T>`             | Return a list with one additional element.                                                                                                                                       |
| `count value: string -> number`                          | Number of Unicode code points.                                                                                                                                                   |
| `count values: list<T> -> number`                        | Number of elements.                                                                                                                                                              |
| `echo value: T -> void`                                  | Display a value without changing its type or returning it.                                                                                                                       |
| `from-json<T> text: string -> T`                         | Parse and validate JSON against an explicit static type.                                                                                                                         |
| `hostname -> string`                                     | Current host ID.                                                                                                                                                                 |
| `neighbors host?: string -> list<string>`                | Discover adjacent host IDs, sorted lexicographically; defaults to current host.                                                                                                  |
| `ssh host: string -> void`                               | Connect to a discovered adjacent host.                                                                                                                                           |
| `exit -> void`                                           | Restore the preceding connection and its working directory.                                                                                                                      |
| `mission submit answer: string -> bool`                  | Check an answer; return success and award ordinary completion when correct.                                                                                                      |

### String and list operations

Literal string operations are case-sensitive. `contains` on a list uses the language's structural equality. String operations return new values and do not modify their inputs. There is no built-in `grep` or recursive search command.

```text
contains "hello world" "world"          # true
contains ["node-1", "node-2"] "node-1"  # true
let fields = (split "=" "password=secret")
let value = (trim $fields[1])
let numbers = (match '[0-9]+' "release=r42 build=17")
# numbers is ["42", "17"]
```

Regex patterns are strings. The engine is **RE2JS** (the installed version is pinned in `package-lock.json`), using [RE2 syntax](https://github.com/google/re2/wiki/Syntax); see the [RE2JS project](https://github.com/le0pard/re2js). Supported syntax includes literals, escaped metacharacters, `.`, character classes/ranges and negation, grouping `(...)`, alternation `|`, greedy repetition `?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}`, and anchors `^`/`$`. Matching is case-sensitive, leftmost-first; alternatives are tried in written order. `.` excludes LF by default; anchors refer to the complete input's start/end. Patterns expose full matches only, without capture-group results. RE2 lazy quantifiers and inline flags are supported. Lookaround and backreferences are unsupported by the engine.

Patterns are limited to 256 characters and inputs to 250,000 characters; results are limited to 10,000 matches. Invalid or unsupported patterns are runtime errors. After a zero-length match, matching advances by one Unicode code point; a match at the end is returned at most once. Regex execution is bounded by the game's execution limits. In particular, regex alternation inside a pattern string does not introduce a language pipe operator.

### Structured text

`from-json<T>` accepts primitive, list, and record types or their aliases. Malformed JSON, missing required fields, and incompatible values are runtime errors. Additional record fields are discarded. Null is rejected wherever a typed value is required. No numeric/string coercion occurs.

```text
type Release = {release: string}
let current = (from-json<Release> (cat /deploy/current.json))
echo $current.release
```

## Filesystems and networking

- Paths use `/`, with `.` and `..`; absolute paths begin at the current host's root. Traversing above root remains at root. There is no `~` expansion.
- Filesystem commands always use the current host. Level evidence is read-only; workspace files are writable.
- Each connection retains its working directory. A newly visited host starts at `/`. `ssh` pushes the current connection; `exit` pops it. At the level entry, `exit` is an error.
- `neighbors host` requires an already discovered, reachable host. Discovering a host does not connect to it. Network commands are available only in network levels.
- Home is outside every level network. `mission leave` returns to the workspace; `ssh home` cannot do so.
- A script begins with the caller's connection and directory. Navigation and completed game effects persist exactly as when entering the same statements interactively, including on failure.
- The execution environment owns variables, functions, output, limits, and a live command interface. The game environment owns missions, hosts, progression, and filesystem state. Starting or leaving a mission must not replace the running execution environment. Commands always resolve against the current game environment.
- A single script may start a mission, inspect its evidence, submit an answer, leave, and start another mission. Future progression commands, including purchasing upgrades if introduced, must use the same interface without interrupting the program. No final campaign-automation challenge is required by this specification.

## Script and workstation commands

- `run /home/tool.sc argument ...` executes a source file; arguments must be strings and populate `$args`. `run` returns `void`; use imported functions for returned values.
- `edit`, `vim`, `run`, and `use` resolve source files in the personal workspace, including while connected to a level. They do not redirect filesystem commands to home.
- `mission submit --script /home/solve.sc [seed]` verifies a script on fresh cases. Each case has fresh variables, navigation, and discoveries; the script must call `mission submit` successfully without intervention. Full verification may award the optional automation star; a supplied seed runs one practice case. Verification programs cannot start, reset, or leave missions; ordinary programs can.
- Mission selection, reset, briefing, status, hints, and leaving are available to scripts through the same commands as the terminal. Script verification, editor, clearing, and save commands are terminal-only; scripts cannot invoke them or `run`. These restrictions concern UI/reentrant operations, not campaign progression.
- `help` includes available built-ins and terminal-defined/imported functions with their signatures. `help <command>` shows detailed usage. Invalid native-command arguments include this detailed help with the error; static validation still prevents execution of invalid submissions. Availability rules apply equally to execution and help. Bare `save` shows the same help as `help save`. `save export`, `save import`, and `save reset` are terminal-only actions. Reset requires browser confirmation before permanently replacing files, progress, stars, and drafts with a fresh workstation.

## Diagnostics and editor support

- Highlight keywords, comments, literals, types, command/subcommand names, variables, fields, and operators in both terminal input and source files.
- Complete visible commands, subcommands, variables, types, record fields, valid arguments, and accessible paths. Host completion uses discovered IDs only; completion must not reveal undiscovered evidence or hosts.
- Hover shows inferred types and signatures. Function calls show parameter hints; references support go-to-definition and rename.
- Report syntax/type errors before execution with source, line, column, offending range, and expected versus actual types where applicable. Runtime errors include source location and function call stack.
- The initial language excludes exceptions, dynamic evaluation, external processes, real filesystem/network access, asynchronous operations, and general-purpose package imports.
