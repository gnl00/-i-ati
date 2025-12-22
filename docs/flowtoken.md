================================================
FILE: README.md
===============

# FlowToken 🌊

### A smooth Animation Library for LLM Text Streaming

![flow token demo](https://nextjs-omega-five-46.vercel.app/demo.gif)

FlowToken is a React component library designed to enhance the visual presentation of text streaming from large language models (LLMs). This library offers a variety of animations that make the text appear smoothly and dynamically, providing an engaging user experience.

## Demo

Try the demo here: [Demo link](https://nextjs-omega-five-46.vercel.app/)

## Features

FlowToken includes several key features:

- **Customizable Animations:** A range of animations such as fade, blur-in, drop-in, slide from the left, typewriter effect, word pull-up, flip text, gradual spacing, and more.
- **Smooth Text Streaming:** Options to control the speed and manner of text appearance to handle the variability in text generation speed.
- **Responsive and Lightweight:** Optimized for performance and compatibility across all modern browsers.

## Installation

Install FlowToken using npm:

```bash
npm install flowtoken
```

Or using yarn:

```bash
yarn add flowtoken
```

## Usage

## Markdown Support

To use markdown, import the `AnimatedMarkdown` component.

```jsx
import React from 'react';

import { AnimatedMarkdown } from 'flowtoken';
// import the flowtoken css in order to use the animations
import 'flowtoken/dist/styles.css';

const App = () => {
  return (
    <AnimatedMarkdown
      content="## Hello, world!"
      animation="fadeIn"
      animationDuration="0.5s"
      animationTimingFunction="ease-in-out"
    />
  );
};

export default App;
```

### Real World with Vercel AI SDK

```jsx
'use client'

import { useChat } from 'ai/react'
import { AnimatedMarkdown } from 'flowtoken';
import 'flowtoken/dist/styles.css';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: <AnimatedMarkdown content={m.content}
            animation="dropIn"
            animationDuration="0.5s"
            animationTimingFunction="ease-in-out"
            />
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <label>
          Say something...
          <input
            value={input}
            onChange={handleInputChange}
          />
        </label>
      </form>
    </div>
  )
}
```

### Custom Components

You can use custom components by passing a `customComponents` prop to the `AnimatedMarkdown` component where the key is xml tag (ex. `MyComponent`) to match and the value is the component to render. Then just prompt your LLM to output the custom component syntax and it will be rendered with your custom component.

```jsx
const customComponents = {
  'customcomponent': ({ animateText, node, children, ...props }: any) => {
    return (
      <>
        {animateText(<div {...props}>{children}</div>)}
      </>
    )
  },
}
...
<AnimatedMarkdown content="Hello, world! <customcomponent>This is a custom component</customcomponent>" customComponents={customComponents} />
```

#### Example

This is an example of a custom component. `<ArticlePreview triggerText="Github" title="FlowToken" description="This is an example of a custom component." link="https://github.com/data-maki/flowtoken" />`

### AnimatedMarkdown Props

- **content** (string): The text to be displayed.
- **sep** (`"word"` | `"char"`): How to split and animate the content. Defaults to `"word"`.
- **animation** (string | `null`): Name of the CSS animation to apply (e.g. `fadeIn`, `dropIn`). Set to `null` to disable animations on completed messages.
- **animationDuration** (string): CSS duration of the animation (e.g. `0.6s`).
- **animationTimingFunction** (string): CSS timing function for the animation (e.g. `ease`, `ease-in-out`).
- **codeStyle** (object): The syntax-highlighter style object to use for code blocks.
- **customComponents** (Record<string, React.ComponentType>):Map of regex patterns or custom tag names to React components. Use this to render arbitrary LLM-emitted syntax.
- **imgHeight** (string): Default height for rendered images (e.g. `200px`).

## Animations

FlowToken supports various CSS animations:

- **fadeIn**
- **blurIn**
- **typewriter**
- **slideInFromLeft**
- **fadeAndScale**
- **rotateIn**
- **bounceIn**
- **elastic**
- **highlight**
- **blurAndSharpen**
- **dropIn**
- **slideUp**
- **wave**

For custom animations, define your keyframes in CSS wrap it in a class and pass the animation name to the `animation` prop.

```css
/* custom-styles.css */

@keyframes custom-animation {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.custom-animation {
  animation: custom-animation 1s ease-in-out;
}
```

```jsx
import 'custom-styles.css';
...
<AnimatedMarkdown content="Hello, world!" animation="custom-animation" />
```

### Notes

To lower the memory footprint, disable animations by setting the `animation` parameter to `null` on any completed messages.

If using tailwind with generated markdown, be sure to setup tailwind typography: [https://github.com/tailwindlabs/tailwindcss-typography](here)

and add `prose lg:prose-md prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent` to your flowtoken markdown container.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to suggest features or report bugs.

## License

FlowToken is MIT licensed.

================================================
FILE: eslint.config.js
======================

[Empty file]

================================================
FILE: package.json
==================

{
  "name": "flowtoken",
  "version": "1.0.35",
  "description": "",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc && cp src/*.css dist && rm -rf dist/stories && rm -rf dist/src",
    "lint": "eslint \"{**/*,*}.{js,ts,jsx,tsx}\"",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "keywords": [
    "ai",
    "generative ui",
    "flowtoken",
    "tokenflow",
    "ai react",
    "react ai library",
    "flowtoken ai",
    "tokenflow ai"
  ],
  "author": "ephibbs",
  "license": "ISC",
  "devDependencies": {
    "@chromatic-com/storybook": "^3.2.2",
    "@storybook/addon-essentials": "^8.4.1",
    "@storybook/addon-interactions": "^8.4.1",
    "@storybook/addon-links": "^8.4.1",
    "@storybook/addon-onboarding": "^8.4.1",
    "@storybook/addon-postcss": "^2.0.0",
    "@storybook/addon-styling-webpack": "^1.0.1",
    "@storybook/addon-webpack5-compiler-swc": "^1.0.5",
    "@storybook/blocks": "^8.4.1",
    "@storybook/react": "^8.4.1",
    "@storybook/react-webpack5": "^8.4.1",
    "@storybook/test": "^8.4.1",
    "@tailwindcss/typography": "^0.5.15",
    "@types/react": "^18.3.3",
    "@types/react-syntax-highlighter": "^15.5.0",
    "autoprefixer": "^10.4.20",
    "gh-pages": "^6.1.1",
    "postcss": "^8.4.47",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "storybook": "^8.4.1",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.5.3"
  },
  "dependencies": {
    "react-markdown": "^9.0.1",
    "react-syntax-highlighter": "^15.5.0",
    "regexp-tree": "^0.1.27",
    "rehype-raw": "^7.0.0",
    "remark-gfm": "^4.0.0"
  }
}

================================================
FILE: postcss.config.js
=======================

// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

================================================
FILE: tailwind.config.js
========================

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './stories/**/*.{js,ts,jsx,tsx,mdx}',
    './stories/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
};

================================================
FILE: tsconfig.json
===================

{
  "include": ["src"], /* Include only the src directory */
  "compilerOptions": {
    "target": "es2016" /* Set the JavaScript language version for emitted JavaScript and include compatible library declarations. */,
    "module": "commonjs" /* Specify what module code is generated. */,
    "declaration": true /* Generate .d.ts files from TypeScript and JavaScript files in your project. */,
    "outDir": "dist",
    "esModuleInterop": true /* Emit additional JavaScript to ease support for importing CommonJS modules. This enables 'allowSyntheticDefaultImports' for type compatibility. */,
    "forceConsistentCasingInFileNames": true /* Ensure that casing is correct in imports. */,
    "strict": true /* Enable all strict type-checking options. */,
    "skipLibCheck": true /* Skip type checking all .d.ts files. */,
    "jsx": "react" /* Specify what JSX code is generated. */,
  }
}

================================================
FILE: .eslintignore
===================

node_modules
dist

================================================
FILE: .eslintrc
===============

{
  "root": true,
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": [
    "@typescript-eslint",
    "react",
    "react-hooks"
  ],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-explicit-any": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  },
  "env": {
    "browser": true,
    "node": true
  },
  "globals": {
    "JSX": true
  }
}

