import { createContentView } from '../../src/lib/content-dom.js'
import { hasCapability } from '../../src/lib/region-capabilities.js'

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

test('a region capability is read from the element below the root', () => {
  // The ancestor walk is not free, and importing is top-down: every ancestor between the
  // root and a node has already been asked. A node inside a region that excludes
  // something else entirely still has to answer for itself.
  document.body.innerHTML = '<main id="root"><section no-save><p id="keep">keep</p><p no-snapshot>drop</p></section></main>'
  const view = createContentView(document.getElementById('root'), { capability: 'snapshot' })

  expect(view.html()).toBe('<section no-save=""><p id="keep">keep</p></section>')
  expect(view.query('p')).toEqual([document.getElementById('keep')])
})

test('a descendant reads its own region marker the way hasCapability reads it', () => {
  // A `clay` token list is split on JS whitespace, which is not the same set a CSS `~=`
  // splits on. The own-element check for a descendant below the root has to agree with
  // hasCapability about the element it is standing on, not with the selector it spells.
  document.body.innerHTML = '<main id="root"><p id="keep">keep</p><p id="drop" clay="other editor-ui">drop</p></main>'
  const root = document.getElementById('root')
  const drop = document.getElementById('drop')
  const view = createContentView(root, { capability: 'snapshot' })

  expect(hasCapability(drop, 'snapshot')).toBe(true)
  expect(view.cloneOf(drop)).toBeNull()          // the own-element check excluded it
  expect(view.query('p')).toEqual([document.getElementById('keep')])
  expect(view.html()).toBe('<p id="keep">keep</p>')
})

test('an ancestor above the root still excludes the whole view', () => {
  // The one walk that cannot be skipped: nothing between the root and itself has been
  // checked, so the root asks about its ancestors. An editor-ui panel wrapping the
  // context excludes it, exactly as it did when every node walked.
  document.body.innerHTML = '<div editor-ui><main id="root"><p>text</p></main></div>'
  const view = createContentView(document.getElementById('root'), { capability: 'data' })

  expect(view.root).toBeNull()
  expect(view.html()).toBe('')
  expect(view.text()).toBe('')
})
