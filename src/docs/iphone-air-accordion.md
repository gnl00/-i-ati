# iphone-air-accordion

Directory structure:
└── dimicx-iphone-air-accordion/
    ├── README.md
    ├── eslint.config.mjs
    ├── next.config.ts
    ├── package.json
    ├── postcss.config.mjs
    ├── tsconfig.json
    └── app/
        ├── data.ts
        ├── globals.css
        ├── icons.tsx
        ├── layout.tsx
        └── page.tsx

================================================
FILE: README.md
================================================
## accordion rebuild from the apple website iphone air page

https://github.com/user-attachments/assets/1eabdfa5-79fb-42ad-bb22-33a6fb3ac617



================================================
FILE: eslint.config.mjs
================================================
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;



================================================
FILE: next.config.ts
================================================
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;



================================================
FILE: package.json
================================================
{
  "name": "iphone-air-accordion",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-radio-group": "^1.3.8",
    "motion": "^12.23.12",
    "next": "15.5.2",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-use-measure": "^2.1.7"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "15.5.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}



================================================
FILE: postcss.config.mjs
================================================
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;



================================================
FILE: tsconfig.json
================================================
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}



================================================
FILE: app/data.ts
================================================
export type AccordionItemType = {
  id: string;
  title: string;
  description: string;
  imagePath?: string;
  colors?: { name: string; code: string }[];
};

export const data: AccordionItemType[] = [
  {
    id: "colours",
    title: "Colours",
    description: "Available in four breathtaking colours. iPhone Air shown in",
    colors: [
      {
        name: "Sky Blue",
        code: "#edf8ff",
      },
      {
        name: "Light Gold",
        code: "#fffcf2",
      },
      {
        name: "Cloud White",
        code: "#ffffff",
      },
      {
        name: "Space Black",
        code: "#000000",
      },
    ],
  },
  {
    id: "titanium-frame",
    title: "Titanium frame",
    description:
      "A Grade 5 titanium frame built with 80 per cent recycled titanium makes iPhone Air as strong as it is stunning.",
  },
  {
    id: "innovative-internal-design",
    title: "Innovative internal design",
    description:
      "Multiple technologies are housed in the plateau of iPhone Air, maximising performance and creating space for a large, high‑density battery.",
    imagePath: "/images/internal-design.jpg",
  },
  {
    id: "immersive-pro-display",
    title: "Immersive pro display",
    description:
      "6.5‑inch Super Retina XDR display — our best ever.4 3,000 nits peak brightness. ProMotion up to 120Hz. And better anti‑reflection.",
  },
  {
    id: "ceramic-shield",
    title: "Ceramic Shield",
    description:
      "Protects the back of iPhone Air, making it 4x more resistant to cracks. New Ceramic Shield on the front has 3x better scratch resistance.",
  },
  {
    id: "camera-control",
    title: "Camera Control",
    description:
      "Instantly take a photo, record video, adjust settings and more. So you never miss a moment.",
  },
  {
    id: "action-button",
    title: "Action button",
    description:
      "A customisable fast track to your favourite feature. Long press to launch the action you want — Silent mode, Translation, Shortcuts and more.",
  },
  {
    id: "acces­sories",
    title: "Acces­sories",
    description:
      "The new Crossbody Strap lets you wear your iPhone Air hands‑free so you can go with the float.",
  },
] as const;



================================================
FILE: app/globals.css
================================================
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #1D1D1F;
  --background-alt: #F5F5F7;
  --background-gray: #e8e8edb8;

  --radius-lg: 28px;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-background-alt: var(--background-alt);
  --color-background-gray: var(--background-gray);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --shadow-custom: inset 0 0 .5px 0 rgba(0,0,0,.11);

  --radius-lg: var(--radius-lg);

  --breakpoint-2xl: 1440px;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}



================================================
FILE: app/icons.tsx
================================================
export function Caret({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      width="36px"
      height="36px"
      stroke="none"
      fill="currentColor"
      className={className}
    >
      <path d="m19.0625 22.5597 5.5-5.5076c.5854-.5854.5825-1.5323-.0039-2.1157-.5869-.5835-1.5366-.5815-2.1211.0039l-4.4375 4.4438-4.4375-4.4438c-.5845-.5854-1.5342-.5874-2.1211-.0039-.2944.2922-.4414.676-.4414 1.0598 0 .3818.1455.7637.4375 1.0559l5.5 5.5076c.2813.2815.6636.4403 1.0625.4403s.7812-.1588 1.0625-.4403z"></path>
    </svg>
  );
}