================================================
FILE: .npmignore
================

# Logs

logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Diagnostic reports (https://nodejs.org/api/report.html)

report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json

# Runtime data

pids
*.pid
*.seed
*.pid.lock

# Directory for instrumented libs generated by jscoverage/JSCover

lib-cov

# Coverage directory used by tools like istanbul

coverage
*.lcov

# nyc test coverage

.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)

.grunt

# Bower dependency directory (https://bower.io/)

bower_components

# node-waf configuration

.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)

build/Release

# Dependency directories

node_modules/
jspm_packages/

# Snowpack dependency directory (https://snowpack.dev/)

web_modules/

# TypeScript cache

*.tsbuildinfo

# Optional npm cache directory

.npm

# Optional eslint cache

.eslintcache

# Optional stylelint cache

.stylelintcache

# Microbundle cache

.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history

.node_repl_history

# Output of 'npm pack'

*.tgz

# Yarn Integrity file

.yarn-integrity

# dotenv environment variables file

.env
.env.*
!.env.example

# parcel-bundler cache (https://parceljs.org/)

.cache
.parcel-cache

# Next.js build output

.next
out

# Nuxt.js build output

.nuxt
dist

# Remix build output

.cache/
build/
public/build/

# Docusaurus cache and generated files

.docusaurus

# Gatsby files

.cache/

# Comment in the public line in if your project uses Gatsby and not Next.js

# https://nextjs.org/blog/next-9-1#public-directory-support

# public

# vuepress build output

.vuepress/dist

# Serverless directories

.serverless/

# FuseBox cache

.fusebox/

# DynamoDB Local files

.dynamodb/

# TernJS port file

.tern-port

# Stores VSCode versions used for testing VSCode extensions

.vscode-test

# yarn v2

.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*

# Tests

test/
tests/
__tests__/
*.test.js
*.spec.js

# Config files

*.config.js
*.config.ts
*.config.mjs
*.config.cjs
tsconfig.json
jsconfig.json
.eslintrc.js
.prettierrc.js

# Source directory (if you compile to a different directory like 'dist' or 'lib')

# src/

# Build output (adjust if your output directory is different)

dist/
lib/
build/

# IDE/Editor specific

.vscode/
.idea/
*.sublime-project
*.sublime-workspace

# OS specific

.DS_Store
Thumbs.db

================================================
FILE: src/index.ts
==================

export {default as AnimatedMarkdown} from './components/AnimatedMarkdown';

================================================
FILE: src/styles.css
====================

@keyframes ft-fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes ft-blurIn {
    from {
        opacity: 0;
        filter: blur(5px);
    }
    to {
        opacity: 1;
        filter: blur(0px);
    }
}

@keyframes ft-typewriter {
  from {
    width: 0;
    overflow: hidden;
  }
  to {
    width: fit-content;
  }
}

@keyframes ft-slideInFromLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0%);
    opacity: 1;
  }
}

