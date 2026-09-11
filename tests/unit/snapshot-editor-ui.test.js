import { captureSnapshot, onSnapshot } from '../../src/core/snapshot.js'

let observedText = null
let observedOriginal = null

onSnapshot(clone => {
  if (!clone.querySelector('#snapshot-editor-ui-fixture')) return
  const runtime = clone.ownerDocument.createElement('span')
  runtime.setAttribute('editor-ui', '')
  runtime.textContent = 'Add'
  clone.querySelector('#snapshot-editor-ui-fixture').appendChild(runtime)
})

onSnapshot((clone, { original }) => {
  const fixture = clone.querySelector('#snapshot-editor-ui-fixture')
  if (!fixture) return
  observedText = fixture.textContent
  observedOriginal = original(fixture.querySelector('input'))
})

test('every snapshot callback receives clean content and live provenance', () => {
  document.body.innerHTML = `
    <section id="snapshot-editor-ui-fixture">
      <input editor-ui value="runtime">
      <input id="authored" value="old">One<span>Two</span>
    </section>`
  const authored = document.getElementById('authored')
  authored.value = 'current'

  const clone = captureSnapshot({ flushUndo: false })

  expect(observedText.replace(/\s/g, '')).toBe('OneTwo')
  expect(observedOriginal).toBe(authored)
  expect(clone.querySelector('[editor-ui]')).toBeNull()
  expect(clone.querySelector('#authored').value).toBe('current')
})