export function Plus() {
  return (
    <svg
      width="24px"
      height="24px"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="11.3"
        fill="none"
        stroke="currentColor"
      ></circle>
      <g transform="translate(7 7)" stroke="none" fill="currentColor">
        <path d="m9 4h-3v-3c0-0.553-0.447-1-1-1s-1 0.447-1 1v3h-3c-0.553 0-1 0.447-1 1s0.447 1 1 1h3v3c0 0.553 0.447 1 1 1s1-0.447 1-1v-3h3c0.553 0 1-0.447 1-1s-0.447-1-1-1"></path>
      </g>
    </svg>
  );
}

export function XMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      width="36px"
      height="36px"
      fill="currentColor"
      stroke="none"
    >
      <path d="m20.1211 18 3.4395-3.4395c.5859-.5854.5859-1.5356 0-2.1211-.5859-.5859-1.5352-.5859-2.1211 0l-3.4395 3.4395-3.4395-3.4395c-.5859-.5859-1.5352-.5859-2.1211 0-.5859.5854-.5859 1.5356 0 2.1211l3.4395 3.4395-3.4395 3.4395c-.5859.5854-.5859 1.5356 0 2.1211.293.293.6768.4395 1.0605.4395s.7676-.1465 1.0605-.4395l3.4395-3.4395 3.4395 3.4395c.293.293.6768.4395 1.0605.4395s.7676-.1465 1.0605-.4395c.5859-.5854.5859-1.5356 0-2.1211l-3.4395-3.4395z"></path>
    </svg>
  );
}



================================================
FILE: app/layout.tsx
================================================
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}



================================================
FILE: app/page.tsx
================================================
"use client";

import { useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { AnimatePresence, motion, MotionConfig, stagger } from "motion/react";
import useMeasure from "react-use-measure";
import Image from "next/image";
import { AccordionItemType, data } from "./data";
import { XMark, Caret, Plus } from "./icons";

export default function Home() {
  const [value, setValue] = useState<string>("");

  return (
    <MotionConfig
      transition={{
        type: "spring",
        stiffness: 800,
        damping: 80,
        mass: 4,
      }}
    >
      <main className="font-sans flex flex-col justify-center items-center min-h-screen bg-background-alt">
        <div className="relative h-[760px] w-full max-w-screen-2xl bg-background 2xl:rounded-lg flex flex-col justify-center overflow-hidden">
          <CloseButton value={value} setValue={setValue} />
          <AccordionControls value={value} setValue={setValue} />
          <Accordion.Root
            type="single"
            value={value}
            onValueChange={setValue}
            className="ml-[min(90px,6.25vw)] flex flex-col justify-center items-start gap-3"
          >
            {data.map((item) => (
              <AccordionItem
                key={item.id}
                item={item}
                isOpen={value === item.id}
                value={item.id}
                setValue={setValue}
              />
            ))}
          </Accordion.Root>
        </div>
      </main>
    </MotionConfig>
  );
}

type CloseButtonProps = {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
};

function CloseButton({ value, setValue }: CloseButtonProps) {
  return (
    <AnimatePresence initial={false}>
      {value !== "" && (
        <motion.div
          initial={{
            opacity: 0,
            transform: "translateY(86px) scale(0)",
          }}
          animate={{
            opacity: 1,
            transform: "translateY(0px) scale(1)",
          }}
          exit={{
            opacity: 0,
            transform: "translateY(86px) scale(0)",
          }}
          className="absolute top-4 right-4"
        >
          <button
            onClick={() => setValue("")}
            className="cursor-pointer rounded-full size-9 bg-background-gray flex items-center justify-center"
          >
            <span className="sr-only">Close</span>
            <XMark />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type AccordionControlsProps = {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
};

const buttonVariants = {
  hidden: {
    opacity: 0,
    transform: "translateY(86px) scale(0)",
  },
  visible: {
    opacity: 1,
    transform: "translateY(0px) scale(1)",
  },
};

function AccordionControls({ value, setValue }: AccordionControlsProps) {
  const currentIndex = data.findIndex((item) => item.id === value);
  const nextIndex = currentIndex + 1;
  const previousIndex = currentIndex - 1;

  return (
    <motion.div
      initial="hidden"
      animate={value === "" ? "hidden" : "visible"}
      variants={{
        hidden: {
          transition: {
            delayChildren: stagger(0.025, { from: "last" }),
          },
        },
        visible: {
          transition: {
            delayChildren: stagger(0.025),
          },
        },
      }}
      className="absolute top-0 left-0 bottom-0 w-[min(90px,6.25vw)] flex flex-col justify-center items-center gap-5"
    >
      <motion.div variants={buttonVariants}>
        <button
          disabled={value === data[0].id}
          onClick={() => setValue(data[previousIndex].id)}
          className="cursor-pointer rounded-full size-9 bg-background-gray flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-100"
        >
          <span className="sr-only">Previous</span>
          <Caret className="rotate-180 size-10" />
        </button>
      </motion.div>
      <motion.div variants={buttonVariants}>
        <button
          disabled={value === data[data.length - 1].id}
          onClick={() => setValue(data[nextIndex].id)}
          className="cursor-pointer rounded-full size-9 bg-background-gray flex items-center justify-center  disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-100"
        >
          <span className="sr-only">Next</span>
          <Caret />
        </button>
      </motion.div>
    </motion.div>
  );
}

type AccordionItemProps = {
  item: AccordionItemType;
  isOpen: boolean;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
};

function AccordionItem({ item, isOpen, setValue, value }: AccordionItemProps) {
  const [buttonRef, { width: buttonWidth }] = useMeasure();
  const [selectedColor, setSelectedColor] = useState<{
    name: string;
    code: string;
  } | null>(data.find((item) => item.id === "colours")?.colors?.[0] ?? null);

  return (
    <Accordion.Item asChild value={value}>
      <motion.div
        style={{
          borderRadius: 28,
        }}
        animate={
          buttonWidth
            ? {
                width: isOpen ? 423 : buttonWidth,
                height: isOpen ? "auto" : 56,
              }
            : {}
        }
        className="bg-background-gray w-fit relative overflow-hidden shadow-custom"
      >
        <Accordion.Header asChild>
          <Accordion.Trigger asChild>
            <motion.button
              ref={buttonRef}
              className="h-14 pl-3.5 pr-8 text-[17px] cursor-pointer font-semibold tracking-[-0.022em] leading-[1.2] flex items-center gap-3.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 whitespace-nowrap"
              onClick={() => setValue(isOpen ? "" : value)}
              style={{
                borderRadius: 28,
                pointerEvents: isOpen ? "none" : "auto",
              }}
              animate={{
                opacity: isOpen ? 0 : 1,
              }}
              initial={{
                opacity: 1,
              }}
              transition={{
                duration: isOpen ? 0.1 : 0.5,
                delay: isOpen ? 0 : 0.32,
              }}
            >
              {item.id === "colours" ? (
                <div
                  className="size-6 rounded-full inset-shadow-2xs inset-shadow-black/40"
                  style={{
                    backgroundColor: selectedColor?.code,
                  }}
                />
              ) : (
                <Plus />
              )}
              <span>{item.title}</span>
            </motion.button>
          </Accordion.Trigger>
        </Accordion.Header>

        <AnimatePresence initial={false}>
          {isOpen && (
            <Accordion.Content forceMount asChild>
              <motion.div
                style={{
                  borderRadius: 28,
                }}
                className="w-[423px] h-full -mt-14 flex flex-col justify-end"
                initial="closed"
                animate="open"
                exit="closed"
              >
                <motion.div
                  variants={{
                    open: {
                      opacity: 1,
                      transform: "translateY(0px)",
                      transition: {
                        delay: 0.32,
                        duration: 0.5,
                        transform: {
                          duration: 0,
                        },
                      },
                    },
                    closed: {
                      opacity: 0,
                      transform: "translateY(24px)",
                      transition: {
                        delay: 0,
                        duration: 0.32,
                      },
                    },
                  }}
                  className="h-full flex flex-col justify-between"
                >
                  <p className="p-[28px] text-[17px] tracking-[-0.022em]">
                    <span className="font-semibold">{item.title}. </span>
                    {item.description}
                    {item.id === "colours" && `  ${selectedColor?.name}.`}
                  </p>
                  {item.imagePath && (
                    <motion.div className="relative w-full aspect-video">
                      <Image
                        src={item.imagePath}
                        alt={item.title}
                        fill
                        sizes="423px"
                        className="object-cover"
                        draggable={false}
                      />
                    </motion.div>
                  )}
                  {item.id === "colours" && (
                    <RadioGroup.Root
                      value={selectedColor?.name}
                      onValueChange={(value) =>
                        setSelectedColor(
                          item.colors?.find((color) => color.name === value) ??
                            null
                        )
                      }
                      className="flex gap-3.5 justify-center items-center pb-[28px]"
                    >
                      {item.colors?.map((color) => (
                        <RadioGroup.Item
                          key={color.name}
                          value={color.name}
                          className="size-6 rounded-full inset-shadow-xs inset-shadow-black/40 outline-2 outline-transparent data-[state=checked]:outline-foreground outline-offset-2 cursor-pointer"
                          style={{ backgroundColor: color.code }}
                        />
                      ))}
                    </RadioGroup.Root>
                  )}
                </motion.div>
              </motion.div>
            </Accordion.Content>
          )}
        </AnimatePresence>
      </motion.div>
    </Accordion.Item>
  );
}