@keyframes ft-fadeAndScale {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes ft-colorTransition {
  from {
    color: red;
  }
  to {
    color: black;
  }
}

@keyframes ft-rotateIn {
  from {
    transform: rotate(-360deg);
    opacity: 0;
  }
  to {
    transform: rotate(0deg);
    opacity: 1;
  }
}

@keyframes ft-bounceIn {
  0%, 40%, 80%, 100% {
    transform: translateY(0);
  }
  20% {
    transform: translateY(-10%);
  }
  60% {
    transform: translateY(-5%);
  }
}

@keyframes ft-elastic {
  0%, 100% {
    transform: scale(1);
  }
  10% {
    transform: scale(1.2);
  }
}

@keyframes ft-highlight {
  from {
    background-color: yellow;
  }
  to {
    background-color: transparent;
  }
}

@keyframes ft-blurAndSharpen {
  from {
    filter: blur(5px);
    opacity: 0;
  }
  to {
    filter: blur(0);
    opacity: 1;
  }
}

@keyframes ft-dropIn {
  from {
    transform: translateY(-10%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes ft-slideUp {
  from {
    transform: translateY(10%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes ft-wave {
  from {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10%);
  }
  to {
    transform: translateY(0);
  }
}

:root {
  --ft-marker-animation: none;
}

.ft-custom-li::marker {
  animation: var(--ft-marker-animation);
}

.ft-code-block {
  animation: var(--ft-marker-animation);
}

================================================
FILE: src/components/AnimatedImage.tsx
======================================

import React from 'react';

interface AnimatedImageProps {
    src: string;
    alt: string;
    animation: string;
    animationDuration: string;
    animationTimingFunction: string;
    animationIterationCount: number;
    height?: string;  // Optional height prop
    width?: string;   // Optional width prop
    objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';  // Control how the image fits
}

const AnimatedImage: React.FC`<AnimatedImageProps>`  = ({
    src,
    alt,
    animation,
    animationDuration,
    animationTimingFunction,
    animationIterationCount,
    height,
    width,
    objectFit = 'contain'  // Default to 'contain' to maintain aspect ratio
}) => {
    const [isLoaded, setIsLoaded] = React.useState(false);

    // Base styles that apply both before and after loading
    const baseStyle = {
        height: height || 'auto',
        width: width || 'auto',
        objectFit: objectFit,  // This maintains aspect ratio
        maxWidth: '100%',      // Ensure image doesn't overflow container
    };

    const imageStyle = isLoaded ? {
        ...baseStyle,
        animationName: animation,
        animationDuration: animationDuration,
        animationTimingFunction: animationTimingFunction,
        animationIterationCount: animationIterationCount,
        whiteSpace: 'pre-wrap',
    } : {
        ...baseStyle,
        opacity: 0.0,  // Slightly transparent before loading
        backgroundColor: '#f0f0f0',  // Light gray background before loading
    };

    return (
        <img
            src={src}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
            style={imageStyle}
        />
    );
};

export default AnimatedImage;

================================================
FILE: src/components/AnimatedMarkdown.tsx
=========================================

'use client';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw';
import style from 'react-syntax-highlighter/dist/esm/styles/hljs/docco'
import TokenizedText from './SplitText';
import AnimatedImage from './AnimatedImage';
import { animations } from '../utils/animations';
import DefaultCode from './DefaultCode';

interface MarkdownAnimateTextProps {
    content: string;
    sep?: string;
    animation?: string;
    animationDuration?: string;
    animationTimingFunction?: string;
    codeStyle?: any;
    customComponents?: Record<string, any>;
    imgHeight?: string;
}

const MarkdownAnimateText: React.FC`<MarkdownAnimateTextProps>` = ({
    content,
    sep = "diff",
    animation: animationName = "fadeIn",
    animationDuration = "1s",
    animationTimingFunction = "ease-in-out",
    codeStyle=null,
    customComponents = {},
    imgHeight = '20rem'
}) => {
    const animation = animations[animationName as keyof typeof animations] || animationName;

    codeStyle = codeStyle || style.docco;
    const animationStyle: any
     = {
        'animation':`${animation} ${animationDuration} ${animationTimingFunction}`,
    };

    // Enhanced hidePartialCustomComponents function that also handles tag attributes
    const hidePartialCustomComponents = React.useCallback((input: string): React.ReactNode => {
        if (!input || Object.keys(customComponents).length === 0) return input;

    // Check for any opening tag without a closing '>'
        const lastOpeningBracketIndex = input.lastIndexOf('<');
        if (lastOpeningBracketIndex !== -1) {
            const textAfterLastOpeningBracket = input.substring(lastOpeningBracketIndex);

    // If there's no closing bracket, then it's potentially a partial tag
            if (!textAfterLastOpeningBracket.includes('>')) {
                // Check if it starts with any of our custom component names
                for (const tag of Object.keys(customComponents)) {
                    // Check if the text starts with the tag name (allowing for partial tag name)
                    // For example, '<Cus' would match a component named 'CustomTag'
                    if (textAfterLastOpeningBracket.substring(1).startsWith(tag.substring(0, textAfterLastOpeningBracket.length - 1)) ||
                        // Or it's a complete tag name followed by attributes
                        textAfterLastOpeningBracket.match(new RegExp(`^<${tag}(\\s|$)`))) {

    // Remove the partial tag
                        return input.substring(0, lastOpeningBracketIndex);
                    }
                }
            }
        }

    return input;
    }, [customComponents]);

    // Memoize animateText function to prevent recalculations if props do not change
    const animateText: (text: string | Array`<any>`) => React.ReactNode = React.useCallback((text: string | Array`<any>`) => {
        text = Array.isArray(text) ? text : [text];
        let keyCounter = 0;
        const processText: (input: any, keyPrefix?: string) => React.ReactNode = (input: any, keyPrefix: string = 'item') => {
            if (Array.isArray(input)) {
                // Process each element in the array
                return input.map((element, index) => (
                    <React.Fragment key={`${keyPrefix}-${index}`}>
                        {processText(element, `${keyPrefix}-${index}`)}
                    </React.Fragment>
                ));
            } else if (typeof input === 'string') {
                // if (!animation) return input;
                return <TokenizedText
                    key={`pcc-${keyCounter++}`}
                    input={hidePartialCustomComponents(input)}
                    sep={sep}
                    animation={animation}
                    animationDuration={animationDuration}
                    animationTimingFunction={animationTimingFunction}
                    animationIterationCount={1}
                />;
            } else {
                // Return non-string, non-element inputs unchanged (null, undefined, etc.)
                return <span key={`pcc-${keyCounter++}`} style={{
                        animationName: animation,
                        animationDuration,
                        animationTimingFunction,
                        animationIterationCount: 1,
                        whiteSpace: 'pre-wrap',
                        display: 'inline-block',
                    }}>
                        {input}
                    ;
            }
        };
        if (!animation) {
            return text;
        }
        return processText(text);
    }, [animation, animationDuration, animationTimingFunction, sep, hidePartialCustomComponents]);

    // Memoize components object to avoid redefining components unnecessarily
    const components: any
     = React.useMemo(() => ({
        text: ({ node, ...props }: any) => animateText(props.children),
         h1: ({ node, ...props }: any) => <h1 {...props}>{animateText(props.children)}`</h1>`,
         h2: ({ node, ...props }: any) => <h2 {...props}>{animateText(props.children)}`</h2>`,
         h3: ({ node, ...props }: any) => <h3 {...props}>{animateText(props.children)}`</h3>`,
         h4: ({ node, ...props }: any) => <h4 {...props}>{animateText(props.children)}`</h4>`,
         h5: ({ node, ...props }: any) => <h5 {...props}>{animateText(props.children)}`</h5>`,
         h6: ({ node, ...props }: any) => <h6 {...props}>{animateText(props.children)}`</h6>`,
         p: ({ node, ...props }: any) => <p {...props}>{animateText(props.children)}`</p>`,
         li: ({ node, ...props }: any) => <li {...props} className="custom-li" style={animationStyle}>{animateText(props.children)}`</li>`,
         a: ({ node, ...props }: any) => <a {...props} href={props.href} target="_blank" rel="noopener noreferrer">{animateText(props.children)}`</a>`,
         strong: ({ node, ...props }: any) => <strong {...props}>{animateText(props.children)}`</strong>`,
         em: ({ node, ...props }: any) => <em {...props}>{animateText(props.children)}`</em>`,
        code: ({ node, className, children, ...props }: any) => {
            return <DefaultCode
                node={node}
                className={className}
                style={animationStyle}
                codeStyle={codeStyle}
                animateText={animateText}
                animation={animation as string}
                animationDuration={animationDuration}
                animationTimingFunction={animationTimingFunction}
                {...props}
            >
                {children}
            `</DefaultCode>`;
        },
         hr: ({ node, ...props }: any) => <hr {...props} style={{
            animationName: animation,
            animationDuration,
            animationTimingFunction,
            animationIterationCount: 1,
            whiteSpace: 'pre-wrap',
        }} />,
        img: ({ node, ...props }: any) => <AnimatedImage src={props.src} height={imgHeight} alt={props.alt} animation={animation || ''} animationDuration={animationDuration} animationTimingFunction={animationTimingFunction} animationIterationCount={1} />,
        table: ({ node, ...props }: any) => <table {...props} style={animationStyle}>{props.children}`</table>`,
        tr: ({ node, ...props }: any) => <tr {...props}>{animateText(props.children)}`</tr>`,
        td: ({ node, ...props }: any) => <td {...props}>{animateText(props.children)}`</td>`,
        ...Object.entries(customComponents).reduce((acc, [key, value]) => {
            acc[key] = (elements: any) => value({...elements, animateText});
            return acc;
        }, {} as Record<string, (elements: any) => React.ReactNode>),
    }), [animateText, customComponents, animation, animationDuration, animationTimingFunction]);

    return <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}`</ReactMarkdown>`;
    };

export default MarkdownAnimateText;

================================================
FILE: src/components/AnimatedText.tsx
=====================================

import React, { useState, useEffect, useRef } from 'react';

interface StreamingFadeInTextProps {
    incomingText: string;  // Each new token received for display
    animation?: string;  // Animation name
    sep?: string;  // Token separator
}

const StreamingFadeInText: React.FC`<StreamingFadeInTextProps>` = ({ incomingText, animation="", sep="token" }) => {
    const [animatingTokens, setAnimatingTokens] = useState<{token: string, id: number}[]>([]);
    const [completedTokens, setCompletedTokens] = useState<string[]>([]);
    const lastTokenTime = useRef<number | null>(performance.now());
    const numId = useRef`<number>`(0);
    const receivedText = useRef`<string>`('');
    const animationDuration = '0.5s';
    const animationTimingFunction = 'ease-in-out';

    useEffect(() => {
        if (incomingText) {
            const textToSplit = incomingText.slice(receivedText.current.length);

    // Split the text and include spaces in the tokens list
            let newTokens: string[] = [];
            if (sep === 'token') {
                newTokens = textToSplit.split(/(\s+)/).filter(token => token.length > 0);
            } else if (sep === 'char') {
                newTokens = textToSplit.split('');
                // console.log('New tokens:', newTokens);
            } else {
                throw new Error('Invalid separator');
            }
            const newTokenObjects = newTokens.map(token => ({ token, id: numId.current++ }));
            if (newTokenObjects.length === 0) return;
            newTokenObjects.forEach((token, index) => {
                const delay = 10 - (performance.now() - (lastTokenTime.current || 0));
                lastTokenTime.current = Math.max(performance.now() + delay, lastTokenTime.current || 0);
                setTimeout(() => {
                    setAnimatingTokens(prev => [...prev, token]);
                }, delay);
            });
            // setAnimatingTokens(prev => [...prev, ...newTokenObjects]);
            receivedText.current = incomingText;
        }
    }, [incomingText]);

    // const handleAnimationEnd = (token?: string) => {
    //     console.log('Animation:', animatingTokens);
    //     setAnimatingTokens((prev) => {
    //         const prevToken = prev[0].token;
    //         console.log('Token:', prevToken);
    //         setCompletedTokens(prev => [...prev, prevToken]);
    //         return prev.slice(1);
    //     });
    // };

    return (`<div>`
            `<span
            >`{completedTokens.join('')}
            {animatingTokens.map(({token, id}) => {
                if (token === '\n') return `<br key={id} />`;

    return <span
                    key={id}
                    style={{
                        animationName: animation,
                        animationDuration: animationDuration,
                        animationTimingFunction: animationTimingFunction,
                        animationIterationCount: 1,
                        whiteSpace: 'pre',
                        display: 'inline-block',
                    }}
                    // onAnimationEnd={() => handleAnimationEnd(token)}
                >
                    {token}
              
            })}`</div>`
    );
};

export default StreamingFadeInText;

================================================
FILE: src/components/CodeRenderer.tsx
=====================================

import React from 'react';

interface CustomRendererProps {
    rows: any[];
    stylesheet: any;
    useInlineStyles: boolean;
}

// Not a react component, but returns a function that returns a react component to be used as a custom code renderer in the SyntaxHighlighter component
const customCodeRenderer = ({ animation, animationDuration, animationTimingFunction }: any) => {
    return ({rows, stylesheet, useInlineStyles}: CustomRendererProps) => rows.map((node, i) => (
        <div key={i} style={node.properties?.style || {}}>
            {node.children.map((token: any, key: string) => {
                // Extract and apply styles from the stylesheet if available and inline styles are used
                const tokenStyles = useInlineStyles && stylesheet ? { ...stylesheet[token?.properties?.className[1]], ...token.properties?.style } : token.properties?.style || {};
                return (
                    <span key={key} style={tokenStyles}>
                        {token.children && token.children[0].value.split(' ').map((word: string, index: number) => (
                            <span key={index} style={{
                                animationName: animation || '',
                                animationDuration,
                                animationTimingFunction,
                                animationIterationCount: 1,
                                whiteSpace: 'pre-wrap',
                                display: 'inline-block',
                            }}>
                                {word + (index < token.children[0].value.split(' ').length - 1 ? ' ' : '')}
                          
                        ))}
                  
                );
            })}
        `</div>`
    ));
};

export default customCodeRenderer;

================================================
FILE: src/components/DefaultCode.tsx
====================================

'use client';
import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import customCodeRenderer from './CodeRenderer'; // Assuming CodeRenderer is in the same directory or adjust path

interface DefaultCodeProps {
    node: any;
    className?: string;
    children: React.ReactNode & React.ReactNode[];
    style?: React.CSSProperties; // For animationStyle
    codeStyle?: any;
    animateText: (text: any) => React.ReactNode;
    animation?: string;
    animationDuration?: string;
    animationTimingFunction?: string;
}

const DefaultCode: React.FC`<DefaultCodeProps>` = ({
    node,
    className,
    children,
    style,
    codeStyle,
    animateText,
    animation,
    animationDuration,
    animationTimingFunction,
    ...props
}) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        // Ensure children is a string for navigator.clipboard.writeText
        const textToCopy = Array.isArray(children) ? children.join('') : String(children);
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!className || !className.startsWith("language-")) {
        return <code {...props}>
            {animateText(children)}`</code>`;
    }

    return <div {...props} style={style} className={`relative`}>
        <button
            onClick={handleCopy}
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                zIndex: 10,
                opacity: 0.7,
                cursor: 'pointer',
                borderRadius: '0.5rem',
                padding: '0.25rem 0.25rem',
                color: 'white',
            }}
            aria-label={copied ? 'Copied!' : 'Copy code'}
        >
            {copied ? (
                `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">`
                    `<path d="M20 6L9 17l-5-5" />`
                `</svg>`
            ) : (
                `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">`
                    `<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />`
                    `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`
                `</svg>`
            )}
        `</button>`
        <SyntaxHighlighter
            style={codeStyle}
            language={className?.substring(9).trim() || ''}
            renderer={customCodeRenderer({ animation, animationDuration, animationTimingFunction })}
        >
            {String(children) /* Ensure children is string for SyntaxHighlighter */}
        `</SyntaxHighlighter>`
    `</div>`;
};

export default DefaultCode;

================================================
FILE: src/components/SplitText.tsx
==================================

import React, { useRef, useEffect, ReactElement } from 'react';

interface TokenWithSource {
  text: string;
  source: number;
}

type TokenType = string | TokenWithSource | ReactElement;

const TokenizedText = ({ input, sep, animation, animationDuration, animationTimingFunction, animationIterationCount }: any) => {
    // Track previous input to detect changes
    const prevInputRef = useRef`<string>`('');
    // Track tokens with their source for proper keying in diff mode
    const tokensWithSources = useRef<TokenWithSource[]>([]);

    // For detecting and handling duplicated content
    const fullTextRef = useRef`<string>`('');

    const tokens = React.useMemo(() => {
        if (React.isValidElement(input)) return [input];

    if (typeof input !== 'string') return null;

    // For diff mode, we need to handle things differently
        if (sep === 'diff') {
            // If this is the first render or we've gone backward, reset everything
            if (!prevInputRef.current || input.length < prevInputRef.current.length) {
                tokensWithSources.current = [];
                fullTextRef.current = '';
            }

    // Only process input if it's different from previous
            if (input !== prevInputRef.current) {
                // Find the true unique content by comparing with our tracked full text
                // This handles cases where the input contains duplicates

    // First check if we're just seeing the same content repeated
                if (input.includes(fullTextRef.current)) {
                    const uniqueNewContent = input.slice(fullTextRef.current.length);

    // Only add if there's actual new content
                    if (uniqueNewContent.length > 0) {
                        tokensWithSources.current.push({
                            text: uniqueNewContent,
                            source: tokensWithSources.current.length
                        });

    // Update our full text tracking
                        fullTextRef.current = input;
                    }
                } else {
                    // Handle case when input completely changes
                    // Just take the whole thing as a new token
                    tokensWithSources.current = [{
                        text: input,
                        source: 0
                    }];
                    fullTextRef.current = input;
                }
            }

    // Return the tokensWithSources directly
            return tokensWithSources.current;
        }

    // Original word/char splitting logic
        let splitRegex;
        if (sep === 'word') {
            splitRegex = /(\s+)/;
        } else if (sep === 'char') {
            splitRegex = /(.)/;
        } else {
            throw new Error('Invalid separator: must be "word", "char", or "diff"');
        }

    return input.split(splitRegex).filter(token => token.length > 0);
    }, [input, sep]);

    // Update previous input after processing
    useEffect(() => {
        if (typeof input === 'string') {
            prevInputRef.current = input;
        }
    }, [input]);

    // Helper function to check if token is a TokenWithSource type
    const isTokenWithSource = (token: TokenType): token is TokenWithSource => {
        return token !== null && typeof token === 'object' && 'text' in token && 'source' in token;
    };

    return (
        <>
            {tokens?.map((token, index) => {
                // Determine the key and text based on token type
                let key = index;
                let text = '';

    if (isTokenWithSource(token)) {
                    key = token.source;
                    text = token.text;
                } else if (typeof token === 'string') {
                    key = index;
                    text = token;
                } else if (React.isValidElement(token)) {
                    key = index;
                    text = '';
                    return React.cloneElement(token, { key });
                }

    return (
                    <span key={key} style={{
                        animationName: animation,
                        animationDuration,
                        animationTimingFunction,
                        animationIterationCount,
                        whiteSpace: 'pre-wrap',
                        display: 'inline-block',
                    }}>
                        {text}
                  
                );
            })}
        </>
    );
};

export default TokenizedText;

================================================
FILE: src/utils/animations.ts
=============================

export const animations = {
    fadeIn: 'ft-fadeIn',
    slideUp: 'ft-slideUp',
    wave: 'ft-wave',
    elastic: 'ft-elastic',
    bounceIn: 'ft-bounceIn',
    rotateIn: 'ft-rotateIn',
    colorTransition: 'ft-colorTransition',
    fadeAndScale: 'ft-fadeAndScale',
    slideInFromLeft: 'ft-slideInFromLeft',
    blurIn: 'ft-blurIn',
    typewriter: 'ft-typewriter',
    highlight: 'ft-highlight',
    blurAndSharpen: 'ft-blurAndSharpen',
    dropIn: 'ft-dropIn'
}

================================================
FILE: stories/Controls.tsx
==========================

import React from 'react';

interface Controls {
    animation: string;
    sep: string;
    windowSize: number;
    delayMultiplier: number;
    animationDuration: number;
    animationTimingFunction: string;
    simulateNetworkIssue: boolean;
    generationSpeed: number;
}

const Controls = ({ controls, setControls }: { controls: Controls, setControls: React.Dispatch<React.SetStateAction`<Controls>`> }) => {
    const { animation, sep, windowSize, delayMultiplier, animationDuration, animationTimingFunction
     } = controls;

    const handleAnimationChange = (e: React.ChangeEvent`<HTMLSelectElement>`) => {
        setControls({ ...controls, animation: e.target.value });
    };

    const handleSepChange = (e: React.ChangeEvent`<HTMLSelectElement>`) => {
        setControls({ ...controls, sep: e.target.value });
    };

    const handleWindowSizeChange = (e: React.ChangeEvent`<HTMLInputElement>`) => {
        setControls({ ...controls, windowSize: parseInt(e.target.value) });
    };

    const handleDelayMultiplierChange = (e: React.ChangeEvent`<HTMLInputElement>`) => {
        setControls({ ...controls, delayMultiplier: parseFloat(e.target.value) });
    };

    const handleAnimationDurationChange = (e: React.ChangeEvent`<HTMLInputElement>`) => {
        setControls({ ...controls, animationDuration: parseFloat(e.target.value) });
    };

    const handleAnimationTimingFunctionChange = (e: React.ChangeEvent`<HTMLSelectElement>`) => {
        setControls({ ...controls, animationTimingFunction: e.target.value });
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            <label style={{ marginRight: '1rem' }}>
                Animation:
                <select value={animation} onChange={handleAnimationChange}>`<option value="none">`None`</option>`
                    `<option value="fadeIn">`Fade In`</option>`
                    `<option value="blurIn">`Blur In`</option>`
                    `<option value="slideInFromLeft">`Slide In From Left`</option>`
                    `<option value="fadeAndScale">`Fade and Scale`</option>`
                    `<option value="colorTransition">`Color Transition`</option>`
                    `<option value="rotateIn">`Rotate In`</option>`
                    `<option value="bounceIn">`Bounce In`</option>`
                    `<option value="elastic">`Elastic`</option>`
                    `<option value="highlight">`Highlight`</option>`
                    `<option value="blurAndSharpen">`Blur and Sharpen`</option>`
                    `<option value="wave">`Wave`</option>`
                    `<option value="dropIn">`Drop In`</option>`
                    `<option value="slideUp">`Slide Up`</option>`
                `</select>`
            `</label>`
            <label style={{ marginRight: '1rem' }}>
                Separator:
                <select value={sep} onChange={handleSepChange}>
                    `<option value="word">`Word`</option>`
                    `<option value="char">`Character`</option>`
                `</select>`
            `</label>`
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Window Size:
                <input type="number" value={windowSize} onChange={handleWindowSizeChange} />
            `</label>`
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Delay Multiplier:
                <input type="number" value={delayMultiplier} onChange={handleDelayMultiplierChange} />
            `</label>`
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Animation Duration:
                <input type="text" value={animationDuration} onChange={handleAnimationDurationChange} />
            `</label>`
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Animation Timing Function:
                <select value={animationTimingFunction} onChange={handleAnimationTimingFunctionChange}>
                    `<option value="ease-in-out">`Ease In Out`</option>`
                    `<option value="ease-in">`Ease In`</option>`
                    `<option value="ease-out">`Ease Out`</option>`
                    `<option value="linear">`Linear`</option>`
                `</select>`
            `</label>`
        `</div>`
    );
}

export default Controls;

================================================
FILE: stories/ExampleCustomComponent.tsx
========================================

import React from 'react';

const CustomComponent = ({ content }: { content: string }) => {
    const removedBraces = content.replace(/{{|}}/g, '');
    const timeoutRef = React.useRef<NodeJS.Timeout>();

    const handleMouseEnter = (e: React.MouseEvent`<HTMLDivElement>`) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        const div = e.currentTarget;
        div.classList.remove('invisible');
        div.classList.add('visible');
    };

    const handleMouseLeave = (e: React.MouseEvent`<HTMLDivElement>`) => {
        const div = e.currentTarget;
        timeoutRef.current = setTimeout(() => {
            div.classList.remove('visible');
            div.classList.add('invisible');
        }, 200); // 200ms delay before hiding
    };

    return (
        <span
            className="text-red-500 bg-gray-100 p-1 rounded-md inline-block relative group cursor-help"
            title={`Learn more about "${removedBraces}"`}
        >
            {removedBraces}
            `<div 
                className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-2 text-sm bg-white border rounded shadow-lg transition-all duration-200"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >`
                <a
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(removedBraces)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                >
                    View on Wikipedia
                `</a>`
                `<p className="mt-1 text-gray-600">`Click to learn more about this term on Wikipedia`</p>`
            `</div>`
      
    );
};

