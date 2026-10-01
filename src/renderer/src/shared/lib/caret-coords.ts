export type CaretCoordinates = { top: number; left: number; height: number; fontSize: number };

/**
 * The properties that we copy into a mirrored div.
 * Note that some browsers, such as Firefox, do not respect all of these.
 * Therefore, checking strict equality on these will not work.
 *
 * We copy all the properties that affect the line box layout.
 */
const properties = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',

  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',

  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',

  // https://developer.mozilla.org/en-US/docs/Web/CSS/font
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',

  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',

  'letterSpacing',
  'wordSpacing',

  'tabSize',
  'MozTabSize',
] as const;

const isBrowser = typeof window !== 'undefined';
const isFirefox = isBrowser && (window as Window & { mozInnerScreenX?: number }).mozInnerScreenX != null;

const signatureProperties = ['font', ...properties] as const;

let mirror: ReturnType<typeof createMirror> | null = null;
let cachedElement: HTMLTextAreaElement | null = null;
let cachedComputed: CSSStyleDeclaration | null = null;
let cachedStyleSignature = '';
let cachedValue = '';
let cachedPosition = -1;
let cachedCoordinates: CaretCoordinates | null = null;

// Font metrics can change without changing the computed font-family string.
if (isBrowser) {
  document.fonts?.addEventListener('loadingdone', () => {
    cachedCoordinates = null;
  });
}

function getStyleSignature(element: HTMLTextAreaElement, computed: CSSStyleDeclaration): string {
  const computedValues = computed as unknown as Record<string, string>;
  return [
    element.clientWidth,
    element.clientHeight,
    element.nodeName,
    ...signatureProperties.map(prop => computedValues[prop])
  ].join('|');
}

function createMirror(debug: boolean): {
  div: HTMLDivElement;
  prefix: Text;
  span: HTMLSpanElement;
  suffix: Text;
} {
  const div = document.createElement('div');
  if (debug) div.id = 'input-textarea-caret-position-mirror-div';

  const style = div.style;
  style.whiteSpace = 'pre-wrap';
  style.position = 'absolute';
  if (!debug) {
    style.visibility = 'hidden';
    // Persistent mirror is never removed; park it off-screen so it can't add
    // scrollable overflow to the page. offsets are relative to the div itself.
    style.top = '0';
    style.left = '-9999px';
  }

  const prefix = document.createTextNode('');
  const span = document.createElement('span');
  const suffix = document.createTextNode('');
  span.appendChild(suffix);
  div.append(prefix, span);
  document.body.appendChild(div);
  return { div, prefix, span, suffix };
}

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number, options?: { debug?: boolean }): CaretCoordinates {
  if (!isBrowser) {
    throw new Error('getCaretCoordinates should only be called in a browser context');
  }

  const debug = options && options.debug || false;
  if (debug) {
    const el = document.querySelector('#input-textarea-caret-position-mirror-div');
    if (el) el.parentNode?.removeChild(el);
  }

  // The mirror div will become a clone of the input element
  const currentMirror = debug ? createMirror(true) : (mirror ??= createMirror(false));
  const { div, prefix, span, suffix } = currentMirror;
  if (!div.isConnected) document.body.appendChild(div);

  const style = div.style;
  const computed = !debug && cachedElement === element && cachedComputed
    ? cachedComputed
    : window.getComputedStyle(element);
  const isInput = element.nodeName === 'INPUT';

  // Default textarea styles
  style.wordWrap = isInput ? '' : 'break-word'; // only for textarea-s

  const styleSignature = getStyleSignature(element, computed);
  const styleUnchanged = cachedElement === element && cachedStyleSignature === styleSignature;
  const value = element.value;
  if (!debug && styleUnchanged && cachedCoordinates && cachedValue === value && cachedPosition === position) {
    return { ...cachedCoordinates };
  }
  if (debug || !styleUnchanged) {
    const mirroredStyle = style as unknown as Record<string, string>;
    const sourceStyle = computed as unknown as Record<string, string>;
    // Transfer the element's properties to the div
    properties.forEach(prop => {
      if (isInput && prop === 'lineHeight') {
        // Special case for <input>s because text is rendered centered and line height may be scalabed.
        if (computed.boxSizing === "border-box") {
          const height = parseInt(computed.height);
          const outerHeight =
            parseInt(computed.paddingTop) +
            parseInt(computed.paddingBottom) +
            parseInt(computed.borderTopWidth) +
            parseInt(computed.borderBottomWidth);
          const targetHeight = outerHeight + parseInt(computed.lineHeight);

          if (height > targetHeight) {
            style.lineHeight = height - outerHeight + "px";
          } else if (height === targetHeight) {
            style.lineHeight = computed.lineHeight;
          } else {
            style.lineHeight = '0';
          }
        } else {
          style.lineHeight = computed.height;
        }
      } else {
        mirroredStyle[prop] = sourceStyle[prop];
      }
    });

    if (!debug) {
      cachedElement = element;
      cachedComputed = computed;
      cachedStyleSignature = styleSignature;
    }
  }

  if (isFirefox) {
    // Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
    if (element.scrollHeight > parseInt(computed.height))
      style.overflowY = 'scroll';
  } else {
    style.overflow = 'hidden'; // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
  }

  // The second special handling for input type="text" vs textarea:
  // spaces need to be replaced with non-breaking spaces - http://stackoverflow.com/a/13402035/1269037
  const beforeCaret = value.substring(0, position);
  const prefixValue = isInput ? beforeCaret.replace(/\s/g, '\u00a0') : beforeCaret;
  if (prefix.data !== prefixValue) prefix.data = prefixValue;
  // Wrapping must be replicated *exactly*, including when a long word gets onto the next line.
  // Overflows only happen in 'text-content', so if the last part is special (like a space)
  // we may need to put it into the span itself.
  const suffixValue = value.substring(position) || '.';  // || '.' because the very last character is a newline and span might collapse
  if (suffix.data !== suffixValue) suffix.data = suffixValue;

  const coordinates = {
    top: span.offsetTop + parseInt(computed['borderTopWidth']),
    left: span.offsetLeft + parseInt(computed['borderLeftWidth']),
    height: parseInt(computed['lineHeight']),
    fontSize: parseInt(computed['fontSize'])
  };

  if (debug) {
    span.style.backgroundColor = '#aaa';
  } else {
    cachedValue = value;
    cachedPosition = position;
    cachedCoordinates = { ...coordinates };
  }

  return coordinates;
}
