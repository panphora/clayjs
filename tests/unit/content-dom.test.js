import { createContentView } from '../../src/lib/content-dom.js'

test('content views exclude inherited editor UI and preserve live provenance', () => {
  document.body.innerHTML = `
    <main><i class="flag"></i><ul id="list">
      <li editor-ui>Add</li><li id="a">A</li><li id="b">B</li>
    </ul><p>after</p></main>`
  const list = document.getElementById('list')
  const view = createContentView(list)

  expect(view.text()).toBe('\n      AB\n    ')
  expect(view.query('li:last-child')).toEqual([document.getElementById('b')])
  expect(view.original(view.cloneOf(document.getElementById('b')))).toBe(document.getElementById('b'))
  expect(view.html()).not.toContain('Add')
})

test('content views copy current form state without mutating live DOM', () => {
  document.body.innerHTML = '<section><select><option>A</option><option>B</option></select><input value="old"><span editor-ui>Tools</span></section>'
  const section = document.querySelector('section')
  const select = section.querySelector('select')
  const input = section.querySelector('input')
  select.selectedIndex = 1
  input.value = 'current'
  const records = []
  const observer = new MutationObserver(batch => records.push(...batch))
  observer.observe(section, { subtree: true, childList: true, attributes: true, characterData: true })

  const view = createContentView(section)
  expect(view.cloneOf(select).selectedIndex).toBe(1)
  expect(view.cloneOf(input).value).toBe('current')
  expect(view.html()).not.toContain('Tools')
  expect(view.html()).toContain('<option>A</option>')
  expect(view.html()).not.toContain('<option value=')
  expect(observer.takeRecords()).toHaveLength(0)
  observer.disconnect()
})

test('filtered views reject stateful selectors', () => {
  document.body.innerHTML = '<main><button>Go</button><span editor-ui>Tools</span></main>'
  const view = createContentView(document.querySelector('main'))
  expect(() => view.query('button:focus')).toThrow(/do not support stateful selector/)
})