export default CustomComponent;

================================================
FILE: stories/Markdown.stories.tsx
==================================

import React from 'react';
import { text } from './TestMarkdown';
import RandomTextSender from './RandomMarkdownSender';
import CustomComponent from './ExampleCustomComponent';

// This is the default export that defines the component title and other configuration
export default {
    title: 'Components/Markdown',
    component: RandomTextSender,
};

// Here we define a "story" for the default view of SmoothText
export const DefaultMarkdown = () => <RandomTextSender
    initialText={text}
    windowSize={30}
    customComponents={{
        'test': ({ text, content }: any) => {
            return `<CustomComponent content={text} />`;
        },
        'ArticlePreview': ({ title, description }: any) => {
            console.log('title', title);
            return `<div>`
                `<h3>`{title}`</h3>`
                `<p>`{description}`</p>`
            `</div>`;
        }
    }}
/>;

================================================
FILE: stories/RandomMarkdownSender.tsx
======================================

import React, { useState, useEffect } from 'react';
import AnimatedMarkdown from '../src/components/AnimatedMarkdown';
import '../src/styles.css';
import Controls from './Controls';

interface RandomTextSenderProps {
    initialText: string;
    windowSize: number;  // Propagate this to SmoothText for consistency
    animation?: string;  // Animation name
    sep?: string;  // Token separator
    customComponents: { [key: string]: ({ content }: { content: string }) => React.ReactNode };
    htmlComponents?: { [key: string]: ({ content }: { content: string }) => React.ReactNode };
}

