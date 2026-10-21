# Page tool artifacts

A `page-tool/1` result contains an artifact and initial JSON state. An artifact has exactly six string fields: `title`, `html`, `css`, `javascript`, `fallbackHtml`, and `summary`. Its encoded JSON must fit 24,576 bytes. State must be plain JSON and fit 8,192 bytes. The saved page uses `fallbackHtml`; generated JavaScript runs only in an open editor or reader.

The script defines `mount(tool)` and may return a cleanup function. `tool` supplies `root`, `mode`, `state`, `on("change", fn)`, `on("tables", fn)`, `table(id)`, `tables()`, and tracked `schedule(fn, ms)`. State paths are arrays. A reader gets a local state copy. CSS is scoped to the tool block. Tool code runs with page authority and is not a sandbox.

## Countdown

```json
{
  "title": "Countdown",
  "html": "<strong class=\"count\"></strong>",
  "css": ".count { font-size: 2rem; }",
  "javascript": "function mount(tool) { const count = tool.root.querySelector('.count'); const draw = () => { count.textContent = String(tool.state.data.remaining ?? 0); }; const tick = () => { tool.state.set(['remaining'], Math.max(0, (tool.state.data.remaining ?? 0) - 1)); draw(); if (tool.state.data.remaining > 0) tool.schedule(tick, 1000); }; draw(); if (tool.state.data.remaining > 0) tool.schedule(tick, 1000); return tool.on('change', draw); }",
  "fallbackHtml": "<p>Countdown</p>",
  "summary": "Shows a countdown from the stored remaining seconds."
}
```

## Tally

```json
{
  "title": "Tally",
  "html": "<button type=\"button\">Add one</button><output></output>",
  "css": "button, output { font-size: 1.5rem; }",
  "javascript": "function mount(tool) { const button = tool.root.querySelector('button'); const output = tool.root.querySelector('output'); const draw = () => { output.textContent = String(tool.state.data.count ?? 0); }; const click = () => tool.state.add(['count'], 1); button.addEventListener('click', click); const off = tool.on('change', draw); draw(); return () => { button.removeEventListener('click', click); off(); }; }",
  "fallbackHtml": "<p>Tally</p>",
  "summary": "Counts button presses with the live store add operation."
}
```

## Big number from a table

```json
{
  "title": "Big number",
  "html": "<output class=\"number\"></output>",
  "css": ".number { font-size: 3rem; }",
  "javascript": "function mount(tool) { const output = tool.root.querySelector('output'); const draw = () => { const table = tool.table('revenue'); const values = table?.rows?.map(row => Number(row.cells?.amount)).filter(Number.isFinite) ?? []; output.textContent = String(values.reduce((sum, value) => sum + value, 0)); }; const off = tool.on('tables', draw); draw(); return off; }",
  "fallbackHtml": "<p>Revenue total</p>",
  "summary": "Shows the sum of the amount column in the revenue table."
}
```
