import { describe, expect, it } from 'vitest'
import {
  escapeXmlAttribute,
  escapeXmlText,
  xmlSelfClosingTag,
  xmlTag
} from '../xml'

describe('xml utils', () => {
  it('escapes XML text content', () => {
    expect(escapeXmlText('Tom & <skill> > prompt')).toBe(
      'Tom &amp; &lt;skill&gt; &gt; prompt'
    )
  })

  it('escapes XML attribute values for double-quoted attributes', () => {
    expect(escapeXmlAttribute('Tom & "quoted" <skill> > prompt')).toBe(
      'Tom &amp; &quot;quoted&quot; &lt;skill&gt; &gt; prompt'
    )
  })

  it('filters nullish self-closing tag attributes', () => {
    expect(xmlSelfClosingTag('skill', {
      name: 'frontend-design',
      path: undefined,
      source: null
    })).toBe('<skill name="frontend-design" />')
  })

  it('renders boolean and number self-closing tag attributes', () => {
    expect(xmlSelfClosingTag('tool', {
      loaded: true,
      priority: 2
    })).toBe('<tool loaded="true" priority="2" />')
  })

  it('escapes self-closing tag attribute values', () => {
    expect(xmlSelfClosingTag('skill', {
      name: 'front&end<design>"'
    })).toBe('<skill name="front&amp;end&lt;design&gt;&quot;" />')
  })

  it('keeps xmlTag content unchanged for caller-built XML fragments', () => {
    expect(xmlTag('loaded_skills_context', '<skill name="hunt" />')).toBe(
      '<loaded_skills_context><skill name="hunt" /></loaded_skills_context>'
    )
  })

  it('supports escaped text content through explicit escapeXmlText', () => {
    expect(xmlTag('instruction', escapeXmlText('Read <SKILL.md> & apply.'))).toBe(
      '<instruction>Read &lt;SKILL.md&gt; &amp; apply.</instruction>'
    )
  })
})