const RandomTextSender: React.FC`<RandomTextSenderProps>` = ({ initialText, customComponents, htmlComponents={} }) => {
    const [currentText, setCurrentText] = useState('');
    const [remainingTokens, setRemainingTokens] = useState<string[]>([]);
    const [baseLatency, setBaseLatency] = useState`<number>`(10);
    const [tokenCount, setTokenCount] = useState`<number>`(0);
    const [controls, setControls] = useState({
        animation: "fadeIn",
        sep: "word",
        windowSize: 5,
        delayMultiplier: 1.4,
        animationDuration: 0.6,
        animationTimingFunction: "ease-in-out",
        generationSpeed: 3,
        simulateNetworkIssue: false
    });
    const [slowSection, setSlowSection] = useState`<boolean>`(false);
    const [numId, setNumId] = useState`<number>`(0);
    // console.log('Controls:', controls);
    useEffect(() => {
        let extra = 0;
        if (tokenCount > 0 && tokenCount % 5 === 0 && controls.simulateNetworkIssue) {
            extra = (Math.random() > 0.5 ? 400 : 0); // Randomly choose between 200ms and 800m
        }
        const newBaseLatency = 1000 / controls.generationSpeed + extra
        setBaseLatency(newBaseLatency);
        setSlowSection(extra > 0);
    }, [tokenCount, controls]);

    useEffect(() => {
        //reset the text when the animation changes
        setNumId((prev) => prev + 1);
    }, [controls]);

    // Function to send a token at random intervals
    useEffect(() => {
        if (remainingTokens.length > 0) {
            // Jitter is up to 100ms more based on windowSize (unused)
            const jitter = Math.random() * 5;
            const networkDelay = baseLatency + jitter;

    const timeout = setTimeout(() => {
                const nextToken = remainingTokens[0];
                setCurrentText(prev => prev ?`${prev} ${nextToken}` : nextToken);
                setRemainingTokens(prev => prev.slice(1));
                setTokenCount(prev => prev + 1); // Increment token count
            }, networkDelay);

    return () => clearTimeout(timeout);
        } else {
            // reset the text when the animation changes
            setTimeout(() => {
                setNumId((prev) => prev + 1);
            }, 1000);
        }
    }, [remainingTokens, baseLatency]);

    // Initialize the tokens
    useEffect(() => {
        setRemainingTokens(initialText.split(' ')); // Assuming space-separated tokens
        setCurrentText('');
        setTokenCount(0);
    }, [initialText, numId]);

    const animationDurationString =`${controls.animationDuration}s`;
    return (
        `<div className="flex flex-col md:flex-row justify-start items-start w-full gap-16">`
            `<div className="w-full max-w-80">`
                `<h1 className="text-3xl font-bold">`FlowToken`</h1>`
                `<div className="mb-4">`
                    `<span className="text-xs mb-4 text-gray-500 mr-2">`In development
                    `<a href="https://github.com/Backless-AI/flowtoken" className="text-xs text-blue-500">`Github`</a>`
                `</div>`
                `<p className="text-sm mb-4">`FlowToken is a text visualization library to animate and smooth streaming LLM token generation.`</p>`
                <Controls controls={controls} setControls={setControls} />
                `<div className="h-10 text-red-500">`
                    {slowSection && `<p>`Simulated Network Issue`</p>`}
                `</div>`
            `</div>`
            <div className="text-sm w-1/2 prose lg:prose-md prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent" style={{ height: '3000px'}}>
                {currentText.length > 0 &&
                    <AnimatedMarkdown content={currentText} animation={controls.animation === 'none' ? undefined : controls.animation} sep={controls.sep} animationDuration={animationDurationString} animationTimingFunction={controls.animationTimingFunction} customComponents={customComponents} htmlComponents={htmlComponents}/>
    }`</div>`
        `</div>`
    );
};

export default RandomTextSender;

================================================
FILE: stories/tailwind.css
==========================

@tailwind base;
@tailwind components;
@tailwind utilities;

================================================
FILE: stories/TestMarkdown.ts
=============================

export const text = `

# Main Heading(H1)

![Alt](https://placehold.co/150)

## Subheading(H2)

### Another Subheading(H3)

*Regular* text is `<test text="hello" />` just written as plain text. You can add **bold** text, *italic* text, and even ***bold italic*** text.

You can also create hyperlinks: [OpenAI](https://www.openai.com)

---

### Lists

#### Unordered List

- Item 1 and some *more*
- Item 2
  - Subitem 2.1
  - Subitem 2.2
- Item 3

#### Ordered List

1. First Item
2. Second Item
3. Third Item

---

### Code

\`Inline code\` with backticks.

\`\`\`python

# Python code block

def hello_world():
    print("Hello, world!")
\`\`\`

### Blockquotes

> This is a blockquote.
>
> This is part of the same quote.

### Tables

A table:

| a | b |
| - | - |
| 1 | 2 |
| 3 | 4 |

---

### Images

![Alt Text](https://via.placeholder.com/150 "Image Title")

### Horizontal Rule

---

### Task List

- [X] Task 1 completed
- [ ] Task 2 not completed
- [ ] Task 3 not completed
  `

================================================
FILE: stories/Text.stories.tsx
==============================

import React, { useState, useEffect } from 'react';
import StreamingFadeInText from '../src/components/AnimatedText';

interface RandomTextSenderProps {
    initialText: string;
    windowSize: number;  // Propagate this to SmoothText for consistency
    animation?: string;  // Animation name
    sep?: string;  // Token separator
}

const RandomTextSender: React.FC`<RandomTextSenderProps>` = ({ initialText, windowSize, animation, sep }) => {
    const [currentText, setCurrentText] = useState('');
    const [remainingTokens, setRemainingTokens] = useState<string[]>([]);
    const [baseLatency, setBaseLatency] = useState`<number>`(100);
    const [tokenCount, setTokenCount] = useState`<number>`(0);

    // Initialize the tokens
    useEffect(() => {
        setRemainingTokens(initialText.split(' ')); // Assuming space-separated tokens
    }, [initialText]);

    // Update base latency every 10 tokens
    useEffect(() => {
        if (tokenCount > 0 && tokenCount % 10 === 0) {
            const newBaseLatency = baseLatency + (Math.random() > 0.5 ? 20 : 0); // Randomly choose between 200ms and 800ms
            setBaseLatency(newBaseLatency);
            console.log(`Base latency updated to: ${newBaseLatency}ms`);
        }
    }, [tokenCount]);

    // Function to send a token at random intervals
    useEffect(() => {
        if (remainingTokens.length > 0) {
            // Jitter is up to 100ms more based on windowSize (unused)
            const jitter = Math.random() * 10;
            const networkDelay = baseLatency + jitter;

    const timeout = setTimeout(() => {
                const nextToken = remainingTokens[0];
                setCurrentText(prev => prev ?`${prev} ${nextToken}` : nextToken);
                setRemainingTokens(prev => prev.slice(1));
                setTokenCount(prev => prev + 1); // Increment token count
            }, networkDelay);

    return () => clearTimeout(timeout);
        }
    }, [remainingTokens, baseLatency, windowSize]);

    return (`<div>`
            {/* `<FadeInExample />` */}
            <StreamingFadeInText incomingText={currentText} animation={animation} sep={sep} />
            {/* <div style={{ marginTop: '1rem' }}>
                {currentText}
            `</div>` */}
        `</div>`
    );
};

// This is the default export that defines the component title and other configuration
export default {
    title: 'Components/FadeIn',
    component: RandomTextSender,
};

const text = `To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer The slings and arrows of outrageous fortune, Or to take arms against a sea of troubles And by opposing end them. To die—to sleep, No more; and by a sleep to say we end The heart-ache and the thousand natural shocks That flesh is heir to: 'tis a consummation Devoutly to be wish'd. To die, to sleep; To sleep, perchance to dream—ay, there's the rub: For in that sleep of death what dreams may come, When we have shuffled off this mortal coil, Must give us pause—there's the respect That makes calamity of so long life. For who would bear the whips and scorns of time, Th'oppressor's wrong, the proud man's contumely, The pangs of dispriz'd love, the law's delay, The insolence of office, and the spurns That patient merit of th'unworthy takes, When he himself might his quietus make With a bare bodkin? Who would fardels bear, To grunt and sweat under a weary life, But that the dread of something after death, The undiscovere'd country, from whose bourn No traveller returns, puzzles the will, And makes us rather bear those ills we have Than fly to others that we know not of? Thus conscience doth make cowards of us all, And thus the native hue of resolution Is sicklied o'er with the pale cast of thought, And enterprises of great pith and moment With this regard their currents turn awry And lose the name of action. `

// Here we define a "story" for the default view of SmoothText
export const Default = () => <RandomTextSender initialText={text} windowSize={30} />;
export const DefaultChar = () => <RandomTextSender initialText={text} windowSize={30} sep="char" />;

// You can add more stories to showcase different props or states
export const fadeIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeIn"} />;
export const AllAtOnceFadeIn = () => <StreamingFadeInText incomingText={text} animation={"fadeIn"} />;

export const blurIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurIn"} />;
export const blurInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurIn"} sep="char" />;

// export const typewriter = () => <RandomTextSender initialText={text} windowSize={30} animation={"typewriter"} sep="char" />;

export const slideInFromLeft = () => <RandomTextSender initialText={text} windowSize={30} animation={"slideInFromLeft"} />;
export const slideInFromLeftChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"slideInFromLeft"} sep="char" />;

export const fadeAndScale = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeAndScale"} />;
export const fadeAndScaleChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeAndScale"} sep="char" />;

export const colorTransition = () => <RandomTextSender initialText={text} windowSize={30} animation={"colorTransition"} />;

export const rotateIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"rotateIn"} />;
export const rotateInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"rotateIn"} sep="char" />;

export const bounceIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"bounceIn"} />;
export const bounceInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"bounceIn"} sep="char" />;

export const elastic = () => <RandomTextSender initialText={text} windowSize={30} animation={"elastic"} />;
export const elasticChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"elastic"} sep="char" />;

export const highlight = () => <RandomTextSender initialText={text} windowSize={30} animation={"highlight"} />;
export const highlightChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"highlight"} sep="char" />;

export const blurAndSharpen = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurAndSharpen"} />;

export const wave = () => <RandomTextSender initialText={text} windowSize={30} animation={"wave"} />;
export const waveChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"wave"} sep="char" />;

export const dropIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"dropIn"} />;
export const dropInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"dropIn"} sep="char" />;

================================================
FILE: .storybook/main.ts
========================

import type { StorybookConfig } from "@storybook/react-webpack5";

const config: StorybookConfig = {
  stories: ["../**/*.mdx", "../**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-webpack5-compiler-swc",
    {
      name: '@storybook/addon-postcss',
      options: {
        cssLoaderOptions: {
          // When you have splitted your css over multiple files
          // and use @import('./other-styles.css')
          importLoaders: 1,
        },
        postcssLoaderOptions: {
          // When using postCSS 8
          implementation: require('postcss'),
          postcssOptions: {
            plugins: [
              require('tailwindcss'),
              require('autoprefixer')
            ],
          },
        },
      },
    },
    "@storybook/addon-onboarding",
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
    "@storybook/addon-styling-webpack"
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
};
export default config;

================================================
FILE: .storybook/preview.ts
===========================

import type { Preview } from "@storybook/react";
import '../stories/tailwind.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
